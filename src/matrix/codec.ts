// Wire format for carrying Yjs updates through Matrix events.
//
// Pipeline: Yjs v2 update -> deflate-raw -> base64 -> chunks.
//
// Matrix caps a whole signed event (auth_events, prev_events, hashes,
// signatures, unsigned - not just content) at 65536 bytes, so we budget
// conservatively and split anything larger across multiple events.

export const UPDATE_EVENT_TYPE = "de.minagawa.ultimate_lists.update";
export const SNAPSHOT_EVENT_TYPE = "de.minagawa.ultimate_lists.snapshot";

/** state_key of the snapshot index; chunks live at "c0", "c1", ... */
export const SNAPSHOT_INDEX_KEY = "";
export const SNAPSHOT_CHUNK_PREFIX = "c";

export const WIRE_VERSION = 1;

/** Post-compression bytes per event: 24 KiB -> 32 KiB base64 -> ~34 KB event. */
export const CHUNK_RAW_BYTES = 24 * 1024;

/** Ceiling on chunks per logical message; also caps hostile memory amplification. */
export const MAX_CHUNKS_PER_MESSAGE = 16;

/** Reject any base64 string larger than this before attempting to decode it. */
export const MAX_BASE64_LENGTH = 64 * 1024;

export const MAX_PAYLOAD_BYTES = CHUNK_RAW_BYTES * MAX_CHUNKS_PER_MESSAGE;

export type Encoding = "yv2+deflate+b64" | "yv2+b64";

export interface ChunkContent {
    v: number;
    enc: Encoding;
    /** logical message id; groups chunks of one update together */
    msg: string;
    /** chunk index and count; both omitted when the message is a single chunk */
    i?: number;
    n?: number;
    /** base64 slice of the compressed payload */
    b: string;
    /** total compressed length, pre-base64 */
    len: number;
    /** truncated sha-256 of the whole compressed payload */
    h: string;
}

// ----- base64 -----

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const STEP = 0x8000; // avoid blowing the argument limit on large payloads
    for (let i = 0; i < bytes.length; i += STEP) {
        binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
    }
    return btoa(binary);
}

/** Strict base64 decode. Returns null rather than throwing on hostile input. */
export function base64ToBytes(value: unknown): Uint8Array | null {
    if (typeof value !== "string") return null;
    if (value.length === 0 || value.length > MAX_BASE64_LENGTH) return null;
    if (value.length % 4 !== 0) return null;
    if (!BASE64_RE.test(value)) return null;

    try {
        const binary = atob(value);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

// ----- compression -----

const hasCompressionStream = typeof globalThis.CompressionStream === "function"
    && typeof globalThis.DecompressionStream === "function";

export const PREFERRED_ENCODING: Encoding = hasCompressionStream ? "yv2+deflate+b64" : "yv2+b64";

async function streamThrough(bytes: Uint8Array, stream: unknown): Promise<Uint8Array> {
    const blob = new Blob([bytes as BlobPart]);
    const piped = blob.stream().pipeThrough(stream as ReadableWritablePair<any, any>);
    const buffer = await new Response(piped as unknown as BodyInit).arrayBuffer();
    return new Uint8Array(buffer);
}

export async function compress(bytes: Uint8Array): Promise<Uint8Array> {
    if (!hasCompressionStream) return bytes;
    return streamThrough(bytes, new CompressionStream("deflate-raw"));
}

export async function decompress(bytes: Uint8Array, encoding: Encoding): Promise<Uint8Array> {
    if (encoding === "yv2+b64") return bytes;
    if (!hasCompressionStream) throw new Error("deflate-raw not supported by this browser");
    return streamThrough(bytes, new DecompressionStream("deflate-raw"));
}

// ----- integrity -----

/** Truncated sha-256, base64. Detects torn or corrupted multi-chunk payloads. */
export async function digest(bytes: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
    return bytesToBase64(new Uint8Array(hash).subarray(0, 16));
}

// ----- encode -----

let messageCounter = 0;

function newMessageId(): string {
    // unique per sender; ordering comes from explicit chunk indices, not this
    messageCounter = (messageCounter + 1) % 0xffff;
    return `${Date.now().toString(36)}-${messageCounter.toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

/**
 * Encode a Yjs update into one or more event contents.
 * Throws if the payload exceeds MAX_CHUNKS_PER_MESSAGE (caller should snapshot instead).
 */
export async function encodeUpdate(
    update: Uint8Array,
    chunkBytes: number = CHUNK_RAW_BYTES,
): Promise<ChunkContent[]> {
    const compressed = await compress(update);
    const maxPayload = chunkBytes * MAX_CHUNKS_PER_MESSAGE;
    if (compressed.length > maxPayload) {
        throw new Error(`payload ${compressed.length}B exceeds ${maxPayload}B`);
    }

    const h = await digest(compressed);
    const msg = newMessageId();
    const parts: ChunkContent[] = [];

    for (let offset = 0; offset < compressed.length; offset += chunkBytes) {
        const slice = compressed.subarray(offset, Math.min(offset + chunkBytes, compressed.length));
        parts.push({
            v: WIRE_VERSION,
            enc: PREFERRED_ENCODING,
            msg,
            i: parts.length,
            b: bytesToBase64(slice),
            len: compressed.length,
            h,
        });
    }

    if (parts.length === 1) {
        // single-chunk messages omit the index/count entirely
        delete parts[0].i;
    } else {
        for (const part of parts) part.n = parts.length;
    }

    return parts;
}

// ----- decode / reassembly -----

interface PartialMessage {
    n: number;
    len: number;
    h: string;
    enc: Encoding;
    parts: (Uint8Array | undefined)[];
    have: number;
    bytes: number;
    firstSeenAt: number;
}

export const CHUNK_TIMEOUT_MS = 120_000;
const MAX_PARTIAL_MESSAGES = 64;

/**
 * Reassembles chunked updates from a shared room.
 *
 * Everything here is hostile input: any room member can send arbitrary
 * content. Nothing is allocated based on a sender-declared size, incomplete
 * sets expire, and a payload is only released once its hash verifies.
 */
export class ChunkReassembler {
    private partials = new Map<string, PartialMessage>();

    /** Returns the complete compressed payload once all chunks verify, else null. */
    async accept(content: unknown): Promise<{ msg: string; payload: Uint8Array; enc: Encoding } | null> {
        if (typeof content !== "object" || content === null) return null;
        const c = content as Record<string, unknown>;

        if (c.v !== WIRE_VERSION) return null;
        if (c.enc !== "yv2+deflate+b64" && c.enc !== "yv2+b64") return null;
        if (typeof c.msg !== "string" || c.msg.length === 0 || c.msg.length > 128) return null;
        if (typeof c.h !== "string" || c.h.length > 64) return null;
        if (typeof c.b !== "string" || c.b.length > MAX_BASE64_LENGTH) return null;

        const n: number = c.n === undefined ? 1 : (c.n as number);
        const i: number = c.i === undefined ? 0 : (c.i as number);
        if (!Number.isInteger(n) || n < 1 || n > MAX_CHUNKS_PER_MESSAGE) return null;
        if (!Number.isInteger(i) || i < 0 || i >= n) return null;

        const len: number = c.len as number;
        if (!Number.isInteger(len) || len < 1 || len > MAX_PAYLOAD_BYTES) return null;

        const slice = base64ToBytes(c.b);
        if (slice === null) return null;

        // fast path: single-chunk message, no bookkeeping needed
        if (n === 1) {
            if (slice.length !== len) return null;
            if (await digest(slice) !== c.h) return null;
            return { msg: c.msg as string, payload: slice, enc: c.enc as Encoding };
        }

        const msg = c.msg as string;
        const hash = c.h as string;
        const enc = c.enc as Encoding;

        let partial = this.partials.get(msg);
        if (!partial) {
            if (this.partials.size >= MAX_PARTIAL_MESSAGES) this.evictOldest();
            partial = {
                n, len, h: hash, enc,
                // allocation is bounded by MAX_CHUNKS_PER_MESSAGE, not by a declared size
                parts: new Array<Uint8Array | undefined>(n),
                have: 0,
                bytes: 0,
                firstSeenAt: Date.now(),
            };
            this.partials.set(msg, partial);
        }

        // a mismatched set is either a bug or an attack; drop it either way
        if (partial.n !== n || partial.h !== hash || partial.len !== len || partial.enc !== enc) return null;
        if (partial.parts[i] !== undefined) return null; // duplicate index

        partial.parts[i] = slice;
        partial.have++;
        partial.bytes += slice.length;
        if (partial.bytes > partial.len) { this.partials.delete(msg); return null; }
        if (partial.have < partial.n) return null;

        this.partials.delete(msg);

        const payload = new Uint8Array(partial.len);
        let offset = 0;
        for (const part of partial.parts) {
            if (!part) return null;
            if (offset + part.length > partial.len) return null;
            payload.set(part, offset);
            offset += part.length;
        }
        if (offset !== partial.len) return null;
        if (await digest(payload) !== partial.h) return null;

        return { msg, payload, enc: partial.enc };
    }

    private evictOldest() {
        let oldestKey: string | undefined;
        let oldestAt = Infinity;
        for (const [key, p] of this.partials) {
            if (p.firstSeenAt < oldestAt) { oldestAt = p.firstSeenAt; oldestKey = key; }
        }
        if (oldestKey !== undefined) this.partials.delete(oldestKey);
    }

    /** Drop incomplete sets that have aged out. */
    sweep(now = Date.now()) {
        for (const [key, p] of this.partials) {
            if (now - p.firstSeenAt > CHUNK_TIMEOUT_MS) this.partials.delete(key);
        }
    }

    get pendingCount() { return this.partials.size; }
}

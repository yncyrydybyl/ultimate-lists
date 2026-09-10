// Yjs <-> Matrix room transport.
//
// Architecture, after verifying what the widget API actually delivers:
//
//   SOURCE OF TRUTH   de.minagawa.ultimate_lists.snapshot  (room STATE)
//     Sharded across state keys "0".."n-1", one generation at a time.
//     Room state is pushed in full via the update_state action on join, so a
//     cold start is always complete regardless of timeline history.
//
//   LATENCY CHANNEL   de.minagawa.ultimate_lists.update    (room TIMELINE)
//     Best effort only. A widget can read back roughly 20-50 timeline events
//     (Element serves read_events from the in-memory live timeline and never
//     backfills), so timeline data must never be the only copy of anything.
//
// The convergence rule that ties them together: a client whose document
// contains state the published snapshot lacks rewrites the snapshot. Because
// Yjs is a CRDT the rewrite subsumes everything, and the state-vector check
// makes the loop quiesce instead of storming.

import * as Y from "yjs";
import type { IRoomEvent } from "matrix-widget-api";
import {
    UPDATE_EVENT_TYPE, SNAPSHOT_EVENT_TYPE, SNAPSHOT_CHUNK_PREFIX,
    WIRE_VERSION, MAX_CHUNKS_PER_MESSAGE, CHUNK_RAW_BYTES,
    ChunkReassembler, encodeUpdate, compress, decompress, digest,
    base64ToBytes, bytesToBase64, PREFERRED_ENCODING,
    type ChunkContent, type Encoding,
} from "./codec";
import {
    TokenBucket, Lane, retryAfterFrom, isTooLarge, isForbidden, sleep, jitter,
} from "./ratelimit";
import type { WidgetContext } from "./widget";
import { RTC_CHUNK_BYTES, type RtcTransport } from "./rtc";

/** Transaction origin marking updates that came from the room. Never echoed back. */
export const REMOTE_ORIGIN = Symbol("matrix-remote");

// ----- tunables -----

/** Flush interval while the burst allowance is healthy. */
const FLUSH_MIN_MS = 750;
/** Flush interval once we are down to the sustained rate (0.125/s = 62% of the limit). */
const FLUSH_MAX_MS = 8_000;
/** Trailing flush after a typing pause. */
const FLUSH_IDLE_MS = 250;

/** Coalesce inbound events before applying, so a burst costs one render. */
const INBOUND_BATCH_MS = 60;
const INBOUND_BATCH_MS_HIDDEN = 2_000;
const INBOUND_MERGE_THRESHOLD = 4;

/** How long after the last change to consider rewriting the snapshot. */
const SNAPSHOT_DEBOUNCE_MS = 20_000;
/** Floor between two snapshot writes by this client. */
const SNAPSHOT_MIN_INTERVAL_MS = 120_000;

/** Soft/hard ceilings on document size; past the hard one we stop applying. */
const DOC_SOFT_LIMIT_BYTES = 1024 * 1024;
const DOC_HARD_LIMIT_BYTES = 4 * 1024 * 1024;

/** Per-sender inbound allowance. */
const SENDER_BURST = 50;
const SENDER_REFILL_PER_SEC = 2;

const MAX_SEND_ATTEMPTS = 6;

export type SyncStatus = "connecting" | "synced" | "syncing" | "throttled" | "error" | "readonly";

export interface ProviderStats {
    status: SyncStatus;
    pendingLocal: number;
    sentEvents: number;
    receivedEvents: number;
    droppedEvents: number;
    lastError: string | null;
    docBytes: number;
    snapshotGeneration: string | null;
    /** Which path live updates are taking right now. */
    transport: "rtc" | "timeline";
    /** Other participants in the MatrixRTC session, when using rtc. */
    rtcPeers: number;
}

interface SnapshotShard {
    gen: string;
    i: number;
    n: number;
    b: string;
    len: number;
    h: string;
    enc: Encoding;
    sv?: string;
    ts: number;
}

export class MatrixYjsProvider {
    private readonly doc: Y.Doc;
    private readonly ctx: WidgetContext;
    private readonly bucket = new TokenBucket();
    private readonly reassembler = new ChunkReassembler();

    private outbound: Uint8Array[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private sending = false;
    private lastEditAt = 0;

    private inbound: Uint8Array[] = [];
    private inboundTimer: ReturnType<typeof setTimeout> | null = null;

    private senderBuckets = new Map<string, { tokens: number; last: number }>();
    private appliedMessages = new Set<string>();
    private ownMessages = new Set<string>();

    private snapshotSv: Uint8Array | null = null;
    private snapshotGen: string | null = null;
    private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    private lastSnapshotWriteAt = 0;
    private writingSnapshot = false;

    private destroyed = false;
    private readOnly = false;
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    private stats: ProviderStats = {
        status: "connecting",
        pendingLocal: 0,
        sentEvents: 0,
        receivedEvents: 0,
        droppedEvents: 0,
        lastError: null,
        docBytes: 0,
        snapshotGeneration: null,
        transport: "timeline",
        rtcPeers: 0,
    };

    private rtc: RtcTransport | null = null;

    private listeners = new Set<(stats: ProviderStats) => void>();

    constructor(doc: Y.Doc, ctx: WidgetContext) {
        this.doc = doc;
        this.ctx = ctx;

        this.onLocalUpdate = this.onLocalUpdate.bind(this);
        this.doc.on("updateV2", this.onLocalUpdate);

        ctx.onRoomEvent(ev => { void this.onTimelineEvent(ev); });
        ctx.onStateEvent(events => { void this.onSnapshotState(events); });

        globalThis.addEventListener("pagehide", () => { void this.flush(); });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && this.inbound.length > 0) this.drainInbound();
        });

        this.sweepTimer = setInterval(() => {
            this.reassembler.sweep();
            if (this.appliedMessages.size > 4096) this.appliedMessages.clear();
            if (this.ownMessages.size > 1024) this.ownMessages.clear();
        }, 30_000);
    }

    // ----- public -----

    /**
     * Adopt a MatrixRTC data channel as the live transport.
     *
     * Timeline events stay wired up as a fallback: if the session drops, edits
     * still propagate (slowly) rather than silently stopping. Snapshots are
     * unaffected either way - they are what makes the list survive nobody
     * being online, which a data channel cannot do.
     */
    attachRtc(rtc: RtcTransport) {
        this.rtc = rtc;

        rtc.onMessage((payload, sender) => { void this.onRtcMessage(payload, sender); });
        rtc.onStateChange(({ connected, peers }) => {
            this.emit({ transport: connected ? "rtc" : "timeline", rtcPeers: Math.max(0, peers) });
        });
    }

    private async onRtcMessage(payload: Uint8Array, sender: string) {
        if (this.destroyed) return;
        if (!this.allowSender(sender || "rtc:unknown")) { this.drop(); return; }

        let content: unknown;
        try {
            content = JSON.parse(new TextDecoder().decode(payload));
        } catch { this.drop(); return; }

        const c = content as Record<string, unknown> | null;
        // our own packet echoed back by the SFU
        if (c && typeof c.msg === "string" && this.ownMessages.has(c.msg)) return;

        const assembled = await this.reassembler.accept(content);
        if (!assembled) return;
        if (this.appliedMessages.has(assembled.msg)) return;
        this.appliedMessages.add(assembled.msg);

        let update: Uint8Array;
        try { update = await decompress(assembled.payload, assembled.enc); }
        catch { this.drop(); return; }

        this.stats.receivedEvents++;
        this.queueInbound(update, true);
    }

    onStats(listener: (stats: ProviderStats) => void): () => void {
        this.listeners.add(listener);
        listener(this.stats);
        return () => this.listeners.delete(listener);
    }

    /**
     * Apply room state, then best-effort replay the timeline tail.
     * Resolves once the document reflects everything reachable.
     */
    async hydrate(): Promise<void> {
        this.setStatus("connecting");
        await this.ctx.stateReady;

        // The snapshot arrives through the update_state push, handled in
        // onSnapshotState. Here we only close the gap between the snapshot and
        // now, using the (short) readable timeline window.
        try {
            const events = await this.ctx.api.readRoomEvents(
                UPDATE_EVENT_TYPE, undefined, undefined, [this.ctx.roomId],
            );
            // results come back newest-first
            for (const event of [...events].reverse()) await this.ingestTimelineEvent(event, false);
            this.drainInbound();
        } catch (err) {
            // Timeline replay is an optimisation; the snapshot already made us
            // correct. Losing it is not an error worth surfacing.
            console.warn("[ul] timeline replay unavailable", err);
        }

        this.setStatus("synced");
        this.scheduleSnapshotCheck();
    }

    destroy() {
        this.destroyed = true;
        void this.rtc?.destroy();
        this.rtc = null;
        this.doc.off("updateV2", this.onLocalUpdate);
        if (this.flushTimer) clearTimeout(this.flushTimer);
        if (this.inboundTimer) clearTimeout(this.inboundTimer);
        if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
        if (this.sweepTimer) clearInterval(this.sweepTimer);
        this.listeners.clear();
    }

    // ----- outbound -----

    private onLocalUpdate(update: Uint8Array, origin: unknown) {
        // The echo guard. Without it every applied remote update is
        // rebroadcast, and N clients turn one edit into a storm.
        if (origin === REMOTE_ORIGIN) return;
        if (this.destroyed || this.readOnly) return;

        this.outbound.push(update);
        this.lastEditAt = Date.now();
        this.emit({ pendingLocal: this.outbound.length });
        this.scheduleFlush();
        this.scheduleSnapshotCheck();
    }

    private scheduleFlush() {
        if (this.flushTimer !== null || this.sending || this.outbound.length === 0) return;

        const tokens = this.bucket.peek();
        const interval = tokens >= 6 ? FLUSH_MIN_MS : tokens >= 3 ? 3_000 : FLUSH_MAX_MS;
        // trailing-edge flush: a pause in typing sends promptly if we can afford it
        const quiet = Date.now() - this.lastEditAt >= FLUSH_IDLE_MS && tokens > 3;

        this.flushTimer = setTimeout(() => { void this.flush(); }, quiet ? 0 : interval);
    }

    private async flush(): Promise<void> {
        if (this.flushTimer !== null) { clearTimeout(this.flushTimer); this.flushTimer = null; }
        if (this.sending || this.outbound.length === 0 || this.destroyed) return;

        this.sending = true;
        const batch = this.outbound;
        this.outbound = [];

        try {
            const merged = batch.length === 1 ? batch[0] : Y.mergeUpdatesV2(batch);
            await this.sendUpdate(merged);
            this.emit({ pendingLocal: this.outbound.length, lastError: null });
            if (this.stats.status !== "readonly") this.setStatus("synced");
        } catch (err) {
            if (isForbidden(err)) {
                // No permission to write here. Keep the list usable locally and
                // say so plainly rather than pretending edits are saved.
                this.readOnly = true;
                this.setStatus("readonly");
                this.emit({ lastError: "You do not have permission to edit this list in this room." });
            } else {
                // Not requeued: the doc still holds this state, so the snapshot
                // convergence check republishes it.
                this.setStatus("error");
                this.emit({ lastError: describeError(err) });
                console.warn("[ul] send failed", err);
            }
        } finally {
            this.sending = false;
            if (this.outbound.length > 0) this.scheduleFlush();
        }
    }

    private async sendUpdate(update: Uint8Array): Promise<void> {
        // Preferred path: the MatrixRTC data channel. Not rate limited, not
        // written to the room, and sub-second instead of multi-second.
        if (this.rtc?.connected) {
            try {
                const parts = await encodeUpdate(update, RTC_CHUNK_BYTES);
                const encoder = new TextEncoder();
                for (const part of parts) {
                    this.ownMessages.add(part.msg);
                    await this.rtc.send(encoder.encode(JSON.stringify(part)));
                }
                this.stats.sentEvents++;
                this.emit({ sentEvents: this.stats.sentEvents });
                // The data channel reaches only who is online now, so the
                // snapshot still has to catch up eventually.
                this.scheduleSnapshotCheck();
                return;
            } catch (err) {
                // fall through to the timeline rather than losing the update
                console.warn("[ul] rtc send failed, falling back to timeline", err);
                this.emit({ transport: "timeline" });
            }
        }

        let parts: ChunkContent[];
        try {
            parts = await encodeUpdate(update);
        } catch {
            // Too big for the timeline. The snapshot path handles bulk state.
            this.scheduleSnapshotCheck(true);
            return;
        }

        for (const part of parts) {
            await this.bucket.take(Lane.Urgent, { aborted: this.destroyed });
            if (this.destroyed) return;
            this.ownMessages.add(part.msg);
            await this.sendWithRetry(() => this.ctx.api.sendRoomEvent(UPDATE_EVENT_TYPE, part, this.ctx.roomId));
            this.stats.sentEvents++;
        }
        this.emit({ sentEvents: this.stats.sentEvents });
    }

    private async sendWithRetry<T>(send: () => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            try {
                return await send();
            } catch (err) {
                if (this.destroyed) throw err;

                const retryAfter = retryAfterFrom(err);
                if (retryAfter !== null) {
                    // Drain the bucket, not just this call: sleeping one send
                    // leaves the server's limiter saturated and we hit it again.
                    this.bucket.penalize(retryAfter);
                    this.setStatus("throttled");
                    await sleep(jitter(retryAfter));
                    continue; // rate limiting is scheduling, not failure
                }

                if (isTooLarge(err) || isForbidden(err)) throw err;
                if (attempt >= MAX_SEND_ATTEMPTS) throw err;
                await sleep(jitter(Math.min(30_000, 1000 * 2 ** attempt)));
            }
        }
    }

    // ----- inbound: timeline -----

    private async onTimelineEvent(event: IRoomEvent) {
        await this.ingestTimelineEvent(event, true);
    }

    private async ingestTimelineEvent(event: IRoomEvent, live: boolean) {
        if (this.destroyed) return;
        if (event.room_id !== this.ctx.roomId) { this.drop(); return; }
        if (event.type !== UPDATE_EVENT_TYPE) return;

        const content = event.content as Record<string, unknown> | undefined;
        if (!content) { this.drop(); return; }

        // our own event echoed back through sync
        if (typeof content.msg === "string" && this.ownMessages.has(content.msg)) return;

        if (!this.allowSender(event.sender)) { this.drop(); return; }

        const assembled = await this.reassembler.accept(content);
        if (!assembled) return;

        if (this.appliedMessages.has(assembled.msg)) return;
        this.appliedMessages.add(assembled.msg);

        let update: Uint8Array;
        try {
            update = await decompress(assembled.payload, assembled.enc);
        } catch { this.drop(); return; }

        this.queueInbound(update, live);
        this.stats.receivedEvents++;
    }

    private queueInbound(update: Uint8Array, live: boolean) {
        this.inbound.push(update);
        if (!live) return; // hydrate() drains explicitly

        if (this.inboundTimer !== null) return;
        const window = document.visibilityState === "hidden" ? INBOUND_BATCH_MS_HIDDEN : INBOUND_BATCH_MS;
        this.inboundTimer = setTimeout(() => this.drainInbound(), window);
    }

    private drainInbound() {
        if (this.inboundTimer !== null) { clearTimeout(this.inboundTimer); this.inboundTimer = null; }
        if (this.inbound.length === 0) return;

        const batch = this.inbound;
        this.inbound = [];
        this.applyRemote(batch);
    }

    /** Apply remote updates in a single transaction, so a burst costs one render. */
    private applyRemote(updates: Uint8Array[]) {
        if (updates.length === 0) return;

        if (this.docBytes() > DOC_HARD_LIMIT_BYTES) {
            this.readOnly = true;
            this.setStatus("readonly");
            this.emit({ lastError: "This list has grown too large to keep syncing safely." });
            return;
        }

        let payloads = updates;
        if (updates.length >= INBOUND_MERGE_THRESHOLD) {
            try { payloads = [Y.mergeUpdatesV2(updates)]; }
            catch { payloads = updates; } // fall back to applying individually
        }

        // Nested applyUpdate calls join the outer transaction, so observers fire
        // once at commit and the origin seen by handlers is the outer one.
        this.doc.transact(() => {
            for (const update of payloads) {
                try {
                    // structural check first: throws on malformed input without
                    // leaving the live document half-mutated
                    Y.parseUpdateMetaV2(update);
                    Y.applyUpdateV2(this.doc, update);
                } catch (err) {
                    this.drop();
                    console.warn("[ul] rejected malformed update", err);
                }
            }
        }, REMOTE_ORIGIN);

        this.emit({ receivedEvents: this.stats.receivedEvents, docBytes: this.docBytes() });
        this.scheduleSnapshotCheck();
    }

    // ----- inbound: snapshot state -----

    private async onSnapshotState(events: IRoomEvent[]) {
        if (this.destroyed || events.length === 0) return;

        const shards: SnapshotShard[] = [];
        for (const event of events) {
            const shard = parseShard(event);
            if (shard) shards.push(shard);
        }
        if (shards.length === 0) return;

        // group by generation, newest first, and take the first complete set
        const byGen = new Map<string, SnapshotShard[]>();
        for (const shard of shards) {
            const list = byGen.get(shard.gen) ?? [];
            list.push(shard);
            byGen.set(shard.gen, list);
        }

        const generations = [...byGen.entries()].sort(
            (a, b) => Math.max(...b[1].map(s => s.ts)) - Math.max(...a[1].map(s => s.ts))
        );

        for (const [gen, list] of generations) {
            if (gen === this.snapshotGen) return; // already applied
            const payload = await assembleSnapshot(list);
            if (!payload) continue; // torn or corrupt generation: try an older one

            let update: Uint8Array;
            try { update = await decompress(payload.bytes, payload.enc); }
            catch { continue; }

            this.snapshotGen = gen;
            this.snapshotSv = payload.sv;
            // merge, never replace: replacing would hand anyone who can write
            // one state event a total-wipe primitive
            this.applyRemote([update]);
            this.emit({ snapshotGeneration: gen });
            return;
        }
    }

    // ----- snapshot writing -----

    private scheduleSnapshotCheck(immediate = false) {
        if (!this.ctx.canWriteSnapshots || this.destroyed || this.readOnly) return;
        if (this.snapshotTimer !== null) return;

        const delay = immediate ? 1_000 : SNAPSHOT_DEBOUNCE_MS + Math.random() * 10_000;
        this.snapshotTimer = setTimeout(() => {
            this.snapshotTimer = null;
            void this.maybeWriteSnapshot();
        }, delay);
    }

    private async maybeWriteSnapshot() {
        if (this.destroyed || this.writingSnapshot || !this.ctx.canWriteSnapshots) return;
        if (Date.now() - this.lastSnapshotWriteAt < SNAPSHOT_MIN_INTERVAL_MS) return;
        if (this.bucket.peek() < 7) return; // never compete with user edits

        // Only rewrite when we actually hold state the published snapshot lacks.
        // This is what makes the convergence loop terminate.
        if (!this.hasStateBeyondSnapshot()) return;

        this.writingSnapshot = true;
        try {
            const full = Y.encodeStateAsUpdateV2(this.doc);
            const compressed = await compress(full);
            const shardCount = Math.max(1, Math.ceil(compressed.length / CHUNK_RAW_BYTES));
            if (shardCount > MAX_CHUNKS_PER_MESSAGE) {
                this.emit({ lastError: "This list is too large to snapshot into room state." });
                return;
            }

            const gen = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
            const h = await digest(compressed);
            const sv = bytesToBase64(Y.encodeStateVector(this.doc));

            // Write the highest shard first so shard 0 lands last: a reader that
            // sees shard 0 of a generation is likely to see all of it.
            for (let i = shardCount - 1; i >= 0; i--) {
                const slice = compressed.subarray(i * CHUNK_RAW_BYTES, Math.min((i + 1) * CHUNK_RAW_BYTES, compressed.length));
                const content = {
                    v: WIRE_VERSION,
                    enc: PREFERRED_ENCODING,
                    gen, i, n: shardCount,
                    b: bytesToBase64(slice),
                    len: compressed.length,
                    h,
                    ...(i === 0 ? { sv } : {}),
                };
                await this.bucket.take(Lane.Background, { aborted: this.destroyed });
                if (this.destroyed) return;
                await this.sendWithRetry(() => this.ctx.api.sendStateEvent(
                    SNAPSHOT_EVENT_TYPE, `${SNAPSHOT_CHUNK_PREFIX}${i}`, content, this.ctx.roomId,
                ));
            }

            this.lastSnapshotWriteAt = Date.now();
            this.snapshotGen = gen;
            this.snapshotSv = Y.encodeStateVector(this.doc);
            this.emit({ snapshotGeneration: gen });
        } catch (err) {
            if (isForbidden(err)) {
                // capability granted but power level insufficient
                (this.ctx as { canWriteSnapshots: boolean }).canWriteSnapshots = false;
            }
            console.warn("[ul] snapshot write failed", err);
        } finally {
            this.writingSnapshot = false;
        }
    }

    private hasStateBeyondSnapshot(): boolean {
        const local = Y.encodeStateVector(this.doc);
        if (this.snapshotSv === null) return this.docHasContent();

        try {
            const localClocks = Y.decodeStateVector(local);
            const snapClocks = Y.decodeStateVector(this.snapshotSv);
            for (const [client, clock] of localClocks) {
                if ((snapClocks.get(client) ?? 0) < clock) return true;
            }
            return false;
        } catch {
            return true;
        }
    }

    private docHasContent(): boolean {
        return Y.encodeStateAsUpdateV2(this.doc).byteLength > 32;
    }

    // ----- helpers -----

    private allowSender(sender: string | undefined): boolean {
        if (!sender) return false;
        const now = Date.now();
        const bucket = this.senderBuckets.get(sender) ?? { tokens: SENDER_BURST, last: now };
        bucket.tokens = Math.min(
            SENDER_BURST,
            bucket.tokens + ((now - bucket.last) / 1000) * SENDER_REFILL_PER_SEC,
        );
        bucket.last = now;
        if (bucket.tokens < 1) { this.senderBuckets.set(sender, bucket); return false; }
        bucket.tokens -= 1;
        this.senderBuckets.set(sender, bucket);
        return true;
    }

    private docBytes(): number {
        try { return Y.encodeStateAsUpdateV2(this.doc).byteLength; } catch { return 0; }
    }

    private drop() {
        this.stats.droppedEvents++;
        this.emit({ droppedEvents: this.stats.droppedEvents });
    }

    private setStatus(status: SyncStatus) {
        if (this.stats.status === "readonly" && status !== "readonly") return;
        this.emit({ status });
    }

    private emit(patch: Partial<ProviderStats>) {
        this.stats = { ...this.stats, ...patch };
        for (const listener of this.listeners) {
            try { listener(this.stats); } catch { /* a bad listener must not break sync */ }
        }
    }

    get documentSoftLimitExceeded(): boolean {
        return this.stats.docBytes > DOC_SOFT_LIMIT_BYTES;
    }
}

// ----- snapshot shard parsing -----

function parseShard(event: IRoomEvent): SnapshotShard | null {
    if (event.type !== SNAPSHOT_EVENT_TYPE) return null;
    if (typeof event.state_key !== "string" || !event.state_key.startsWith(SNAPSHOT_CHUNK_PREFIX)) return null;

    const c = event.content as Record<string, unknown> | undefined;
    if (!c || c.v !== WIRE_VERSION) return null;
    if (c.enc !== "yv2+deflate+b64" && c.enc !== "yv2+b64") return null;
    if (typeof c.gen !== "string" || c.gen.length === 0 || c.gen.length > 128) return null;
    if (typeof c.h !== "string" || typeof c.b !== "string") return null;

    const n = c.n, i = c.i, len = c.len;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > MAX_CHUNKS_PER_MESSAGE) return null;
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= (n as number)) return null;
    if (!Number.isInteger(len) || (len as number) < 1 || (len as number) > MAX_CHUNKS_PER_MESSAGE * CHUNK_RAW_BYTES) return null;

    return {
        gen: c.gen as string,
        i: i as number,
        n: n as number,
        b: c.b as string,
        len: len as number,
        h: c.h as string,
        enc: c.enc as Encoding,
        sv: typeof c.sv === "string" ? c.sv : undefined,
        ts: typeof event.origin_server_ts === "number" ? event.origin_server_ts : 0,
    };
}

async function assembleSnapshot(shards: SnapshotShard[]):
    Promise<{ bytes: Uint8Array; enc: Encoding; sv: Uint8Array | null } | null> {

    const n = shards[0].n;
    if (shards.some(s => s.n !== n || s.h !== shards[0].h || s.len !== shards[0].len)) return null;

    const slots = new Array<Uint8Array | undefined>(n);
    for (const shard of shards) {
        if (slots[shard.i] !== undefined) continue;
        const bytes = base64ToBytes(shard.b);
        if (bytes === null) return null;
        slots[shard.i] = bytes;
    }
    if (slots.some(s => s === undefined)) return null; // torn write

    const total = shards[0].len;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const slot of slots) {
        if (!slot || offset + slot.length > total) return null;
        out.set(slot, offset);
        offset += slot.length;
    }
    if (offset !== total) return null;
    if (await digest(out) !== shards[0].h) return null;

    const svShard = shards.find(s => s.i === 0 && s.sv);
    const sv = svShard?.sv ? base64ToBytes(svShard.sv) : null;

    return { bytes: out, enc: shards[0].enc, sv };
}

function describeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

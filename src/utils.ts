// ----- color functions -----
//
// Tag colors are untrusted input: they arrive from imported JSON files and,
// once the document is shared through a Matrix room, from any room member.
// Every colour therefore goes through normalizeColor() before it reaches the
// DOM. Results are memoized because these run inside {#each} bodies - the
// previous implementation allocated a fresh <canvas> per tag per render.

/** Fallback used when a colour is missing or rejected. */
export const DEFAULT_TAG_COLOR = '#dbdbdb';

// Two different probes: assigning an invalid value to fillStyle leaves the
// previous value in place, so a value that "sticks" regardless of what came
// before is genuinely parseable.
const PROBE_A = '#000000';
const PROBE_B = '#ffffff';

const MAX_COLOR_LENGTH = 64;
const MAX_CACHE_ENTRIES = 1024;

let sharedCtx: CanvasRenderingContext2D | null | undefined;

function getSharedContext(): CanvasRenderingContext2D | null {
    if (sharedCtx === undefined) {
        sharedCtx = document.createElement('canvas').getContext('2d');
    }
    return sharedCtx;
}

const normalizeCache = new Map<string, string | null>();

/**
 * Normalize an arbitrary CSS colour string to its canonical form
 * (`#rrggbb` or `rgba(r, g, b, a)`), or return null if it is not a valid
 * single colour value.
 *
 * This is the security boundary for tag colours. The CSSOM only accepts a
 * lone <color>, so injection payloads such as
 *   "red; position:fixed; inset:0; background-image:url(https://attacker/)"
 * fail to parse and are rejected here rather than reaching a style attribute.
 */
export function normalizeColor(input: unknown): string | null {
    if (typeof input !== 'string') return null;

    const raw = input.trim();
    if (raw.length === 0 || raw.length > MAX_COLOR_LENGTH) return null;

    const cached = normalizeCache.get(raw);
    if (cached !== undefined) return cached;

    let result: string | null = null;
    const ctx = getSharedContext();

    if (ctx) {
        ctx.fillStyle = PROBE_A;
        ctx.fillStyle = raw;
        const afterA = ctx.fillStyle;

        ctx.fillStyle = PROBE_B;
        ctx.fillStyle = raw;
        const afterB = ctx.fillStyle;

        if (typeof afterA === 'string' && afterA === afterB) result = afterA;
    }

    if (normalizeCache.size >= MAX_CACHE_ENTRIES) normalizeCache.clear();
    normalizeCache.set(raw, result);
    return result;
}

/**
 * Normalized colour, or DEFAULT_TAG_COLOR when the input is absent/invalid.
 * Safe to interpolate into a style value.
 */
export function safeColor(input: unknown): string {
    return normalizeColor(input) ?? DEFAULT_TAG_COLOR;
}

function parseRgb(normalized: string): [number, number, number] | null {
    if (normalized.startsWith('#')) {
        // the CSSOM emits #rrggbb for fully opaque colours
        if (normalized.length !== 7) return null;
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        return Number.isNaN(r + g + b) ? null : [r, g, b];
    }

    // colours with alpha come back as "rgba(r, g, b, a)"
    const m = normalized.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (!m) return null;
    const rgb: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return rgb.some(Number.isNaN) ? null : rgb;
}

const textColorCache = new Map<string, 'black' | 'white'>();

/**
 * Pick white or black text for a given background colour.
 * based on https://stackoverflow.com/a/3943023
 */
export function pickTextColorBasedOnBackgroundColor(backgroundColor: unknown): 'black' | 'white' {
    const normalized = normalizeColor(backgroundColor) ?? DEFAULT_TAG_COLOR;

    const cached = textColorCache.get(normalized);
    if (cached !== undefined) return cached;

    const rgb = parseRgb(normalized);
    // default to black: it is legible on the light DEFAULT_TAG_COLOR fallback
    const result: 'black' | 'white' = rgb === null
        ? 'black'
        : ((rgb[0] * 0.299) + (rgb[1] * 0.587) + (rgb[2] * 0.114)) > 186 ? 'black' : 'white';

    if (textColorCache.size >= MAX_CACHE_ENTRIES) textColorCache.clear();
    textColorCache.set(normalized, result);
    return result;
}

/**
 * Convert any CSS colour to the `#rrggbb` form required by <input type="color">.
 */
export function cssColorToHex(cssColor: unknown): string {
    const normalized = normalizeColor(cssColor);
    if (normalized === null) return DEFAULT_TAG_COLOR;
    if (normalized.startsWith('#')) return normalized;

    const rgb = parseRgb(normalized);
    if (rgb === null) return DEFAULT_TAG_COLOR;
    return '#' + rgb.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}

// Client-side rate limiting for room event sends.
//
// Synapse's rc_message defaults to 0.2 events/second sustained with a burst of
// 10, and the limit is per *user*, not per room or per device - so the widget
// shares a budget with the user's own chat messages and any other open tab. We
// stay well inside it rather than discovering the limit by being throttled.

export const BUCKET_CAPACITY = 10;
export const BUCKET_REFILL_PER_SEC = 0.2;

/** Tokens held back for retries and chunk tails, so a multi-chunk send can't strand itself. */
export const BUCKET_RESERVE = 3;

/** Background work (snapshots) may only draw from the top of the bucket. */
export const BACKGROUND_MIN_TOKENS = 7;

export const MAX_BACKOFF_MS = 60_000;

export enum Lane {
    /** User edits. May spend down to zero. */
    Urgent = 0,
    /** Snapshots and compaction. Must never starve user edits. */
    Background = 1,
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class TokenBucket {
    private tokens: number;
    private last: number;

    constructor(
        private readonly capacity = BUCKET_CAPACITY,
        private readonly refillPerSec = BUCKET_REFILL_PER_SEC,
    ) {
        this.tokens = capacity;
        this.last = Date.now();
    }

    private refill() {
        const now = Date.now();
        // guard against clock jumps
        const elapsed = Math.max(0, now - this.last);
        this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.refillPerSec);
        this.last = now;
    }

    /** Current token estimate, for choosing a flush interval. */
    peek(): number {
        this.refill();
        return this.tokens;
    }

    async take(lane: Lane = Lane.Urgent, signal?: { aborted: boolean }): Promise<void> {
        const floor = lane === Lane.Background ? BACKGROUND_MIN_TOKENS : 0;
        for (;;) {
            if (signal?.aborted) throw new Error("aborted");
            this.refill();
            if (this.tokens >= 1 + floor) {
                this.tokens -= 1;
                return;
            }
            const deficit = (1 + floor) - this.tokens;
            await sleep(Math.min(MAX_BACKOFF_MS, (deficit / this.refillPerSec) * 1000));
        }
    }

    /**
     * The server told us we are over the limit. Drain the bucket so subsequent
     * sends also wait - sleeping only the current call leaves the server's own
     * leaky bucket saturated and we just hit the wall again.
     */
    penalize(retryAfterMs: number) {
        this.refill();
        this.tokens = Math.min(this.tokens, -(retryAfterMs / 1000) * this.refillPerSec);
    }
}

const clampRetry = (ms: number) => Math.min(MAX_BACKOFF_MS, Math.max(1000, ms));

/**
 * Extract a retry delay from a widget-API error.
 *
 * Element wraps homeserver errors as WidgetApiResponseError with a
 * `data.matrix_api_error` carrying `http_status`, `response` (the Matrix error
 * body) and `http_headers`. Since Matrix v1.10 `retry_after_ms` is deprecated
 * in favour of the Retry-After header, and Synapse still sends both - so check
 * both. Header names come from a fetch Headers iterator, hence lowercase.
 */
export function retryAfterFrom(err: unknown): number | null {
    const apiError = findMatrixApiError(err);
    if (apiError) {
        const response = apiError.response as Record<string, unknown> | undefined;
        const isLimit = response?.errcode === "M_LIMIT_EXCEEDED" || apiError.http_status === 429;
        if (!isLimit) return null;

        const retryMs = response?.retry_after_ms;
        if (typeof retryMs === "number" && Number.isFinite(retryMs)) return clampRetry(retryMs);

        const headers = (apiError.http_headers ?? {}) as Record<string, unknown>;
        const header = headers["retry-after"] ?? headers["Retry-After"];
        const seconds = Number(header);
        if (Number.isFinite(seconds) && seconds > 0) return clampRetry(seconds * 1000);

        return 5000;
    }

    // fall back to a shallow scan for hand-rolled or older error shapes
    if (typeof err !== "object" || err === null) return null;
    const rec = err as Record<string, unknown>;
    if (rec.errcode === "M_LIMIT_EXCEEDED") {
        const retry = rec.retry_after_ms;
        return typeof retry === "number" && Number.isFinite(retry) ? clampRetry(retry) : 5000;
    }
    return null;
}

interface MatrixApiError {
    http_status?: number;
    http_headers?: unknown;
    response?: unknown;
}

function findMatrixApiError(err: unknown): MatrixApiError | null {
    if (typeof err !== "object" || err === null) return null;
    const data = (err as Record<string, unknown>).data;
    if (typeof data !== "object" || data === null) return null;
    const apiError = (data as Record<string, unknown>).matrix_api_error;
    if (typeof apiError !== "object" || apiError === null) return null;
    return apiError as MatrixApiError;
}

/** True when the homeserver rejected the event as too large. */
export function isTooLarge(err: unknown): boolean {
    const apiError = findMatrixApiError(err);
    if (!apiError) return false;
    const response = apiError.response as Record<string, unknown> | undefined;
    return apiError.http_status === 413 || response?.errcode === "M_TOO_LARGE";
}

/** True when we lack permission to send this event type. */
export function isForbidden(err: unknown): boolean {
    const apiError = findMatrixApiError(err);
    if (!apiError) return false;
    const response = apiError.response as Record<string, unknown> | undefined;
    return apiError.http_status === 403 || response?.errcode === "M_FORBIDDEN";
}

export function isRateLimit(err: unknown): boolean {
    return retryAfterFrom(err) !== null;
}

/** Full jitter, so N clients recovering from the same outage don't resync in lockstep. */
export function jitter(ms: number): number {
    return ms + Math.random() * Math.min(500, ms);
}

export { sleep };

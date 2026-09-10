// Widget API bootstrap: URL parsing, origin pinning, capability negotiation,
// and the to-widget action plumbing.
//
// Three behaviours verified against matrix-widget-api 1.19.0 that shape this file:
//
//  1. PostmessageTransport.targetOrigin defaults to "*", and strictOriginCheck
//     (default false) compares against the *widget's own* origin, not the
//     client's. So we pass an explicit clientOrigin and filter inbound
//     messages ourselves.
//
//  2. Unhandled to-widget actions fall through to a "Unknown or unsupported
//     to-widget action" error reply (WidgetApi.js:1123). send_event and
//     update_state are NOT handled by the SDK, so every one must be acked
//     explicitly or the client logs errors and state delivery breaks.
//
//  3. Once the widget advertises update_state support (it does by default),
//     read_events routes to readRoomTimeline even when a state_key is given
//     (ClientWidgetApi.js:698-728). readStateEvents therefore does NOT return
//     resolved room state. Room state only arrives via the update_state push.

import { WidgetApi, WidgetApiToWidgetAction, MatrixCapabilities } from "matrix-widget-api";
import type { IWidgetApiRequest, IRoomEvent } from "matrix-widget-api";
import { UPDATE_EVENT_TYPE, SNAPSHOT_EVENT_TYPE } from "./codec";

// Room ids come in two shapes:
//   legacy      !opaque:server.name
//   room v12+   !<43-char unpadded base64 hash>   (MSC4291, no server part)
// Requiring the ":server" half rejects every room created at version 12 or later.
const ROOM_ID_RE = /^![^\s:/]{1,255}(?::[^\s/]{1,255})?$/;

export type RoomEventListener = (event: IRoomEvent) => void;
export type StateListener = (events: IRoomEvent[]) => void;

export interface WidgetContext {
    api: WidgetApi;
    roomId: string;
    widgetId: string;
    /** Null when the embedding client has no resolvable web origin (desktop app). */
    clientOrigin: string | null;
    /** Cosmetic only - templated into the URL by the client, trivially forged. */
    userId: string | null;
    /** Claimed device id, used only as a LiveKit participant hint. Also forgeable. */
    deviceId: string | null;
    /** Whether the client granted permission to write snapshot state events. */
    canWriteSnapshots: boolean;
    /** True once an m.room.encryption state event has been seen for this room. */
    isEncrypted: () => boolean;
    onRoomEvent: (listener: RoomEventListener) => void;
    onStateEvent: (listener: StateListener) => void;
    /** Resolves after the first update_state push (guaranteed, possibly empty). */
    stateReady: Promise<void>;
}

export class WidgetUnavailable extends Error {}

/**
 * Configured client-origin allowlist, or null when the widget should accept any
 * embedding client.
 *
 * Permissive is the default because Element Desktop is an Electron app whose
 * frame origin is `vector://vector` - a non-special scheme that cannot be
 * expressed as an https allowlist entry, cannot be used as a postMessage
 * targetOrigin, and which `new URL().origin` reports as the string "null".
 * Set VITE_ALLOWED_CLIENT_ORIGINS to a comma-separated list to lock the widget
 * down to specific web clients (which excludes the desktop app).
 */
function allowedOrigins(): string[] | null {
    const configured = (import.meta.env.VITE_ALLOWED_CLIENT_ORIGINS as string | undefined)?.trim();
    if (!configured || configured === "*") return null;
    const list = configured.split(",").map(o => o.trim()).filter(Boolean);
    return list.length > 0 ? list : null;
}

/**
 * Element appends widgetId and parentUrl to the query string; our own
 * $matrix_* template variables go in the fragment so user and device ids never
 * reach the widget host's access logs. Read both, query wins on conflict.
 */
function readParams(): URLSearchParams {
    const params = new URLSearchParams(globalThis.location.search);
    const fragment = globalThis.location.hash.replace(/^#\/?\??/, "");
    if (fragment.length > 0) {
        for (const [key, value] of new URLSearchParams(fragment)) {
            if (!params.has(key)) params.set(key, value);
        }
    }
    return params;
}

/**
 * Serialize a URL's origin, including non-special schemes.
 *
 * `new URL("vector://vector/webapp/").origin` is the string "null" per the URL
 * spec (opaque origin), so Element Desktop needs the scheme//host rebuilt by
 * hand.
 */
function deriveOrigin(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.origin && parsed.origin !== "null") return parsed.origin;
        if (parsed.protocol && parsed.host) return `${parsed.protocol}//${parsed.host}`;
        return null;
    } catch {
        return null;
    }
}

/** Only http(s) origins are valid postMessage targetOrigin values. */
function isPostMessageTargetable(origin: string): boolean {
    return origin.startsWith("https://") || origin.startsWith("http://");
}

interface ResolvedClient {
    /** The embedding client's origin, as far as we can tell. May be null. */
    origin: string | null;
    /** What to hand PostmessageTransport: a concrete origin, or "*" . */
    targetOrigin: string;
    /** Whether inbound messages can be filtered by origin. */
    pinned: boolean;
}

function resolveClient(params: URLSearchParams): ResolvedClient {
    const allowed = allowedOrigins();
    const parentUrl = params.get("parentUrl");

    const origin = parentUrl
        ? deriveOrigin(parentUrl)
        : (document.referrer ? deriveOrigin(document.referrer) : null);

    if (allowed !== null) {
        // Strict mode: refuse anything not explicitly configured.
        if (origin === null) throw new WidgetUnavailable("Cannot determine the Matrix client's origin.");
        if (!allowed.includes(origin)) {
            throw new WidgetUnavailable(
                `This widget is not configured to run inside ${origin}. ` +
                `Rebuild with VITE_ALLOWED_CLIENT_ORIGINS to allow it, or set it to "*".`
            );
        }
        return { origin, targetOrigin: origin, pinned: true };
    }

    // Permissive mode: still pin the target origin when it is a normal web
    // origin, so replies are not broadcast to every frame. Element Desktop's
    // vector://vector cannot be a targetOrigin, so it falls back to "*".
    if (origin !== null && isPostMessageTargetable(origin)) {
        return { origin, targetOrigin: origin, pinned: true };
    }
    return { origin, targetOrigin: "*", pinned: false };
}

/**
 * Drop postMessages that did not come from the embedding client. Registered in
 * the capture phase before start() so it runs ahead of the library's handler.
 *
 * Only installed when the client origin could be pinned. Element Desktop sends
 * from an opaque origin, so filtering there would drop every real message.
 */
function installOriginGuard(clientOrigin: string, onRejected: () => void) {
    globalThis.addEventListener("message", (ev: MessageEvent) => {
        if (ev.source !== window.parent) return;
        if (ev.origin === clientOrigin) return;
        ev.stopImmediatePropagation();
        onRejected();
    }, true);
}

export function looksLikeWidget(): boolean {
    return readParams().has("widgetId") && window.parent !== window;
}

export interface BootstrapResult {
    context: WidgetContext;
    warnings: string[];
}

export interface BootstrapOptions {
    /** Called if the client has not granted capabilities yet - usually an unanswered prompt. */
    onAwaitingApproval?: () => void;
}

export async function bootstrapWidget(options: BootstrapOptions = {}): Promise<BootstrapResult> {
    if (window.parent === window) {
        throw new WidgetUnavailable("Not running inside a Matrix client.");
    }

    const params = readParams();
    const warnings: string[] = [];

    const widgetId = params.get("widgetId");
    if (!widgetId) throw new WidgetUnavailable("Missing widgetId parameter.");

    const roomId = params.get("roomId");
    if (!roomId || !ROOM_ID_RE.test(roomId)) {
        throw new WidgetUnavailable(
            "Missing or malformed roomId parameter - the widget URL must include roomId=$matrix_room_id."
        );
    }

    const client = resolveClient(params);

    let rejectedOrigins = 0;
    if (client.pinned && client.origin !== null) {
        installOriginGuard(client.origin, () => {
            if (rejectedOrigins++ === 0) console.warn("[ul] dropped postMessage from unexpected origin");
        });
    }

    // A concrete origin pins transport.targetOrigin away from "*"; "*" is the
    // fallback for clients whose frame origin is not a web origin (desktop).
    const api = new WidgetApi(widgetId, client.targetOrigin);

    // Capabilities must be queued before start(); the client may ask immediately.
    api.requestCapability(MatrixCapabilities.RequiresClient);
    api.requestCapabilityForRoomTimeline(roomId);

    // Incremental updates: timeline events. PL 0 by default, and encrypted by
    // the client in E2EE rooms.
    api.requestCapabilityToSendEvent(UPDATE_EVENT_TYPE);
    api.requestCapabilityToReceiveEvent(UPDATE_EVENT_TYPE);

    // Snapshots: room state. Omitting the state key means "any state key".
    api.requestCapabilityToSendState(SNAPSHOT_EVENT_TYPE);
    api.requestCapabilityToReceiveState(SNAPSHOT_EVENT_TYPE);

    // Needed to tell the user when the room is encrypted but snapshots are not.
    api.requestCapabilityToReceiveState("m.room.encryption");

    const roomEventListeners: RoomEventListener[] = [];
    const stateListeners: StateListener[] = [];
    let encrypted = false;

    let resolveStateReady: () => void;
    const stateReady = new Promise<void>(resolve => { resolveStateReady = resolve; });

    const ack = (ev: CustomEvent<IWidgetApiRequest>) => {
        ev.preventDefault();
        api.transport.reply(ev.detail, {});
    };

    const dispatchState = (events: IRoomEvent[]) => {
        for (const event of events) {
            if (event.room_id !== roomId) continue; // never trust the client to filter
            if (event.type === "m.room.encryption") {
                encrypted = !!(event.content as Record<string, unknown>)?.algorithm;
            }
        }
        const relevant = events.filter(e => e.room_id === roomId && e.type === SNAPSHOT_EVENT_TYPE);
        for (const listener of stateListeners) {
            try { listener(relevant); } catch (err) { console.warn("[ul] state listener failed", err); }
        }
        resolveStateReady();
    };

    api.on(`action:${WidgetApiToWidgetAction.SendEvent}`, (ev: CustomEvent<IWidgetApiRequest>) => {
        // Ack before doing work: the client's transport times out in 10s.
        ack(ev);
        const event = ev.detail.data as unknown as IRoomEvent;
        if (!event || event.room_id !== roomId) return;

        // Older clients that lack update_state deliver state via send_event too.
        if (event.state_key !== undefined) {
            if (event.type === SNAPSHOT_EVENT_TYPE || event.type === "m.room.encryption") {
                dispatchState([event]);
            }
            return;
        }

        if (event.type !== UPDATE_EVENT_TYPE) return;
        for (const listener of roomEventListeners) {
            try { listener(event); } catch (err) { console.warn("[ul] event listener failed", err); }
        }
    });

    api.on(`action:${WidgetApiToWidgetAction.UpdateState}`, (ev: CustomEvent<IWidgetApiRequest>) => {
        ack(ev);
        const data = ev.detail.data as unknown as { state?: IRoomEvent[] };
        dispatchState(Array.isArray(data?.state) ? data.state : []);
    });

    // These are not handled by the SDK either and would otherwise produce
    // "unsupported to-widget action" errors in the client console.
    api.on(`action:${WidgetApiToWidgetAction.ThemeChange}`, ack);
    api.on(`action:${WidgetApiToWidgetAction.LanguageChange}`, ack);
    api.on(`action:${WidgetApiToWidgetAction.WidgetConfig}`, ack);

    // Default is 10s, which large payloads on a slow homeserver can exceed.
    api.transport.timeoutSeconds = 30;

    api.start();
    await waitForReady(api, () => options.onAwaitingApproval?.());

    const canWriteSnapshots = api.hasCapability(
        `org.matrix.msc2762.send.state_event:${SNAPSHOT_EVENT_TYPE}` as never
    );
    if (!canWriteSnapshots) {
        warnings.push(
            "This client did not grant permission to write list snapshots. Your changes " +
            "still sync, but they only become durable once someone who can write snapshots " +
            "opens this list. See the README on lowering the power level for " +
            `${SNAPSHOT_EVENT_TYPE}.`
        );
    }
    if (rejectedOrigins > 0) {
        warnings.push("Some messages from an unexpected origin were ignored.");
    }

    return {
        context: {
            api,
            roomId,
            widgetId,
            clientOrigin: client.origin,
            userId: params.get("userId"),
            deviceId: params.get("deviceId"),
            canWriteSnapshots,
            isEncrypted: () => encrypted,
            onRoomEvent: (l) => { roomEventListeners.push(l); },
            onStateEvent: (l) => { stateListeners.push(l); },
            stateReady,
        },
        warnings,
    };
}

/**
 * Wait for the capability handshake to finish.
 *
 * `ready` only fires once the client sends notify_capabilities, and Element
 * sends that after the *user* approves the widget's permission prompt. That is
 * a human-speed step: a short timeout turns "the prompt is still on screen"
 * into a bogus "the client did not complete the handshake" failure, which is
 * exactly the wrong thing to tell someone who just needs to click Approve.
 *
 * So this waits effectively indefinitely, and reports slowness instead of
 * failing. onSlow lets the UI explain what the user should be looking for.
 */
function waitForReady(
    api: WidgetApi,
    onSlow: () => void,
    slowAfterMs = 8_000,
    giveUpAfterMs = 15 * 60_000,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const slowTimer = setTimeout(onSlow, slowAfterMs);
        const giveUpTimer = setTimeout(
            () => reject(new WidgetUnavailable(
                "The Matrix client never granted this widget permission to use the room."
            )),
            giveUpAfterMs,
        );
        api.once("ready", () => {
            clearTimeout(slowTimer);
            clearTimeout(giveUpTimer);
            resolve();
        });
    });
}

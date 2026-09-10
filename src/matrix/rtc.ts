// MatrixRTC transport: Yjs updates over a LiveKit data channel.
//
// Replaces the timeline events as the *live* path. Room events are rate
// limited (Synapse's rc_message, per user, shared with the user's own chat) and
// every update lands permanently in the room timeline. A LiveKit data channel
// has neither problem: it is unmetered by Matrix, sub-second, and leaves no
// trace in the room.
//
// What it cannot do is persist. A data channel only reaches whoever is
// connected right now, so a member opening the list when nobody else is online
// would see nothing. That is why the snapshot state event is kept - see
// provider.ts. The reference widget (toger5/matrixRTC-example) documents the
// same limitation: "New Joiners will not get the historic state".
//
// Session discovery and token exchange follow Element Call
// (src/livekit/openIDSFU.ts): OpenID token -> livekit-jwt-service -> {url, jwt}.

// livekit-client is ~130 KB gzipped - more than the rest of the app put
// together. It is loaded on demand so first paint never pays for it: the list
// renders from IndexedDB immediately and the RTC session attaches afterwards.
import type { RemoteParticipant } from "livekit-client";
import type { WidgetContext } from "./widget";

/**
 * The MatrixRTC "slot" this widget uses.
 *
 * Deliberately not the call slot: joining that would make Element show a call
 * in progress in the room. A dedicated slot keeps list sync invisible.
 */
export const RTC_SLOT_ID = "de.minagawa.ultimate_lists";

/** LiveKit data topic, so we ignore packets from anything else in the session. */
export const RTC_TOPIC = "de.minagawa.ultimate_lists";

/**
 * LiveKit caps a reliable data packet at ~15 KiB. Stay well under it - the
 * codec chunks anything larger.
 */
export const RTC_CHUNK_BYTES = 8 * 1024;

export type RtcMessageListener = (payload: Uint8Array, senderIdentity: string) => void;
export type RtcStateListener = (state: { connected: boolean; peers: number }) => void;

export interface RtcTransport {
    send(payload: Uint8Array): Promise<void>;
    onMessage(listener: RtcMessageListener): void;
    onStateChange(listener: RtcStateListener): void;
    readonly connected: boolean;
    readonly peers: number;
    destroy(): Promise<void>;
}

export class RtcUnavailable extends Error {}

interface SfuConfig {
    url: string;
    jwt: string;
}

// ----- focus discovery -----

/**
 * Find the LiveKit service URL for this homeserver.
 *
 * Order: ask the client (MSC4515, newest and cleanest - no network from the
 * widget), then a build-time override, then the server's well-known.
 */
async function discoverLivekitService(ctx: WidgetContext): Promise<string> {
    // 1. The embedding client already knows the transports.
    try {
        const transports = await ctx.api.getRtcTransports();
        for (const transport of transports?.rtc_transports ?? []) {
            const url = (transport as Record<string, unknown>).livekit_service_url;
            if (transport.type === "livekit" && typeof url === "string" && url.length > 0) {
                return url;
            }
        }
    } catch {
        // MSC4515 is very new; most clients will not implement it yet.
    }

    // 2. Explicit build-time configuration.
    const configured = (import.meta.env.VITE_LIVEKIT_SERVICE_URL as string | undefined)?.trim();
    if (configured) return configured;

    // 3. The server-name domain's well-known. Note this is the *server name*,
    //    not the homeserver base URL - a distinction that has broken Element
    //    Call before (MISSING_MATRIX_RTC_TRANSPORT).
    const serverName = serverNameOf(ctx);
    if (!serverName) throw new RtcUnavailable("Cannot determine the homeserver to discover MatrixRTC from.");

    try {
        const res = await fetch(`https://${serverName}/.well-known/matrix/client`, { credentials: "omit" });
        if (!res.ok) throw new Error(`well-known returned ${res.status}`);
        const body = await res.json() as Record<string, unknown>;
        const foci = body["org.matrix.msc4143.rtc_foci"];
        if (Array.isArray(foci)) {
            for (const focus of foci) {
                const url = (focus as Record<string, unknown>)?.livekit_service_url;
                if ((focus as Record<string, unknown>)?.type === "livekit" && typeof url === "string") return url;
            }
        }
    } catch (err) {
        throw new RtcUnavailable(
            `Could not discover a MatrixRTC transport for ${serverName}: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    throw new RtcUnavailable(`${serverName} advertises no LiveKit MatrixRTC transport.`);
}

function serverNameOf(ctx: WidgetContext): string | null {
    // userId is cosmetic and forgeable, but it is only used here to find a
    // public discovery document - not for any authorization decision.
    const fromUser = ctx.userId?.split(":").slice(1).join(":");
    if (fromUser) return fromUser;
    const fromRoom = ctx.roomId.split(":").slice(1).join(":");
    return fromRoom || null;
}

// ----- token exchange -----

async function getSfuConfig(ctx: WidgetContext, serviceUrl: string): Promise<SfuConfig> {
    const oidc = await ctx.api.requestOpenIDConnectToken();
    if (!oidc?.access_token) {
        throw new RtcUnavailable("The Matrix client did not provide an OpenID token for MatrixRTC.");
    }

    const openIdToken = {
        access_token: oidc.access_token,
        token_type: oidc.token_type ?? "Bearer",
        matrix_server_name: oidc.matrix_server_name,
        expires_in: oidc.expires_in,
    };

    const endpoint = `${serviceUrl.replace(/\/+$/, "")}/sfu/get`;

    // Current contract (room_id/slot_id/member), with a fallback to the older
    // room/device_id shape so this keeps working against either service build.
    const attempts: Record<string, unknown>[] = [
        {
            room_id: ctx.roomId,
            slot_id: RTC_SLOT_ID,
            openid_token: openIdToken,
            member: { id: ctx.userId ?? "", claimed_device_id: ctx.deviceId ?? undefined },
        },
        {
            room: `${ctx.roomId}:${RTC_SLOT_ID}`,
            openid_token: openIdToken,
            device_id: ctx.deviceId ?? "",
        },
    ];

    let lastError = "";
    for (const body of attempts) {
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                credentials: "omit",
            });
            if (!res.ok) { lastError = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 200); continue; }
            const json = await res.json() as Partial<SfuConfig>;
            if (typeof json.url === "string" && typeof json.jwt === "string") {
                return { url: json.url, jwt: json.jwt };
            }
            lastError = "response missing url/jwt";
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }
    }

    throw new RtcUnavailable(`Could not obtain a LiveKit token: ${lastError}`);
}

// ----- connect -----

export async function connectRtc(ctx: WidgetContext): Promise<RtcTransport> {
    const serviceUrl = await discoverLivekitService(ctx);
    const sfu = await getSfuConfig(ctx, serviceUrl);

    const { Room, RoomEvent } = await import("livekit-client");
    const room = new Room({ adaptiveStream: false, dynacast: false });

    const messageListeners: RtcMessageListener[] = [];
    const stateListeners: RtcStateListener[] = [];

    const emitState = () => {
        const state = { connected: room.state === "connected", peers: room.numParticipants };
        for (const listener of stateListeners) {
            try { listener(state); } catch { /* a bad listener must not break sync */ }
        }
    };

    room.on(RoomEvent.DataReceived, (
        payload: Uint8Array,
        participant?: RemoteParticipant,
        _kind?: unknown,
        topic?: string,
    ) => {
        if (topic !== RTC_TOPIC) return;
        const sender = participant?.identity ?? "";
        for (const listener of messageListeners) {
            try { listener(payload, sender); } catch (err) { console.warn("[ul] rtc listener failed", err); }
        }
    });

    room.on(RoomEvent.Connected, emitState);
    room.on(RoomEvent.Disconnected, emitState);
    room.on(RoomEvent.Reconnected, emitState);
    room.on(RoomEvent.ParticipantConnected, emitState);
    room.on(RoomEvent.ParticipantDisconnected, emitState);

    await room.connect(sfu.url, sfu.jwt);
    emitState();

    return {
        async send(payload: Uint8Array) {
            if (room.state !== "connected") return;
            await room.localParticipant.publishData(payload as never, {
                reliable: true,
                topic: RTC_TOPIC,
            });
        },
        onMessage(listener) { messageListeners.push(listener); },
        onStateChange(listener) { stateListeners.push(listener); listener({ connected: room.state === "connected", peers: room.numParticipants }); },
        get connected() { return room.state === "connected"; },
        get peers() { return room.numParticipants; },
        async destroy() {
            messageListeners.length = 0;
            stateListeners.length = 0;
            await room.disconnect().catch(() => {});
        },
    };
}

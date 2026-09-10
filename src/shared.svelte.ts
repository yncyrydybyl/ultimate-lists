import { SyncedStoreShape, TaskStatus } from "./types";
import { getYjsDoc, syncedStore, SyncedText } from "@syncedstore/core";
import { svelteSyncedStore } from "@syncedstore/svelte";
import { IndexeddbPersistence } from "y-indexeddb";
import { looksLikeWidget, bootstrapWidget, WidgetUnavailable, type WidgetContext } from "./matrix/widget";
import { MatrixYjsProvider, type ProviderStats } from "./matrix/provider";
import { connectRtc } from "./matrix/rtc";
import { MAX_COLUMNS } from "./validate";

export const localState = $state({
    mode: 'v' // start in view mode
});

const configSyncedStore = syncedStore(SyncedStoreShape);
const doc = getYjsDoc(configSyncedStore);

export const svelteStore = svelteSyncedStore(configSyncedStore);

export type SyncMode = "starting" | "matrix" | "local";

export const syncState = $state({
    mode: "starting" as SyncMode,
    /** Transport status, once running as a widget. */
    status: "connecting" as ProviderStats["status"],
    roomId: null as string | null,
    /** Cosmetic only - used to name the homeserver in the encryption warning. */
    userId: null as string | null,
    /** True when the room is E2EE. Snapshots are still stored unencrypted. */
    roomEncrypted: false,
    /** Fatal reason we fell back to local-only mode, if any. */
    fallbackReason: null as string | null,
    warnings: [] as string[],
    lastError: null as string | null,
    droppedEvents: 0,
    readOnly: false,
    /** The client has not granted capabilities yet - usually an unanswered prompt. */
    awaitingApproval: false,
    /** Which path live updates take: the MatrixRTC data channel, or room events. */
    transport: "timeline" as "rtc" | "timeline",
    /** Participants in the MatrixRTC session. */
    rtcPeers: 0,
    /** Why MatrixRTC could not be used, if it could not. */
    rtcUnavailable: null as string | null,
});

let provider: MatrixYjsProvider | null = null;
let persistence: IndexeddbPersistence | null = null;

/**
 * Seed a brand new document.
 *
 * Only ever runs against a genuinely empty document, and in a room only after
 * hydration, so we do not write defaults over a list that already exists.
 * Ids are deterministic so that if two clients do race on a brand new room the
 * results merge to the same shape rather than to two parallel boards.
 */
function seedDefaults() {
    if (configSyncedStore.config.numColumns === undefined) configSyncedStore.config.numColumns = 3;
    if (configSyncedStore.config.showBoxTagsInTasks === undefined) configSyncedStore.config.showBoxTagsInTasks = false;

    if (configSyncedStore.tags.length === 0) {
        configSyncedStore.tags.push(
            { name: "prio::high", color: '#dc143c' },
            { name: "today", color: '#008000' },
            { name: "focus", color: '#ffd700' },
            { name: "orga", color: '#008b8b' },
        );
    }

    if (configSyncedStore.boxes.length === 0) {
        configSyncedStore.boxes.push(
            { name: "Inbox", tags: [], id: 'default' },
            { tags: ['orga', 'today'], id: 'seed-orga-today', columnIndex: 1 },
            { tags: ['orga'], id: 'seed-orga', columnIndex: 1 },
            { tags: ['focus', 'today'], id: 'seed-focus-today', columnIndex: 2 },
            { tags: ['focus'], id: 'seed-focus', columnIndex: 2 },
        );
    }
}

/** Sample content, only ever for a purely local document. */
function seedLocalSampleTasks() {
    if (configSyncedStore.tasks.length === 0) {
        configSyncedStore.tasks.push(
            { title: new SyncedText('my prio high task'), id: crypto.randomUUID(), status: TaskStatus.New, tags: ['today', 'orga'] },
            { title: new SyncedText('my 2nd task'), id: crypto.randomUUID(), status: TaskStatus.New, tags: ['focus'] }
        );
    }
}

function documentIsEmpty(): boolean {
    return configSyncedStore.tasks.length === 0
        && configSyncedStore.boxes.length === 0
        && configSyncedStore.tags.length === 0;
}

/**
 * Remove duplicate boxes that a seeding race could have produced.
 * Runs once, well after hydration, and only ever deletes exact id duplicates.
 */
function dedupeBoxes() {
    const seen = new Set<string>();
    for (let i = configSyncedStore.boxes.length - 1; i >= 0; i--) {
        const box = configSyncedStore.boxes[i];
        const key = `${box.id}`;
        if (seen.has(key)) configSyncedStore.boxes.splice(i, 1);
        else seen.add(key);
    }
}

async function startLocalOnly(reason: string | null) {
    persistence = new IndexeddbPersistence("ul:local", doc);
    await persistence.whenSynced;

    seedDefaults();
    seedLocalSampleTasks();

    syncState.mode = "local";
    syncState.fallbackReason = reason;
}

async function startWidget(context: WidgetContext, warnings: string[]) {
    // Namespaced per room. A single global database name would load room A's
    // document into room B's session and then broadcast it there.
    persistence = new IndexeddbPersistence(`ul:${context.roomId}`, doc);
    await persistence.whenSynced;

    syncState.mode = "matrix";
    syncState.roomId = context.roomId;
    syncState.userId = context.userId;
    syncState.warnings = warnings;

    provider = new MatrixYjsProvider(doc, context);
    provider.onStats(stats => {
        syncState.status = stats.status;
        syncState.lastError = stats.lastError;
        syncState.droppedEvents = stats.droppedEvents;
        syncState.readOnly = stats.status === "readonly";
        syncState.transport = stats.transport;
        syncState.rtcPeers = stats.rtcPeers;
    });

    await provider.hydrate();

    // Live sync moves to the MatrixRTC data channel when one is available.
    // Failure here is not fatal: timeline events remain as the slower fallback,
    // and snapshots keep the list durable either way.
    try {
        const rtc = await connectRtc(context);
        provider.attachRtc(rtc);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn("[ul] MatrixRTC unavailable, using room events:", reason);
        syncState.rtcUnavailable = reason;
    }

    syncState.roomEncrypted = context.isEncrypted();

    // Only seed once the room's own content has had its chance to arrive.
    if (documentIsEmpty()) seedDefaults();

    setTimeout(dedupeBoxes, 5_000);
}

let started = false;

export async function initSync(): Promise<void> {
    if (started) return;
    started = true;

    if (!looksLikeWidget()) {
        await startLocalOnly(null);
        return;
    }

    try {
        const { context, warnings } = await bootstrapWidget({
            onAwaitingApproval: () => { syncState.awaitingApproval = true; },
        });
        syncState.awaitingApproval = false;
        await startWidget(context, warnings);
    } catch (err) {
        const reason = err instanceof WidgetUnavailable
            ? err.message
            : `Could not connect to the Matrix room: ${err instanceof Error ? err.message : String(err)}`;
        console.warn("[ul] falling back to local-only mode:", reason);
        if (!persistence) await startLocalOnly(reason);
        else { syncState.mode = "local"; syncState.fallbackReason = reason; }
    }
}

export function clampedColumnCount(value: number): number {
    return Math.min(MAX_COLUMNS, Math.max(1, value));
}

/**
 * Group related document writes into one Yjs update.
 *
 * This matters far more over Matrix than it did over WebRTC: reordering tasks
 * rewrites boxPositions for every task below the insertion point, and without a
 * transaction that is one Yjs update - and so one rate-limited Matrix event -
 * per task. Inserting at the top of a 500-task box would take over 40 minutes
 * of the room's entire send budget.
 */
export function transact<T>(fn: () => T): T {
    return doc.transact(fn);
}

if (import.meta.env.DEV) {
    // debug handle, stripped from production builds
    (globalThis as Record<string, unknown>).__ulDebug = { store: configSyncedStore, doc };
}

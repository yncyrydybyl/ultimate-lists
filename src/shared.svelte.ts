import { SyncedStoreShape, TaskStatus, type Box, type Config, type Tag, type Task } from "./types";
import { getYjsDoc, syncedStore } from "@syncedstore/core";
import { svelteSyncedStore } from "@syncedstore/svelte";
import { WebrtcProvider } from "y-webrtc";
import { IndexeddbPersistence } from "y-indexeddb";
import type { Subscriber } from "svelte/store";

export const localState = $state({
    mode: 'v' // start in view mode
});

// create SyncedStore store
const configSyncedStore = syncedStore(SyncedStoreShape);
const doc = getYjsDoc(configSyncedStore);
const webrtcProvider = new WebrtcProvider("my-document-id", doc, { password: "smtukvJevTs7Ll3ixftBBaR0aNbfuySlaOf96ZoBm7U=" });
const indexeddbProvider = new IndexeddbPersistence("my-document-id", doc);

// add initial values if syncedStore is empty
indexeddbProvider.once('synced', () => {
    console.log('once', configSyncedStore.config.numColumns);
    if (configSyncedStore.config.numColumns === undefined) configSyncedStore.config.numColumns = 3;
    if (configSyncedStore.config.showBoxTagsInTasks === undefined) configSyncedStore.config.showBoxTagsInTasks = false;
    if (configSyncedStore.tasks.length == 0) {
        configSyncedStore.tasks.push(
            { title: 'my prio high task', id: crypto.randomUUID(), status: TaskStatus.New, tags: ['today', 'orga'] },
            { title: 'my 2nd task', id: crypto.randomUUID(), status: TaskStatus.New, tags: ['focus'] }
        );
    }
    if (configSyncedStore.tags.length == 0) {
        configSyncedStore.tags.push(
            { name: "prio::high", color: 'crimson' },
            { name: "today", color: 'green' },
            { name: "focus", color: 'gold' },
            { name: "orga", color: 'darkcyan' },
        );
    }
    if (configSyncedStore.boxes.length == 0) {
        configSyncedStore.boxes.push(
            { name: "Inbox", tags: [], id: 'default'},
            { tags: ['orga', 'today'], id: crypto.randomUUID(), columnIndex: 1 },
            { tags: ['orga'], id: crypto.randomUUID(), columnIndex: 1 },
            { tags: ['focus', 'today'], id: crypto.randomUUID(), columnIndex: 2 },
            { tags: ['focus'], id: crypto.randomUUID(), columnIndex: 2 },
        );
    }
});

export const svelteStore = svelteSyncedStore(configSyncedStore);
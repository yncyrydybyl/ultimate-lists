<script lang="ts">
    import { syncState } from "./shared.svelte";

    // Name the homeserver concretely in the encryption warning.
    //
    // Prefer the user id: room ids created at room version 12 or later are bare
    // hashes with no ":server" half, so the room id yields nothing for them.
    const homeserver = $derived.by(() => {
        const fromUser = syncState.userId?.split(':').slice(1).join(':');
        if (fromUser) return fromUser;
        const fromRoom = syncState.roomId?.split(':').slice(1).join(':');
        if (fromRoom) return fromRoom;
        return 'the homeserver';
    });

    const label = $derived.by(() => {
        if (syncState.awaitingApproval && syncState.mode === "starting") return "Needs permission";
        if (syncState.mode === "starting") return "Connecting…";
        if (syncState.mode === "local") return "Local only";
        switch (syncState.status) {
            case "connecting": return "Connecting…";
            case "syncing": return "Syncing…";
            case "throttled": return "Waiting (rate limited)";
            case "error": return "Sync problem";
            case "readonly": return "Read only";
            default:
                return syncState.transport === "rtc"
                    ? `Live via MatrixRTC${syncState.rtcPeers > 1 ? ` · ${syncState.rtcPeers} online` : ""}`
                    : "Synced with room";
        }
    });

    const tone = $derived.by(() => {
        if (syncState.awaitingApproval && syncState.mode === "starting") return "is-warning";
        if (syncState.mode === "local") return "is-warning";
        switch (syncState.status) {
            case "error": return "is-danger";
            case "throttled":
            case "readonly": return "is-warning";
            case "synced": return "is-success";
            default: return "is-info";
        }
    });
</script>

<div id="sync-status">
    <span class="tag {tone}">{label}</span>

    {#if syncState.mode === "matrix" && syncState.roomEncrypted}
        <!--
          State events are never encrypted by Matrix at any spec version, and the
          snapshot that makes this list survive a cold join is a state event. In an
          encrypted room that means the list itself is stored in cleartext on the
          homeserver. This must not be dismissible: the risk is continuous.
        -->
        <div class="notification is-danger encryption-warning">
            <strong>This room is encrypted, but this list is not.</strong>
            The full list is stored unencrypted in the room's state on
            <code>{homeserver}</code>, where server administrators can read it.
            Don't put passwords or sensitive personal data in it.
        </div>
    {/if}

    {#if syncState.awaitingApproval && syncState.mode === "starting"}
        <div class="notification is-warning">
            <strong>Waiting for permission.</strong>
            Your Matrix client is asking whether this widget may read and write
            the list in this room — look for the prompt and choose
            <em>Continue</em>. Syncing starts as soon as you do.
        </div>
    {/if}

    {#if syncState.mode === "local" && syncState.fallbackReason}
        <div class="notification is-warning">
            <strong>Not syncing.</strong>
            {syncState.fallbackReason} Changes are saved in this browser only.
        </div>
    {/if}

    {#if syncState.readOnly}
        <div class="notification is-warning">
            <strong>Read only.</strong>
            {syncState.lastError ?? "Your changes are not being sent to the room."}
        </div>
    {:else if syncState.lastError}
        <div class="notification is-danger">{syncState.lastError}</div>
    {/if}

    {#each syncState.warnings as warning}
        <div class="notification is-warning">{warning}</div>
    {/each}

    {#if syncState.droppedEvents > 0}
        <div class="notification is-warning">
            Ignored {syncState.droppedEvents} invalid or excessive update{syncState.droppedEvents === 1 ? '' : 's'} from the room.
        </div>
    {/if}
</div>

<style>
    #sync-status {
        position: fixed;
        top: 0.5rem;
        right: 0.5rem;
        z-index: 40;
        max-width: min(30rem, 90vw);
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.4rem;
        pointer-events: none;
    }

    #sync-status .notification {
        pointer-events: auto;
        padding: 0.6rem 0.9rem;
        font-size: 0.85rem;
        margin-bottom: 0;
    }

    #sync-status .encryption-warning {
        /* the one message that must never be missed */
        font-size: 0.9rem;
    }
</style>

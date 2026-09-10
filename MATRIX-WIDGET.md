# Running ultimate lists as a Matrix widget

The list is stored as a [Yjs](https://yjs.dev) CRDT document and synced through
the Matrix room itself, so every member of the room sees and edits the same
list. There is no server component beyond your homeserver and a static web host.

---

## Read this before you put anything in a shared list

**The list is shared with the entire room, with no per-item permissions.**
Anyone who can send `de.minagawa.ultimate_lists.update` in the room can read the
whole list and rewrite, corrupt, or delete **all** of it — not just the items
they created. A CRDT has no concept of ownership: an edit from a hostile member
is structurally identical to a legitimate one and cannot be rejected after the
fact. **Matrix power levels are the only access control that exists.**

Who can *read* the list is controlled by the room's join rules and history
visibility. A public room means a public task list.

**In an encrypted room, the list is still stored unencrypted.** Matrix does not
encrypt room *state* events at any spec version, and the snapshot that lets a
new member load the list is a state event. So in an E2EE room:

- incremental updates (timeline events) **are** encrypted by your client;
- the periodic full snapshot (a state event) **is not**, and sits in cleartext
  on the homeserver, federated in cleartext to every participating server.

The widget detects this and shows a permanent warning naming the homeserver.
Don't put passwords or sensitive personal data in a shared list.

Removing someone from the room stops future updates reaching them. It does not
retract anything they already saw, and there is no re-keying.

---

## Installing the widget

### 1. Build and host

```shell
nvm use 24          # Vite 8 requires Node ^20.19 || ^22.12 || >=24
yarn
yarn build
```

Serve `dist/` over HTTPS from an origin that hosts nothing else.

**By default any Matrix client may embed the widget.** That is deliberate:
Element Desktop is an Electron app that frames widgets from `vector://vector`,
a non-special scheme which cannot be written as an `https://` allowlist entry,
cannot be used as a `postMessage` target origin, and which `new URL().origin`
reports as the literal string `"null"`. Any allowlist of https origins locks the
desktop client out completely.

Even in the default mode the widget still pins its `postMessage` target origin
whenever the embedding client has a normal web origin, and only falls back to
`"*"` for clients that do not (desktop). It also filters inbound messages by
origin whenever it has one to compare against.

To lock the widget down to specific **web** clients — giving up desktop support
— set the allowlist at build time *and* narrow `frame-ancestors` in
`deploy/nginx/default.conf` to match. Both must allow a client:

```shell
VITE_ALLOWED_CLIENT_ORIGINS="https://app.element.io,https://element.example.org" yarn build
```

In that mode a client origin not on the list causes the widget to refuse to
start rather than degrade to something permissive. Setting the variable to `*`
is the same as leaving it unset.

### 2. Recommended response headers

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'none';
  frame-ancestors *;
  form-action 'none'; base-uri 'none'; object-src 'none'; upgrade-insecure-requests
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

`connect-src 'none'` is deliberate and worth keeping: all syncing happens over
`postMessage`, which CSP does not govern, so the page needs **zero** network
access after load. That single directive removes most exfiltration paths, and it
still holds with framing left open.

`frame-ancestors *` is what makes Element Desktop work (see above). The
consequence to be aware of: any website can put this page in an iframe. It holds
no data and no credentials of its own — the list lives in the Matrix room, and a
frame with no Matrix client behind it gets a widget that never completes its
handshake and falls back to an empty local-only list. Narrow it if you only care
about specific web clients.

Do **not** send `X-Frame-Options` — it cannot express an allowlist and will
break embedding. Serve the HTML entry point with a short cache lifetime so
security fixes can actually roll out; hashed assets under `assets/` can be
cached immutably.

### 3. Add it to a room

Use Element's `/devtools` → *Send custom state event*, with event type
`im.vector.modular.widgets` and a state key of your choice
(e.g. `ultimate-lists`):

```json
{
  "type": "m.custom",
  "name": "Ultimate Lists",
  "url": "https://lists.example.org/index.html#/?roomId=$matrix_room_id&userId=$matrix_user_id&theme=$org.matrix.msc2873.client_theme",
  "creatorUserId": "@you:example.org",
  "data": { "title": "Shared lists" }
}
```

`roomId` is required. The parameters go in the URL **fragment** so user ids
never reach the widget host's access logs; Element appends `widgetId` and
`parentUrl` to the query string itself.

The quicker `/addwidget <url>` also works, but it gives you no control over the
widget id or `data`.

Adding a widget needs power level 50 in most rooms.

### 4. Let ordinary members compact the list (recommended)

Snapshots are room **state** events, which default to requiring power level 50.
Without this step the list still syncs for everyone, but only members with PL 50
can write snapshots — and until one of them opens the widget, a new member's
cold start depends on the room's short readable timeline window.

In `/devtools` → *Explore room state* → `m.room.power_levels`, add an entry
under `events` (send the **whole** merged content — this is a replace, not a
patch):

```json
{
  "users": { "@admin:example.org": 100 },
  "users_default": 0,
  "events_default": 0,
  "state_default": 50,
  "events": {
    "de.minagawa.ultimate_lists.snapshot": 0
  }
}
```

To make the list **read-only** for most members instead, raise the update event:

```json
"events": {
  "de.minagawa.ultimate_lists.update": 50,
  "de.minagawa.ultimate_lists.snapshot": 50
}
```

---

## How syncing works

| | Event type | Kind | Role |
|---|---|---|---|
| Deltas | `de.minagawa.ultimate_lists.update` | timeline | Fast propagation of edits. Encrypted in E2EE rooms. PL 0 by default. |
| Snapshot | `de.minagawa.ultimate_lists.snapshot` | state, keys `c0`…`cN` | Source of truth for cold joins. Never encrypted. PL 50 by default. |

Both carry the same payload format: a Yjs v2 update, deflate-compressed,
base64-encoded, split across events at 24 KiB of compressed data each, with a
truncated SHA-256 so torn or corrupted multi-part payloads are rejected rather
than applied.

**Why both.** A widget can only read back roughly 20–50 timeline events — Element
serves widget timeline reads from the client's in-memory live timeline and never
backfills — so timeline data can never be the only copy of anything. Room state,
by contrast, is pushed to every client in full on join. Hence: state is the
source of truth, the timeline is a latency optimisation.

**Convergence.** A client whose document contains state the published snapshot
lacks rewrites the snapshot, at most once every two minutes and only while the
send budget is healthy. Because Yjs is a CRDT, whichever client writes last
produces a snapshot that subsumes everyone's edits. Comparing state vectors
before writing is what stops this from becoming a write storm.

**Rate limiting.** Synapse allows about 0.2 events/second sustained per *user*
(burst 10) — shared with that user's own chat messages. The widget runs a token
bucket against that budget, coalescing edits over 0.75–8 s depending on how much
allowance is left, merging pending updates before sending, and backing off on
`M_LIMIT_EXCEEDED` by draining its own bucket rather than just sleeping once.
Snapshots are restricted to the top of the bucket so they never starve typing.

**Offline.** Edits are applied locally first and cached in IndexedDB (namespaced
per room), so the list works offline and reloads instantly. Pending changes are
sent when the budget allows.

---

## Limitations

- **Element Web/Desktop only.** Widgets are not part of the Matrix spec; this
  builds on MSC2762/MSC2871/MSC2876 as implemented by Element. Other clients
  are untested.
- **No per-item permissions**, as described above.
- **Ordering uses integer positions.** Reordering rewrites the position of every
  task below the insertion point. These writes are batched into a single Matrix
  event, so it is cheap on the wire, but fractional indexing would avoid the
  rewrite entirely and is the right long-term fix.
- **A brand-new room can race on seeding.** If two members open the widget
  simultaneously in an empty room, both may seed default boxes; duplicates by id
  are cleaned up shortly after joining.
- The widget refuses to run outside its configured client origins, and falls
  back to a local-only list if the handshake fails — the status indicator says
  which mode it is in.

---
phase: 05-pixel-office-renderer
reviewed: 2026-09-21T12:00:00Z
depth: standard
scope: incremental (diff_base a9eed1c — plans 05-09, 05-10, 05-11, 05-12)
files_reviewed: 22
files_reviewed_list:
  - apps/api/src/routes/ws-browser.ts
  - apps/api/src/routes/ws-browser.test.ts
  - apps/api/src/ws/browser-connections.ts
  - apps/api/src/ws/browser-connections.test.ts
  - apps/web/src/App.tsx
  - apps/web/src/App.test.tsx
  - apps/web/src/agent-event-mapper.ts
  - apps/web/src/agent-event-mapper.test.ts
  - packages/claude-adapter/package.json
  - packages/claude-adapter/src/claude-code-runtime.ts
  - packages/claude-adapter/src/claude-code-runtime.test.ts
  - packages/pixel-office/src/engine/characters.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/index.test.ts
  - packages/pixel-office/src/sprites/spriteData.ts
  - packages/pixel-office/src/sprites/spriteData.test.ts
  - packages/pixel-office/src/types.ts
  - references/ASSET-LICENSES.md
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 2
  warning: 8
  info: 6
  total: 16
status: issues_found
---

# Phase 5: Code Review Report (incremental)

**Reviewed:** 2026-09-21T12:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

This pass covers only what plans 05-09 through 05-12 changed since the previous
REVIEW.md commit (`a9eed1c`). Those plans existed to close CR-01..CR-04, WR-01,
WR-08, IN-04 and IN-06, so the review was aimed at two questions: is each fix at
the root, and did the fix introduce a new defect.

Most of the fixes hold at the root. `applyLiveEvent` genuinely routes the live
path through company-core's own `reduce`, so a second derivation table can no
longer drift (and its reference-inequality diff is sound — every reducer handler
in `packages/company-core/src/reducer.ts` returns a fresh object per touched
agent, and untouched agents keep identity). `resolveBubbleY` really is
owner-bound now, and the desk re-pitch (`DESK_ROW_START=3`/`DESK_ROW_PITCH=3`)
is arithmetically correct against the engine's own geometry — row 3's glyph
occupies y 9..22 with the sprite box at 24, row 6's occupies 57..70 against
row 3's box ending at 56. `getCharacterSprites` really did lose the dead
parameter, and the hue is now genuinely read. The `delete-trigger` decision was
carried out: no in-repo producer fabricates a handoff pair any more.

Two changes are not sound.

The CR-03 `/ws/browser` fix converted a **lost**-event window into a
**duplicated**-event window, and nothing anywhere dedups by event id. That is
not cosmetic: the handoff choreography FSM is not idempotent, and a duplicated
`agent.handoff_requested` strands the sending character at another agent's desk,
holding a task icon, permanently — a fabricated visual state, which is the exact
class of defect this phase's Core Value prohibits (CR-01 below).

The CR-03 `inFlight` fix in `claude-code-runtime.ts` has a stale-write race that
re-opens the very defect it closed, in the one scenario the flag exists for
(CR-02 below).

Beyond those, the new live harness (`scripts/verify-pixel-office-live.mjs`) makes
several guarantees in its own comments that its code does not actually deliver —
its "unambiguous proof" colour partition is computed against the un-hue-shifted
sprite sheet while every character it renders is hue-shifted (verified: 11 of the
12 hue buckets are in use across its own agent ids), its "can never test two
different API processes" port derivation silently falls back, and its process
cleanup leaks dev servers on POSIX. None of those are shipped code, but the
phase's whole evidentiary claim rests on that file, so they are treated as
defects, not nits.

---

## Critical Issues

### CR-01: The `/ws/browser` snapshot fix replaces event loss with event duplication, and a duplicated handoff strands a character permanently

**File:** `apps/api/src/routes/ws-browser.ts:36-42`, `apps/api/src/ws/browser-connections.ts:25-53`, `apps/web/src/App.tsx:51-77`

**Issue:**
The fix registers the socket before the awaited snapshot SELECT and buffers
broadcasts until the snapshot has gone out. That closes the "committed mid-SELECT
and reached neither" window. It opens the symmetric one, because
`apps/api/src/routes/events.ts:47-86` commits the insert *and then* broadcasts:

1. `registerBrowserSocket(socket)` runs; the socket is buffering.
2. `db.select()` is created but has not yet acquired a pool connection / begun
   executing (the pool is shared with `POST /events`, so this is not a narrow
   window).
3. `POST /events` inserts and commits event `E`, then calls
   `broadcastToBrowsers` → `E` is pushed into this socket's buffer.
4. The SELECT statement *now* begins; under READ COMMITTED its snapshot is taken
   at statement start, so it sees `E`. `E` is folded into the snapshot state.
5. `flushBrowserSocket` delivers the buffered `E` on top of the snapshot that
   already contains it.

The client has no dedup: `ws-client.ts` forwards every `type: "event"` message,
`applyLiveEvent` re-`reduce`s it, and the snapshot message carries no event ids,
so the client *cannot* dedup even if it wanted to.

Most reducer handlers are idempotent, so this mostly passes unnoticed — but
`handoff-choreography.ts` is a stateful FSM and is not:

- duplicate `agent.handoff_requested` → `handoffs.set(taskId, {... phase:
  "WALKING_TO_RECEIVER"})` **overwrites** the existing record and re-issues
  `walkCharacterTo`;
- the following duplicate `agent.handoff_completed` hits
  `if (!record || record.phase !== "ICON_VISIBLE") return;`
  (`handoff-choreography.ts:61`) and no-ops;
- the sender then walks to the receiver's desk, arrives, gets the
  `handoff-task` bubble at `checkHandoffArrivals` and **stays there forever**,
  displaying a task it already handed off, at someone else's desk, until the
  page is reloaded.

The buffering tests (`browser-connections.test.ts`) and the route test
(`ws-browser.test.ts:222`) only exercise the ordering, never the
snapshot-overlap case, so this is invisible to the suite.

**Fix:** dedup at the flush boundary, server-side, where the snapshot's own ids
are already in hand. Queue the id alongside the payload and drop anything the
snapshot already contained:

```ts
// browser-connections.ts
type Queued = { id?: string; payload: string };
const browserSockets = new Map<WebSocket, Queued[] | null>();

export function flushBrowserSocket(socket: WebSocket, alreadySent: Set<string>): void {
  const queued = browserSockets.get(socket);
  if (queued === undefined) return;
  browserSockets.set(socket, null);
  if (!queued || socket.readyState !== socket.OPEN) return;
  for (const { id, payload } of queued) {
    if (id && alreadySent.has(id)) continue; // already folded into the snapshot
    socket.send(payload);
  }
}

export function broadcastToBrowsers(message: unknown, eventId?: string): void { /* ... */ }
```

```ts
// ws-browser.ts
const rows = await db.select().from(events).orderBy(events.occurredAt);
const companyEvents = rows.map(rowToCompanyEvent);
socket.send(JSON.stringify({ type: "snapshot", state: fold(companyEvents) }));
flushBrowserSocket(socket, new Set(rows.map((r) => r.id)));
```

Add a regression test that posts an event, waits for the 202, *then* opens the
socket while a second event is in flight, and asserts no event id is delivered
twice.

---

### CR-02: A superseded `runQuery` invocation clears `record.inFlight` for the invocation that replaced it, re-opening CR-03

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:130-138, 290-300`

**Issue:**
`record.inFlight` is a single shared field on the task record, but its `finally`
writer is per-invocation:

```ts
if (record.inFlight) {
  const exitedCleanly = await attemptGracefulStop(record);
  if (!exitedCleanly) record.controller?.abort();   // <- returns immediately; the old
}                                                   //    loop has NOT drained yet
const controller = new AbortController();
record.controller = controller;
record.inFlight = true;                             // invocation B claims the record
```

`attemptGracefulStop` returns `false` by *timing out* after `GRACEFUL_TIMEOUT_MS`
(line 324) — it does not wait for the abort to take effect. So when invocation A
does not exit gracefully (exactly the case this branch exists for), A's stream
throws some time after the abort, A's `finally` runs, and line 299 executes
`record.inFlight = false` — on a record that now belongs to invocation B, which
is genuinely in flight.

A third call (`sendMessage`/`resumeTask`) then sees `inFlight === false`, skips
the stop branch entirely, and starts a *third* concurrent `query()` — orphaning
B's watchdog, B's role-poll `setInterval`, and B's controller, with no way for
`pauseTask`/`cancelTask` to reach it. That is verbatim the defect the CR-03
comment on lines 22-26 says this field prevents. The suite never covers it: no
test issues a second `runQuery` against a `hangingQuery`.

**Fix:** make the flag per-invocation-owned, so a superseded invocation cannot
write it.

```ts
interface TaskRecord { /* ... */ currentRun?: object; }

const invocation = {};
record.currentRun = invocation;
record.controller = controller;
record.inFlight = true;
// ...
} finally {
  watchdog.clear();
  if (rolePoll) clearInterval(rolePoll);
  if (record.currentRun === invocation) record.inFlight = false;
}
```

The same guard should wrap the watchdog callback's `record.status = "blocked"`
write (lines 199-206), which can likewise land on a successor invocation.

---

## Warnings

### WR-01: `/ws/browser` attaches its `close`/`error` handlers only after the awaited SELECT — a client that disconnects during the snapshot is never unregistered

**File:** `apps/api/src/routes/ws-browser.ts:36-60`

**Issue:** `registerBrowserSocket(socket)` now runs at line 36, but
`socket.on("close")` / `socket.on("error")` are not attached until lines 55-60,
*after* the awaited SELECT. A client that connects and drops during the snapshot
window (StrictMode double-mount in `apps/web/src/main.tsx` does exactly this on
every dev page load, and so does any refresh) fires `close` before any listener
exists, so the entry is never removed from `browserSockets`. The map then grows
without bound for the process lifetime, and every subsequent `broadcastToBrowsers`
iterates the dead entries. If the SELECT is slow, the dead entry is still in the
buffering state, so each broadcast also `push`es a payload into a queue that will
never be flushed or freed.

**Fix:** attach the lifecycle handlers in the same synchronous block as the
registration, before the first `await`:

```ts
registerBrowserSocket(socket);
socket.on("close", () => unregisterBrowserSocket(socket));
socket.on("error", () => unregisterBrowserSocket(socket));
try {
  const rows = await db.select()...
```

The catch block's `unregisterBrowserSocket` then becomes redundant but harmless.

---

### WR-02: The CR-01 env-leak fix strips only `ANTHROPIC_API_KEY`, leaving every other credential override in place

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:147-154`

**Issue:** The stated guarantee (lines 54-58: "never reads/logs/forwards
ANTHROPIC_API_KEY or any `~/.claude/` OAuth credential") is enforced against one
variable name:

```ts
env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ANTHROPIC_API_KEY")),
```

`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY_HELPER`, `ANTHROPIC_BASE_URL`,
`CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` (plus the AWS/GCP
credentials those activate) all override CLI subscription auth just as
effectively, and all are still forwarded verbatim. The fix is at the symptom
(the one variable the review named), not at the root (any ambient credential
override).

**Fix:** strip the family, in one place, so a new variable name is a one-line
change:

```ts
const AUTH_OVERRIDE_ENV = /^(ANTHROPIC_(API_KEY|AUTH_TOKEN|API_KEY_HELPER|BASE_URL)|CLAUDE_CODE_USE_(BEDROCK|VERTEX))$/;
// ...
env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !AUTH_OVERRIDE_ENV.test(k))),
```

---

### WR-03: Desk slots are never reclaimed, and the new row pitch cuts capacity from 162 to 54 before characters start overlapping

**File:** `packages/pixel-office/src/index.ts:106-117, 126-143`

**Issue:** `nextSlot` is monotonic and is only ever incremented, while
`upsertCharacterFromAgent` **deletes** the character on `AgentStatus.OFFLINE`
(line 134). An agent that goes offline and comes back therefore gets a *new*
slot, and its old one is burned forever. Before 05-10 the layout had
9 interior rows × 18 = 162 slots; the re-pitch to rows 3/6/9 leaves 54. Past 54,
`Math.min(row, DEFAULT_ROWS - 2)` (line 115) clamps every further agent onto
interior row 9 at `1 + (slot % 18)` — i.e. characters are drawn **stacked on top
of each other**, silently, with no indication that two agents share a desk. A
worker process that restarts a few dozen times reaches this in a normal session,
with only three real agents on the floor.

The `ponytail:` comment acknowledges the >54 ceiling but not the churn path that
reaches it with far fewer live agents, and `index.test.ts`'s overflow test
asserts only that the clamp stays inside the wall border, never that two
characters do not share a tile.

**Fix:** reclaim the slot on despawn — the seat is already on the character:

```ts
const freeSlots: number[] = [];
// in the OFFLINE branch, before characters.delete(agentId):
const gone = characters.get(agentId);
if (gone) freeSlots.push(slotOf(gone)); // or store the slot on the Character
// in nextDeskPosition():
const slot = freeSlots.shift() ?? nextSlot++;
```

`_resetForTests` must clear `freeSlots` too.

---

### WR-04: The live harness's "unambiguous proof" colour partition is computed against the un-hue-shifted sprite sheet

**File:** `scripts/verify-pixel-office-live.mjs:214-251`

**Issue:** `characterColors()` reads the raw `character-metrocity.json` palette,
and `distinctiveBubbleColors` keeps only bubble colours absent from that set,
documented as "unambiguous proof the bubble itself was painted, not the character
underneath it" (lines 229-234). But 05-10's WR-08 fix means every character on
that canvas is drawn through `adjustSprite` with a per-agent hue shift — verified
against the harness's own ids, 11 of the 12 hue buckets are in use
(`live-proof-sender` 300°, `live-proof-blocked` 150°, the 19-agent cohort spans
0/30/60/90/120/150/180/210/240/270/300/330). The 31 palette colours become 284
distinct rendered colours, none of which `characterColors()` knows about.

Consequences: (a) the `found.size === 0` "shares every colour" guard (line 245)
can no longer detect a genuinely non-distinctive glyph; (b) a hue-shifted
character pixel that happens to equal a bubble colour is counted as a bubble hit,
which would make TRUTH 2/3/4 pass on the wrong pixels and TRUTH 1's
`blockedHits === 0` baseline fail spuriously. I checked the current assets — no
collision exists today (`#d62828`, `#7209b7`, `#e0d7f5` are absent from all 284
shifted colours) — so this is latent, not currently failing. Nothing enforces it:
one re-authored glyph or one more hue bucket silently turns a PASS into a false
positive, in the file the phase's entire evidence rests on.

**Fix:** build the character colour set from the colours actually rendered, not
the source sheet — expand the raw palette through `adjustSprite` for all 12
buckets (the same 0/30/…/330 set `hueForAgentId` can produce) before subtracting
it, and keep the `found.size === 0` guard so the harness halts if a glyph stops
being distinctive.

---

### WR-05: `killChildren` cannot kill the dev servers it spawned on POSIX

**File:** `scripts/verify-pixel-office-live.mjs:265-291`

**Issue:** `spawnBackground` uses `shell: true` and does **not** pass
`detached: true`, so the child is not a process-group leader. `killChildren`
then does `process.kill(-child.pid, "SIGTERM")` (line 286), which targets a
process group whose id equals the shell's pid — a group that does not exist
(`ESRCH`, caught, falling back to `child.kill("SIGKILL")` on the shell only, not
the `pnpm`/`vite`/`tsx` grandchildren) or, worse, an unrelated group that happens
to own that pgid. Every POSIX run therefore leaks a Vite server on 5177 and an
API dev server on the API port; the *next* run's `ensureServer` then "reuses"
them (see WR-06).

**Fix:** `spawn(..., { detached: process.platform !== "win32", ... })`, which
makes `-child.pid` a real process group, and keep the existing `taskkill /T`
branch for Windows.

---

### WR-06: `ensureServer` will happily run the whole destructive proof against a developer's own dev database

**File:** `scripts/verify-pixel-office-live.mjs:313-323, 490-500`

**Issue:** `assertHarnessOwnedTarget` carefully proves the *harness's* target is
the compose container — and then `ensureServer` reuses **any** process already
answering on the API port, whatever database it is connected to, and the run
posts real events and issues a real worker credential through it. The
inline defence (lines 492-494: "a reused server pointed at some other database
shows up immediately as a non-empty office at the empty-canvas assertion") only
holds if that database is non-empty. A developer whose dev store is empty (fresh
clone, just-reset dev DB) gets a silent PASS *and* permanent `live-proof-*`
worker/agent/task rows appended into their dev event store — which
`0001_append_only_trigger.sql` and `0003_no_truncate_trigger.sql` make impossible
to remove by design.

**Fix:** do not reuse an API server whose database is unverified. Either always
spawn a fresh one on a dedicated harness port, or add the resolved database name
to `GET /health`'s response and refuse to reuse a server that does not report
`COMPOSE_TARGET.db`.

---

### WR-07: The "can never test two different API processes" port derivation silently falls back

**File:** `scripts/verify-pixel-office-live.mjs:143-148`

**Issue:**

```js
const wsBase = webEnv.VITE_WS_BASE_URL ?? "";
const API_PORT = Number(wsBase.match(/:(\d+)\s*$/)?.[1] ?? apiEnv.PORT ?? 3000);
```

The stated guarantee is that the harness posts to the same server the browser
talks to. But `parseEnvFile` returns `{}` for a missing `apps/web/.env` (which,
unlike `apps/api/.env`, is never validated — the required-keys loop at lines
77-83 checks only `apiEnv`), so `wsBase` becomes `""`, the regex misses, and the
port silently falls back to `apiEnv.PORT ?? 3000`. In that state the browser
builds its socket URL as `undefined/ws/browser` (`ws-client.ts:15`), the office
stays empty, the empty-canvas assertion *passes*, and the run fails later at
TRUTH 1 with a message about sprites that has nothing to do with the real cause.
The same fallback fires if `VITE_WS_BASE_URL` ever carries a path suffix.

**Fix:** validate `VITE_WS_BASE_URL` and `VITE_BROWSER_ACCESS_TOKEN` with the
same required-keys loop used for `apiEnv`, and throw when the port cannot be
parsed out of `VITE_WS_BASE_URL` rather than guessing.

---

### WR-08: The snapshot message is trusted unvalidated and now seeds the entire live projection

**File:** `apps/web/src/ws-client.ts:27-31`, `apps/web/src/App.tsx:36-49`

**Issue:** relayed events are re-validated client-side with
`CompanyEventSchema.safeParse` ("defense in depth (T-05-02)"), but the snapshot
is passed through with a bare `state as ProjectionState`. 05-09 raised the cost
of that asymmetry: the snapshot is now assigned to `projectionRef.current` and
becomes the `prev` argument of every subsequent `reduce` call. A snapshot missing
`agents` throws inside the WebSocket `message` listener at
`Object.entries(state.agents)` — an uncaught exception in an event handler, which
leaves the office frozen with no "Disconnected" banner (the socket is still open),
i.e. exactly the silent-freeze failure mode 05-09's own must_haves calls out.

**Fix:** validate the snapshot shape at the same boundary — at minimum
`if (!state || typeof state !== "object" || !state.agents || !state.tasks) return;`
before handing it to `onSnapshot`, ideally a zod schema alongside
`CompanyEventSchema`.

---

## Info

### IN-01: Dead identity branch in `getCharacterSprites`

**File:** `packages/pixel-office/src/sprites/spriteData.ts:75`

**Issue:** `colorAdjust` is defined with a ternary whose else-branch is the
identity function, but the binding is only ever referenced inside
`if (hueShift !== 0)` (lines 98-104). The identity branch is unreachable.
**Fix:** drop the ternary — `const colorAdjust = (s: SpriteData) => adjustSprite(s, { h: hueShift, s: 0, b: 0, c: 0 });`

### IN-02: Zero-hue sprite frames alias the imported JSON module

**File:** `packages/pixel-office/src/sprites/spriteData.ts:67-96`

**Issue:** for `hueShift === 0`, `walk`/`typing`/`reading` hold direct references
into `characterData` (and the same row arrays are shared between the two `d[1]`
entries). Nothing mutates sprites today, so this is currently harmless, but any
future in-place pixel edit would corrupt the checked-in asset for every consumer.
**Fix:** a comment stating the frames are shared-immutable, or a shallow copy on
the zero-hue path.

### IN-03: `useRef(emptyState())` allocates a discarded projection on every render

**File:** `apps/web/src/App.tsx:23`
**Fix:** `useRef<ProjectionState | null>(null)` with lazy init, or accept it and
note that `emptyState()` is cheap. Cosmetic only.

### IN-04: The live harness silences all child stdout/stderr

**File:** `scripts/verify-pixel-office-live.mjs:273-274`

**Issue:** `child.stdout.on("data", () => {})` / same for stderr. When a dev
server fails to boot, the operator sees only `never became reachable within
90000ms` with no cause. **Fix:** buffer the last ~50 lines and print them in the
`waitFor` timeout error.

### IN-05: `parseComposeTarget` takes the first published port in the file

**File:** `scripts/verify-pixel-office-live.mjs:99-107`

**Issue:** the regex matches the first `- "host:container"` line anywhere in
`docker-compose.test.yml`. Correct for today's single-service file; it silently
picks the wrong service's port the moment a second one is added.
**Fix:** anchor the match under the `postgres:` service block, or fail if more
than one `ports:` mapping is present.

### IN-06: The browser access token still travels in the WebSocket query string

**File:** `apps/web/src/ws-client.ts:15`, `apps/api/src/routes/ws-browser.ts:16`

**Issue:** pre-existing and documented (a browser `WebSocket` cannot set headers),
but worth restating now that this route is being actively modified: the shared
token lands in any reverse-proxy/access log that records request URLs. Noted
because the route file is in scope, not as a new regression — the INTERNAL-tier
acceptance (T-05-03) still stands.
**Fix:** when Phase 7's visibility filtering ships, move to a short-lived
single-use ticket fetched over HTTP and redeemed in the first WS frame.

---

_Reviewed: 2026-09-21T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

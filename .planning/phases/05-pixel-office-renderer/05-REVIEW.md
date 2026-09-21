---
phase: 05-pixel-office-renderer
reviewed: 2026-09-21T16:25:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - apps/api/src/routes/events.test.ts
  - apps/api/src/routes/events.ts
  - apps/api/src/routes/ws-browser.test.ts
  - apps/api/src/routes/ws-browser.ts
  - apps/web/src/App.tsx
  - apps/web/src/agent-event-mapper.test.ts
  - apps/web/src/agent-event-mapper.ts
  - packages/claude-adapter/src/claude-code-runtime.test.ts
  - packages/claude-adapter/src/claude-code-runtime.ts
  - packages/pixel-office/package.json
  - packages/pixel-office/scripts/decode-metrocity-sprites.mjs
  - packages/pixel-office/src/constants.ts
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/sprites/bubble-handoff-task.json
  - packages/pixel-office/src/sprites/bubble-permission.json
  - packages/pixel-office/src/sprites/bubble-waiting.json
  - packages/pixel-office/src/sprites/bubbleSprites.test.ts
  - packages/pixel-office/src/sprites/bubbleSprites.ts
  - packages/pixel-office/src/sprites/spriteData.test.ts
  - packages/pixel-office/src/sprites/spriteData.ts
  - packages/pixel-office/tsconfig.json
  - references/ASSET-LICENSES.md
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 4
  warning: 11
  info: 8
  total: 23
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-21T16:25:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

This is the post-gap-closure review of phase 05 (plans 05-05 … 05-08), replacing the
pre-gap-closure 05-REVIEW.md. It supersedes that document entirely.

**Status of the four previously-reported defects (verified against current source, not
re-reported from the stale doc):**

| Prior finding | Verdict |
|---|---|
| CR-01 worker event allow-list | **Fixed** — `WORKER_ALLOWED_EVENT_TYPES` now carries all 7 producer-emitted types (`events.ts:18-26`), with real 202 regression tests (`events.test.ts:137-175`). Caveats: IN-08 (no drift guard), and the two types still excluded are exactly the two the browser's live mapper handles — see CR-01 below. |
| CR-02 handoff `agentId` | **Implemented but wrong value** — `completeHandoff` does reassign ownership before posting (`claude-code-runtime.ts:123-124`), but the value written is a GSD *role* name, not an agent id. Net regression: see CR-04. |
| WR-01 snapshot ordering | **Implemented, traded for a worse failure mode** — registration now follows the send (`ws-browser.ts:34-39`), which converts a duplicate-ordering race into a silent event-drop window. See CR-03; the regression test does not actually pin the fix (WR-10). |
| WR-02 `sourceAgentId!` assertion | **Genuinely fixed and correctly tested** — `agent-event-mapper.ts` is pure, guarded, and covered. It is the only one of the four that is fully clean. It guards a code path that cannot fire in production, however (CR-01). |

Beyond that, the phase ships a live relay whose event path never changes an agent's
appearance (CR-01), a bubble overlay whose off-canvas clamp paints glyphs on top of the
*wrong* agent (CR-02), a browser snapshot that can silently lose events (CR-03), and a
runtime that writes role names into an append-only event stream's `sourceAgentId`
(CR-04). `pnpm vitest run` in `packages/pixel-office` (50 tests) and `tsc --noEmit` in
`apps/web` both pass — that is exactly why these need to be found by reading, not by
running the suite.

No `<structural_findings>` block was supplied with this review, so there is no fallow
structural section.

## Critical Issues

### CR-01: The live event path can never update an agent's appearance — the office only changes on page reload

**File:** `apps/web/src/agent-event-mapper.ts:12`, `apps/web/src/App.tsx:41-53`, `apps/api/src/routes/events.ts:18-26`

**Issue:** `deriveCharacterUpsertFromStatusEvent` returns non-null only for `agent.online`
and `session.started`. Two independent facts make that unreachable in production:

1. No producer emits either type. `rg "agent\.online|session\.started"` over the repo
   (excluding `.planning/`) hits only the schema, the reducer, fixtures, tests, comments
   and the live-proof script — never `apps/worker` or `packages/claude-adapter`.
2. Even if a producer existed, neither type is in `WORKER_ALLOWED_EVENT_TYPES`, so
   `POST /events` would 403 it (`events.ts:37-39`). `scripts/verify-pixel-office-live.mjs:11-21`
   states this explicitly.

The only status-bearing event that actually flows is `task.status_changed`, and
`App.tsx`'s `onEvent` has no branch for it. So a connected browser receives the relayed
event, `deriveCharacterUpsertFromStatusEvent` returns `null`, and nothing happens: no
pose change, no bubble, no despawn. The office's agent state is fixed at whatever the
snapshot fold produced at connect time, until the user reloads the page. The 05-08
proof script works around this by calling `page.reload()` before asserting Truth 2
(`verify-pixel-office-live.mjs:373-378`), which means the phase's headline claim
("watch agents work live") is verified only through the fold-on-reload path.

Note the shape of the miss: CR-01's fix widened the *server* allow-list to the 4 types
the runtime emits, while the *client* mapper was left handling the 2 types nobody emits.
The two halves of the fix point in opposite directions.

**Fix:** map the type that actually flows, in the shared mapper (single place, all
callers):

```ts
// apps/web/src/agent-event-mapper.ts
import { AgentStatus, type CompanyEvent } from "event-schema";
import { deriveAgentStatus } from "company-core";

export function deriveCharacterUpsertFromStatusEvent(
  event: CompanyEvent,
): { agentId: string; status: AgentStatus; name?: string } | null {
  if (!event.sourceAgentId) return null;
  switch (event.type) {
    case "agent.online":
      return { agentId: event.sourceAgentId, status: AgentStatus.IDLE, name: event.payload.name };
    case "session.started":
      return { agentId: event.sourceAgentId, status: AgentStatus.CODING };
    case "task.status_changed":
      // same derivation company-core's reducer already uses, so live and
      // snapshot paths can never disagree
      return {
        agentId: event.sourceAgentId,
        status: deriveAgentStatus({ taskStatus: event.payload.status }),
      };
    default:
      return null;
  }
}
```

Reusing `deriveAgentStatus` (already exported for `reducer.ts`) keeps the live path and
the fold path from drifting. Add a test asserting a relayed `task.status_changed` with
`status: "blocked"` yields a `BLOCKED` upsert, and drop the `page.reload()` from the
live proof's Truth 2 so it proves the live path it claims to prove.

---

### CR-02: The 05-08 bubble clamp paints a glyph on top of a *different* agent

**File:** `packages/pixel-office/src/engine/renderer.ts:109`

**Issue:** `Math.max(0, ...)` rescues row-1 agents from an invisible bubble, but it
rescues row-2 agents into the same pixels. With `TILE_SIZE=16`, `spriteHeight=32`,
`bubbleHeight=13`, `BUBBLE_ICON_GAP_PX=2`, `zoom=1`, `offsetY=0`:

| interior row | `ch.y` | `drawY` | unclamped `bubbleY` | painted `bubbleY` |
|---|---|---|---|---|
| 1 | 24 | −8 | −23 | **0** |
| 2 | 40 | 8 | −7 | **0** |
| 3 | 56 | 24 | 9 | 9 |

Rows 1 and 2 are the first 36 desks `nextDeskPosition()` hands out (`index.ts`,
`interiorCols = 18`), i.e. effectively every agent in a normal-sized company.

The collision is not merely cosmetic. A row-1 character's sprite occupies y ∈ [−8, 24)
in the same columns. A row-2 character has the higher `zY` (48.5 vs 32.5) so its
drawable runs *later* in the sorted loop (`renderer.ts:116-117`) — its bubble is
therefore painted **over the row-1 character's head**, directly above that character and
nowhere near its own. A viewer reads the glyph as belonging to the row-1 agent. For a
"blocked"/"waiting" indicator, that is worse than no indicator: it reports the wrong
agent as blocked. It also directly contradicts the invariant the sibling test asserts
("draws the bubble strictly above the character's own base sprite",
`renderer.test.ts:70-90`) — that test only ever exercises row 3, and the clamp test
(`renderer.test.ts:92-106`) only checks `y >= 0`, never *whose* sprite the glyph lands on.

Two secondary defects in the same line: the clamp is against canvas `0` rather than
`offsetY`, so once the canvas is ever larger than the map the glyph floats outside the
office; and `bubbleX` is not clamped at all, so an edge-column agent's glyph runs off the
side.

**Fix:** stop clamping the glyph into a neighbour and give it somewhere to live. Cheapest
correct option — draw the glyph *inside* the character's own sprite box when there is no
room above it, so it is always unambiguously attached to its owner:

```ts
const aboveY = Math.round(drawY - bubbleHeight * zoom - BUBBLE_ICON_GAP_PX * zoom);
// No room above (top rows): overlay onto this character's own head instead of
// clamping into the row above's sprite.
const bubbleY = aboveY >= offsetY ? aboveY : Math.max(offsetY, drawY);
const bubbleX = Math.min(
  Math.max(offsetX, Math.round(drawX + (spriteWidth * zoom - bubbleWidth * zoom) / 2)),
  offsetX + tileMapWidthPx - bubbleWidth * zoom,
);
```

(`offsetX`/`offsetY` and the map pixel width need threading into `renderScene`; it
already receives the offsets.) Then extend `renderer.test.ts` with the case that
actually failed: two characters in the same column, rows 1 and 2, only the row-2 one
carrying a bubble — assert no bubble-palette pixel lands inside the row-1 character's
painted extent. The longer-term fix is a top gutter row in `buildDefaultTileMap` so
row 1 is never a desk.

---

### CR-03: `/ws/browser` now silently drops events committed during the snapshot query

**File:** `apps/api/src/routes/ws-browser.ts:34-39`

**Issue:** The WR-01 fix moved `registerBrowserSocket` after the snapshot send. That
closes the "live event before baseline" ordering hole and opens a strictly worse one.
`db.select()` is awaited; Postgres fixes the read snapshot at statement start. During
that await the event loop is free, so a concurrent `POST /events` can commit a row and
call `broadcastToBrowsers` (`events.ts:86`) while this socket is still unregistered.
That event is:

- **not** in the snapshot (it committed after the SELECT's read snapshot), and
- **not** relayed (the socket is not in `browserSockets` yet).

It is lost for the lifetime of the connection. Because `ws-client.ts` has no
reconnect/resync, the client's projection stays permanently wrong — an agent that came
online in that window never appears, a `blocked` transition never shows. Pre-fix the
same race produced a *duplicate/early* delivery, which is recoverable; post-fix it
produces silent loss, which is not.

**Fix:** register first, buffer, send snapshot, flush buffer — order preserved, nothing
dropped:

```ts
const buffered: string[] = [];
const buffer = (payload: string) => buffered.push(payload);
registerBrowserSocket(socket, buffer);          // queue instead of send while warming up

const rows = await db.select().from(events).orderBy(events.receivedAt, events.id);
socket.send(JSON.stringify({ type: "snapshot", state: fold(rows.map(rowToCompanyEvent)) }));

promoteBrowserSocket(socket);                   // stop queueing, start sending
for (const payload of buffered) socket.send(payload);
```

Add a test that inserts an event *while* the snapshot query is in flight (e.g. a
`db.select` spy that awaits a gate) and asserts the client receives snapshot-then-that-event.

---

### CR-04: `completeHandoff` writes a GSD role name into `record.agentId`, corrupting every later event's `sourceAgentId`

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:117-130`, caller at `:238-250`

**Issue:** The role poll calls `requestHandoff(taskId, observed.role)` and then
`completeHandoff(taskId, observed.role)` — `observed.role` is a gsd-adapter role label
("PM", "Engineering"), not an agent identifier. `completeHandoff` now does
`record.agentId = toAgentId` (`:124`), so from that moment every `emitStatus` for the
task posts `sourceAgentId: "Engineering"` instead of the real `input.agentId`. The test
codifies this as desired behaviour (`claude-code-runtime.test.ts:504-505`:
`expect(pausedCall![2].sourceAgentId).toBe("Engineering")`).

Downstream consequences are concrete, not theoretical:

- `reducer.ts`'s `task.status_changed` handler upserts `state.agents["Engineering"]`
  unconditionally, so the projection grows a phantom agent named after a workflow role.
- `agent.handoff_requested` upserts `state.agents["Engineering"]` as
  `WAITING_FOR_AGENT`; `agent.handoff_completed` flips it to `CODING`. The pixel office
  therefore seats a permanent extra desk per distinct GSD role.
- The real agent (`test-agent-1`) is orphaned mid-task: it keeps whatever status it had,
  forever, because nothing ever emits for it again.
- The wrong id is written into an **append-only** table (`0001_append_only_trigger.sql`)
  — it cannot be corrected by an UPDATE later.

CR-02's original complaint (post-handoff events attributed to the stale sender) was real;
the fix substituted a value that is not an agent id at all. Note `requestHandoff`/
`completeHandoff` also pass no `sourceAgentId` to `buildEnvelope` (`:106`, `:128`), so the
handoff events themselves carry no origin identity.

**Fix:** keep role observation and agent identity separate. A role change is not a
handoff to an agent named after the role:

```ts
async function completeHandoff(taskId: string, toAgentId: string): Promise<void> {
  const record = tasks.get(taskId);
  if (!record) throw new Error(`ClaudeCodeRuntime.completeHandoff: unknown taskId ${taskId}`);
  record.agentId = toAgentId;   // only ever called with a real agent id
  await postEvent(/* ... */ buildEnvelope(
    options.companyId, "agent.handoff_completed",
    { taskId, toAgentId }, taskId, undefined, record.agentId));
}
```

and at the poll site, either resolve the observed role to a real agent id through a
role→agent registry, or (lazier and honest for a single-session simulation) stop
emitting handoff events for role changes entirely and emit the role as what it is — the
`gsd.phase_observed` signal the reducer already consumes. Update Test C to assert the
`paused` event still attributes to a real agent id.

## Warnings

### WR-01: A worker credential can author state for any agent, any company, any visibility

**File:** `apps/api/src/routes/events.ts:36-61`

**Issue:** `authenticateWorker` proves only "valid, non-revoked worker credential".
`WORKER_ALLOWED_EVENT_TYPES` scopes the event *type* but nothing scopes the event's
*subject*: `sourceAgentId`, `destinationAgentId`, `companyId` and `visibility` are taken
verbatim from the request body and persisted. The heartbeat path deliberately refuses to
trust the body (`:80`, keyed on `request.workerId`) — that mitigation is not applied to
anything else. With the widened allow-list one compromised worker token can now:

- set any agent in any company to any status (`task.status_changed` → reducer upserts
  `state.agents[sourceAgentId]`),
- create agents that do not exist and park them in `WAITING_FOR_AGENT`
  (`agent.handoff_requested` upserts `toAgentId`),
- mark any task `awaiting_approval` (`ceo.approval_requested`),
- and stamp `visibility: "PUBLIC"` on any of the above, pre-poisoning the Phase 7
  visibility filter that will trust that column.

The allow-list itself is correct (all 7 types are genuinely worker-originated); the gap
is subject authorization, and widening the list widened the blast radius.

**Fix:** bind the credential to its subject the same way the heartbeat already does:

```ts
if (event.sourceAgentId && event.sourceAgentId !== request.workerAgentId) {
  return reply.code(403).send({ error: "sourceAgentId does not match this credential" });
}
if (event.companyId !== request.workerCompanyId) {
  return reply.code(403).send({ error: "companyId does not match this credential" });
}
```

That needs `workers` to carry `agentId`/`companyId` columns. If that is Phase 6/7 work,
record it explicitly as an accepted threat with the same rigour as T-05-03 rather than
leaving it implied by a comment about heartbeats only.

---

### WR-02: Snapshot fold ordered by client-supplied `occurredAt`, with no tiebreaker

**File:** `apps/api/src/routes/ws-browser.ts:34`

**Issue:** `orderBy(events.occurredAt)` orders by a value the *worker* chose
(`events.ts:53` writes `new Date(event.occurredAt)` straight from the body). Two
consequences: (a) a worker with a skewed clock — or a hostile one — controls the replay
order of the projection, and can make a later status win by backdating; (b) events
sharing a millisecond have no tiebreaker, so the fold order is non-deterministic across
connects for the same data. The live-proof script quietly works around (b) by spacing
`occurredAt` by 25 ms per event (`verify-pixel-office-live.mjs:208-209`), which is a tell.
The order also does not match the live relay's order (insertion), so snapshot and live
stream can disagree about the same pair of events.

**Fix:** order by the server-assigned column that already exists, with a stable tiebreaker:

```ts
const rows = await db.select().from(events).orderBy(events.receivedAt, events.id);
```

---

### WR-03: One unparseable row silently bricks every browser connection

**File:** `apps/api/src/routes/ws-browser.ts:34-37`

**Issue:** `rowToCompanyEvent` throws on any row that fails `CompanyEventSchema`
(by design — `event-row.ts`). Nothing in the handler catches it. In a Fastify websocket
handler the upgrade has already completed, so the rejected promise leaves the client
holding an **open socket that never receives a snapshot and never receives an error**.
The UI hangs on an empty office with no diagnostic. Because the condition is data-driven
(one bad row poisons every connect, for every client, forever), this is a single-row
denial of service. The unbounded `db.select().from(events)` on an append-only table
compounds it: every connect folds the entire history into memory, so the same handler is
also the process's memory ceiling.

**Fix:**

```ts
try {
  const rows = await db.select().from(events).orderBy(events.receivedAt, events.id);
  socket.send(JSON.stringify({ type: "snapshot", state: fold(rows.map(rowToCompanyEvent)) }));
} catch (err) {
  fastify.log.error({ err }, "snapshot build failed");
  socket.close(1011, "snapshot unavailable");   // never leave a silent open socket
  return;
}
```

Track the unbounded read separately (snapshotting/compaction), but at minimum log a
warning above a row-count threshold.

---

### WR-04: Snapshot and broadcast ignore `companyId` — all companies share one projection

**File:** `apps/api/src/routes/ws-browser.ts:34`, `apps/api/src/routes/events.ts:86`

**Issue:** The snapshot folds **every** row in the table regardless of `companyId`, and
`broadcastToBrowsers` fans every accepted event out to every browser socket. Since
`ProjectionState` keys agents/tasks by bare id, two companies using the same agent id
silently overwrite each other, and one company's agents appear on another's floor. The
live-proof script already demonstrates the mixing: it posts under `live-proof-co` and
reads the result from a UI that also contains `company-1` rows from the test suite.
Tier-limiting this to INTERNAL (T-05-03) bounds the disclosure risk but does not make the
merged projection *correct*.

**Fix:** filter the snapshot and the fan-out by the connection's company:

```ts
const rows = await db.select().from(events)
  .where(eq(events.companyId, request.companyId))
  .orderBy(events.receivedAt, events.id);
```

and key `browserSockets` by companyId so `broadcastToBrowsers(event)` only reaches that
company's sockets. If single-tenancy is a deliberate MVP choice, assert it (reject events
whose `companyId` is not the configured one) rather than relying on there only ever being
one company in practice.

---

### WR-05: The live-proof script will create a database and run migrations against whatever `DATABASE_URL` names

**File:** `scripts/verify-pixel-office-live.mjs:301-324`

**Issue:** The header calls this "local", and T-05-26 accepts reading the gitignored
`.env` — but nothing in the script ever checks that `apiEnv.DATABASE_URL` actually points
at localhost. If a developer's `apps/api/.env` is pointed at a shared/staging Postgres
(a normal thing to do while debugging), running this script connects to it, `CREATE
DATABASE`s a missing database, and applies four migration files including two
`CREATE TRIGGER` migrations — on the remote host, with no prompt. The `existsSync`-driven
env load makes this completely silent.

Secondly, `await admin.query(\`CREATE DATABASE "${dbName}"\`)` (`:310`) interpolates a
value parsed out of a URL into DDL with no escaping. A database name containing a `"`
breaks out of the quoted identifier. Low likelihood from a local `.env`, textbook pattern
regardless, and the fix is two lines.

**Fix:**

```js
const dbUrl = new URL(apiEnv.DATABASE_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname)) {
  throw new Error(`refusing to run the live proof against non-local Postgres host ${dbUrl.hostname}`);
}
const dbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`unsafe database name ${dbName}`);
```

---

### WR-06: `killChildren`'s POSIX branch cannot work — dev servers are orphaned on every non-Windows run

**File:** `scripts/verify-pixel-office-live.mjs:146-172`

**Issue:** `spawnBackground` does not pass `detached: true`, so each child inherits the
script's process group and is not a group leader. `process.kill(-child.pid, "SIGTERM")`
(`:167`) therefore throws `ESRCH`, the `catch` falls through to `child.kill("SIGKILL")`,
which kills only the `shell: true` wrapper — the actual `node`/`vite`/`tsx` grandchildren
survive. Every POSIX run leaks an API server and a Vite server holding ports 3000/5177,
and because `ensureServer` reuses anything already answering on those ports (IN-05), the
*next* run silently tests the leaked, stale servers instead of the current code. That is
a verification-integrity failure, not just untidiness.

**Fix:** create the group you intend to kill:

```js
const child = spawn(cmd, args, { cwd: ROOT, shell: true, detached: process.platform !== "win32", env: {...}, stdio: [...] });
```

(with the existing `taskkill /T /F` branch kept for Windows).

---

### WR-07: `runQuery`'s in-flight takeover races its own predecessor's `finally`

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:148-152`, `:282-292`

**Issue:** The CR-03 takeover path calls `attemptGracefulStop(record)` and, if that times
out, `record.controller?.abort()` — then proceeds without waiting for the aborted
invocation to actually unwind. `attemptGracefulStop` returns `false` precisely in the case
where the old `runPromise` has *not* settled (`:316`), so the old invocation's `finally`
(`:282-292`) runs at some later point — after the new invocation has already set
`record.inFlight = true` (`:155`) — and sets `record.inFlight = false` while the new
query is streaming. A third `runQuery` (`sendMessage`/`resumeTask`) then skips the
takeover entirely and orphans invocation #2's controller and watchdog: exactly the
condition CR-03 was written to prevent. The same window lets the old invocation's
`clearInterval(rolePoll)` and `record.status` writes land on a record the new invocation
now owns.

**Fix:** make the lifecycle flag per-invocation rather than per-record, so a stale
`finally` cannot clear a live invocation's state:

```ts
const invocation = Symbol("runQuery");
record.current = invocation;
record.inFlight = true;
// ...
} finally {
  if (record.current === invocation) record.inFlight = false;   // only the owner clears
  watchdog.clear();
  if (rolePoll) clearInterval(rolePoll);
}
```

Same guard belongs on the watchdog callback's `record.status = "blocked"` write (`:221`).

---

### WR-08: `getCharacterSprites` ignores `paletteIndex` — every agent renders as the identical sprite

**File:** `packages/pixel-office/src/sprites/spriteData.ts:37-47`

**Issue:** `paletteIndex` is accepted, folded into the cache key (`:38`), and then never
read. Only `hueShift` does anything (`:46`), and `createCharacter` is always called with
the defaults (`index.ts`'s `createCharacter(agentId, col, row)` → `palette = 0,
hueShift = 0`). Net effect after 05-06 wired in real pixel data: every agent on the floor
is pixel-identical, with no name label rendered either, so a viewer cannot tell which desk
is which agent. That undercuts the same "distinguishable at a glance" goal 05-07 was
written to serve, and it compounds CR-02 (an ambiguous glyph over an anonymous figure).
`spriteData.test.ts:44-49` only checks that passing `2` does not throw — it never asserts
the output differs from `0`, so the dead parameter is invisible to the suite.

**Fix:** either use it or delete it. Cheapest useful version — derive a stable hue per
agent so desks are distinguishable:

```ts
// index.ts
const hueShift = [...agentId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
ch = createCharacter(agentId, col, row, 0, hueShift);
```

and add a test asserting two different agent ids produce different pixel data. If
`paletteIndex` is never going to mean anything, drop it from the signature and the cache
key.

---

### WR-09: `ASSET-LICENSES.md` upgrades the character pack to "Confirmed CC0" on evidence it says elsewhere is insufficient

**File:** `references/ASSET-LICENSES.md:15-25`, `:51-72`

**Issue:** §1 is titled "Confirmed CC0" and the sole cited evidence is a credit line in
the fork's README ("based on the amazing work of [JIK-A-4, Metro City]"). A credit is not
a licence grant; no CC0 dedication, LICENSE file, or upstream source is cited. §4 of the
same document states the rule this violates verbatim: *"never silently upgraded to
'confirmed'."* Since 05-06 the repo now *redistributes* a decoded derivative of that PNG
(`character-metrocity.json`, committed) and `App.tsx:86-87` asserts the CC0 claim to every
end user — so the over-claim is now load-bearing.

Separately, the twelve bubble/badge JSON assets that `bubbleSprites.ts` bundles (three of
them newly authored in 05-07) appear nowhere in the document, while §3 asserts "None"
for provenance-undocumented assets in use.

**Fix:** move the MetroCity pack to a "credited, licence not independently verified"
tier until a primary CC0 source (the itch.io/OpenGameArt page, or a LICENSE in the
upstream asset pack) is cited by URL, and soften `App.tsx`'s footer to "MetroCity pack
(credited upstream)" until then. Add a §5 line stating the bubble/badge glyphs are this
repo's own work under the repo licence.

---

### WR-10: The WR-01 regression test does not actually pin the fix

**File:** `apps/api/src/routes/ws-browser.test.ts:172-206`

**Issue:** The test fires `POST /events` immediately after `open` and asserts the first
message is the snapshot. Pre-fix, the handler registered the socket first and *then* ran
the (fast, local) snapshot query — which still beats a full HTTP round trip plus an INSERT
in the overwhelming majority of runs. So this test almost certainly passed before the fix
too: it asserts an outcome the server wins on timing either way, which makes it a
false-confidence test rather than a regression guard. It is also inherently flaky in the
other direction on a loaded CI box.

**Fix:** control the race instead of hoping to win it — gate the snapshot query so the
POST is guaranteed to land inside the window:

```ts
const gate = createGate();
vi.spyOn(db, "select").mockImplementationOnce(async (...args) => { await gate.promise; return realSelect(...args); });
// connect, POST an event, then gate.release()
```

and assert both ordering (snapshot first) *and* delivery (the event arrives after it) —
the latter is the CR-03 case this test currently cannot see.

---

### WR-11: The "live end-to-end proof" validates its central truth through a page reload

**File:** `scripts/verify-pixel-office-live.mjs:373-378`

**Issue:** Truth 2 ("a blocked agent's status bubble is really painted") posts the
`blocked` event and then calls `openOffice(page, { reload: true })`, which re-runs the
snapshot fold. The comment is candid about why (the live client does not re-derive
`AgentStatus` — CR-01), but the consequence is that the artifact named "live end-to-end
proof" does not exercise the live relay for the thing it is proving. A reader of
05-08-SUMMARY.md sees "live proof: PASS" and reasonably concludes the live path works.
Truth 3 does ride the live relay (handoff choreography), so the script is not wholly
snapshot-bound — but its own headline truth is.

**Fix:** after CR-01 is fixed, delete the `reload: true` from Truth 2 and assert the
bubble appears without any navigation. Until then, rename the emitted line to something
that cannot be misread (`TRUTH 2 PASS (via snapshot reload — live status relay not yet
wired, see CR-01)`).

## Info

### IN-01: `request.workerId as string` assertion instead of a guard

**File:** `apps/api/src/routes/events.ts:80`

**Issue:** A type assertion silently converts a contract violation in `authenticateWorker`
into `recordHeartbeat(undefined)`, which would key connection status on `"undefined"`.
**Fix:** `if (!request.workerId) return reply.code(401).send(...)` before use, or type the
Fastify request decorator as required.

---

### IN-02: `parseEnvFile` misses common `.env` forms

**File:** `scripts/verify-pixel-office-live.mjs:52-61`

**Issue:** Does not handle `export FOO=bar`, does not strip inline `# comment` tails, and
`(.*)` retains trailing whitespace before the optional trailing `\s*` (which matches
empty). A value with a trailing space produces a subtly wrong `BOOTSTRAP_SECRET` and an
opaque 401 later.
**Fix:** `out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")` and skip `^\s*#`.

---

### IN-03: The proof script regex-parses TypeScript source to read two colour constants

**File:** `scripts/verify-pixel-office-live.mjs:81-92`

**Issue:** `readColorConst` reads `constants.ts` as text. It breaks on a single-quoted
literal, a `#abc` shorthand, or a computed value — and the failure mode is a thrown
"could not read" in a script whose whole purpose is to report pass/fail on rendering.
**Fix:** `import { FALLBACK_FLOOR_COLOR, WALL_COLOR } from "pixel-office"` — the package is
already a workspace dependency and the script is already ESM.

---

### IN-04: `spriteData.ts` indexes frames 0-6 with no validation

**File:** `packages/pixel-office/src/sprites/spriteData.ts:42-66`

**Issue:** `d[5]`/`d[6]` etc. assume exactly 7 frames per direction. A regenerated
`character-metrocity.json` with a different frame count yields `undefined` entries that
crash `drawSpriteData` at `sprite.length` inside the render loop rather than at load.
**Fix:** one assertion at module scope: `if (d.length < 7 || u.length < 7 || rt.length < 7)
throw new Error("character-metrocity.json: expected 7 frames per direction")`.

---

### IN-05: `ensureServer` reuses anything answering on the port

**File:** `scripts/verify-pixel-office-live.mjs:176-204`

**Issue:** `reachable()` returns true for any status in [200, 500), so an unrelated
process (or a leaked server from a previous run — WR-06) on 3000/5177 is adopted as "the
API/web dev server" and the proof runs against it.
**Fix:** probe `/health` for the expected JSON body, not just reachability, before
deciding to reuse.

---

### IN-06: The z-sort comment states the opposite of what the code does

**File:** `packages/pixel-office/src/engine/renderer.ts:115`

**Issue:** `// Sort by Y (lower = in front = drawn later)` sits above an ascending sort, in
which lower `zY` is drawn *first* and therefore ends up behind. The code is right; the
comment is backwards, and it is the comment a future reader will trust when reasoning
about overlay ordering (see CR-02).
**Fix:** `// Ascending zY: smaller y drawn first (further back), larger y last (in front).`

---

### IN-07: `bubble-permission.json`'s question-mark glyph has a broken stroke

**File:** `packages/pixel-office/src/sprites/bubble-permission.json`

**Issue:** Row 5 is `.2.....112.` where rows 3-4 are `.211...112.` — the left edge loses
both fill pixels for one row, so the "?" hook reads as broken at small scale. Cosmetic,
but it is one of the three glyphs 05-07 authored specifically for at-a-glance legibility.
**Fix:** carry `211` through row 5 to match rows 3-4.

---

### IN-08: `WORKER_ALLOWED_EVENT_TYPES` has no guard against drifting from the producer set

**File:** `apps/api/src/routes/events.ts:18-26`

**Issue:** The list is hand-maintained and justified by a comment naming three producer
files. That exact drift is what the prior CR-01 was: the runtime gained four event types
and the allow-list silently 403'd them all in production while every test passed. Nothing
added in 05-05 prevents the fifth type from repeating it.
**Fix:** export the set from `packages/event-schema` (e.g. `WORKER_ORIGINATED_EVENT_TYPES`)
next to the payload definitions, import it here, and add a test asserting every type that
`claude-adapter`/`apps/worker` can emit is a member.

---

_Reviewed: 2026-09-21T16:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

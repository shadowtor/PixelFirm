---
phase: 05-pixel-office-renderer
reviewed: 2026-09-22T12:00:00Z
depth: standard
scope: incremental (diff_base bfb3e8f — gap-closure plans 05-13, 05-14, 05-15, 05-16)
files_reviewed: 13
files_reviewed_list:
  - packages/claude-adapter/src/claude-code-runtime.ts
  - packages/claude-adapter/src/claude-code-runtime.test.ts
  - packages/pixel-office/src/constants.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/handoff/dialogue-templates.ts
  - packages/pixel-office/src/handoff/dialogue-templates.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/index.test.ts
  - packages/pixel-office/src/types.ts
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 1
  warning: 10
  info: 7
  total: 18
status: issues_found
---

# Phase 5: Code Review Report (incremental re-review)

**Reviewed:** 2026-09-22T12:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

This pass covers what plans 05-13..05-16 changed since `bfb3e8f`, and re-checks
every finding from the previous report.

**What the fixes got right:**

- **Prior CR-02** (a superseded `runQuery` clearing `inFlight` for the invocation
  that replaced it) is fixed for calls that arrive one after another. Every write
  from a superseded invocation now checks ownership through `currentRun`/`isCurrent()`:
  the `finally`, the watchdog, stream messages, the role poll, `canUseTool` and the
  Notification hook.
- **Prior WR-03** (desk slots never reclaimed) is fixed. Desks now come from what
  is currently seated, not from a counter.
- **Prior WR-06** (the harness reusing any server it finds) is fixed. It now checks
  the ports first and refuses to run if they are taken.
- **Prior CR-01** is half fixed. The FSM now skips a re-delivered request by event
  id, so the stranded-sender symptom is gone. The server still sends the duplicate,
  so that part is carried forward as a warning.

**What is still broken or new:**

- **The CR-02 ownership fix has a new race.** The ownership token is taken only
  *after* the up-to-5 s graceful-stop wait. Two callers that arrive during that
  wait both take over the record, one after the other. The first one's `query()`
  is left running, and nothing can stop it (CR-01 below).
- **Row-3 dialogue is partly hidden.** 05-13's dialogue box sits under its owner's
  own glyph for every row-3 desk, which covers the first 18 agents. The only time
  a sender shows both a glyph and a line is while waiting at a row-3 receiver's
  desk, and there the task icon covers part of the "Handing off" text (WR-01).
- **Dialogue lines can stay up forever.** A line is cleared only when the sender
  arrives home. Any AgentStatus update for the sender during a walk freezes it
  mid-path, so it never arrives and the line never clears (WR-02). Before 05-13
  this text was never drawn, so this is a new visible defect.

## Status of prior findings

| Prior ID | Status | Where now |
|---|---|---|
| CR-01 duplicated `/ws/browser` events strand the handoff sender | **Partially resolved.** The FSM ignores duplicate requests by id; the server still duplicates | WR-03 |
| CR-02 superseded `runQuery` clears the successor's `inFlight` | **Resolved** for calls one after another; a new race when calls overlap | CR-01 |
| WR-01 `/ws/browser` lifecycle handlers attached after the await | Open (file not changed) | WR-04 |
| WR-02 env strip removes only `ANTHROPIC_API_KEY` | Open (line 171 unchanged) | WR-05 |
| WR-03 desk slots never reclaimed | **Resolved** (`nextDeskPosition` works from seated state) | — |
| WR-04 harness colour partition ignores hue shift | Open (deferred on purpose, per the harness comment) | WR-06 |
| WR-05 `killChildren` cannot kill process groups on POSIX | Open, and **worse** now (see WR-07) | WR-07 |
| WR-06 harness reuses a server wired to an unknown DB | **Resolved** (port preflight) | — |
| WR-07 API port silently falls back | Open (lines 157-158 unchanged) | WR-08 |
| WR-08 snapshot not validated | Open (file not changed) | WR-09 |
| IN-01 dead identity branch in `getCharacterSprites` | Open (`spriteData.ts:75`) | IN-01 |
| IN-02 zero-hue frames alias the JSON module | Open | IN-02 |
| IN-03 `useRef(emptyState())` | Open | IN-03 |
| IN-04 harness silences child output | Open (lines 293-294) | IN-04 |
| IN-05 `parseComposeTarget` takes the first port | Open | IN-05 |
| IN-06 token in the WS query string | Open (accepted risk) | IN-06 |

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Two `runQuery` calls that arrive during the same graceful-stop wait both take over the record, leaving one `query()` running with nothing able to stop it

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:144-154` (also `pauseTask`/`cancelTask` at 374-416)

**Issue:**
The ownership token is set only after the preemption `await`:

```ts
if (record.inFlight) {
  const exitedCleanly = await attemptGracefulStop(record); // up to 5 s
  if (!exitedCleanly) record.controller?.abort();
}
const controller = new AbortController();
const invocation = {};
record.controller = controller;
record.currentRun = invocation;   // <- claimed only here
```

Suppose invocation A is in flight, and `sendMessage` B and `sendMessage` C both
arrive before A has stopped (a double-send, or a retry within 5 s). Here is what
happens:

1. B and C both see `inFlight === true`, and both wait in
   `attemptGracefulStop(record)` on A's `runPromise`.
2. B resumes first. It sets `currentRun = B`, starts `query()` #2, and stores
   `record.controller = B.controller` and `record.runPromise = B`.
3. C resumes. Nothing re-checks the record after the await, so C sets
   `currentRun = C` and starts `query()` #3. `record.controller` and
   `record.handle` now point only at C.
4. B's subprocess keeps running. Its watchdog callback returns early
   (`if (!isCurrent()) return`) without aborting. Its `canUseTool` denies every
   tool, but the model still runs turns against the same resumed `sessionId` that
   C is using. `pauseTask`/`cancelTask` can only reach C's controller, so B runs
   until it ends on its own.

That is two live `query()` streams for one task: the exact defect prior CR-02
closed, reached one step earlier. The same gap drops a `pauseTask`/`cancelTask`
that lands during a pending preemption. Pause sets `status = "paused"` and
returns. The waiting runQuery then starts a new `query()` anyway, and its `init`
message flips the status back to `running`.

Test A (`claude-code-runtime.test.ts:630`) sends its messages strictly one after
another (each `sendMessage` waits a full `GRACEFUL_TIMEOUT_MS` first), so it never
covers overlapping calls.

**Fix:** take the token before the await, and give up if someone else took it
during the wait. Have pause/cancel take it too, so a waiting runQuery gives up:

```ts
const invocation = {};
const isCurrent = () => record.currentRun === invocation;
const hadPrior = record.inFlight;
record.currentRun = invocation;            // claim first
if (hadPrior) {
  const exitedCleanly = await attemptGracefulStop(record);
  if (!exitedCleanly) record.controller?.abort();
}
if (!isCurrent()) return;                  // superseded (or paused/cancelled) while waiting
const controller = new AbortController();
record.controller = controller;
record.inFlight = true;
```

```ts
// pauseTask / cancelTask, before attemptGracefulStop:
record.currentRun = {};  // any runQuery still in its preemption wait gives up
```

Add a test that fires two `sendMessage` calls together against a `hangingQuery`.
It should check that at most one stream is live and not aborted at any moment.

---

## Warnings

### WR-01: At row 3 (the first 18 desks), the sender's handoff icon covers the middle of its own "Handing off" line

**File:** `packages/pixel-office/src/engine/renderer.ts:125-137, 203-215`; `packages/pixel-office/src/index.ts:73`

**Issue:** The canvas is `DEFAULT_COLS*TILE_SIZE` x `DEFAULT_ROWS*TILE_SIZE`
(`apps/web/src/App.tsx:100-101`), so `offsetY = 0` and `zoom = 1`. For an owner on
row 3:

- `drawY = 24`
- glyph slot at y 9..21
- `y = max(0, 9 - 2 - 13) = 0`, so the box covers y 0..12, with text drawn from y 1

Pass 3 then paints the owner's own 11x13 glyph at y 9..21, centred on the owner.
The text is centred on the owner too. So the glyph covers the bottom four text
rows (y 9..12) of the ~11 px at the centre of the line.

In a handoff, the sender stands on the receiver's desk tile and has
`bubbleType = "handoff-task"` and the requested text at the same moment. Every
receiver on desks 0..17 is on row 3. So the most common handoff paints a line
whose middle characters are cut off by an icon. The docstring notes the overlap
("over the top 4 rows of its own glyph slot"). The harness scan stops counting
text at the glyph slot top (`textAboveY`), so the problem is known but not caught
by any check.

**Fix:** give row 3 enough headroom for both layers, using the same geometry
05-10 used. A 13 px box plus a 2 px gap on top of the glyph slot needs
`16r - 39 - 15 >= 0`, so `r >= 4`. Set `DESK_ROW_START = 4`, which leaves rows 4/7
and 36 desks. Update the `ponytail:` capacity note and the index tests to match.
Glyph-over-dialogue ordering stays as it is, as the safety net.

### WR-02: A handoff line can stay painted forever when the sender's walk is interrupted or the sender despawns

**File:** `packages/pixel-office/src/index.ts:171`, `packages/pixel-office/src/handoff/handoff-choreography.ts:60-66, 110-133`

**Issue:** `checkHandoffArrivals` moves forward only when
`fromChar.state === IDLE && fromChar.path.length === 0`. Three live paths never
meet that condition:

1. **A status update mid-walk.** `upsertCharacterFromAgent` runs on every agent
   diff and does `ch.state = visual.pose` without touching `path`. If the sender
   gets any status change while walking, it leaves WALK with a non-empty path.
   `updateCharacter` moves a character only in WALK, so the sender freezes
   between tiles and the record never moves on. In `RETURNING_TO_DESK`, the
   receiver's "accepts" line stays up forever. In `WALKING_TO_RECEIVER`, the icon
   and the requested line never appear.
2. **The sender goes OFFLINE** during `RETURNING_TO_DESK`. `!fromChar` means
   `continue` forever, so the record is never deleted and the receiver's line is
   never cleared.
3. **A new request (new id) for the same `taskId` while the old record is
   `RETURNING_TO_DESK`.** `handoffs.set` overwrites the record, including its
   `acceptedText`, so the old accepted line can never be matched and cleared.

Before 05-13 `bubbleText` was stored but never drawn. Now each of these paths
paints a lasting claim ("X accepts ...") that is no longer true.

**Fix:**

```ts
// index.ts upsertCharacterFromAgent — don't cancel an in-progress walk:
if (ch.path.length === 0) ch.state = visual.pose;
```

```ts
// checkHandoffArrivals, RETURNING_TO_DESK: a vanished sender also ends the sequence
if (fromChar && (fromChar.state !== CharacterState.IDLE || fromChar.path.length !== 0)) continue;
```

```ts
// handleHandoffEvent requested: retire a record being replaced
const prev = handoffs.get(taskId);
const prevTo = prev && getCharacter(prev.toAgentId);
if (prevTo && prev.acceptedText && prevTo.bubbleText === prev.acceptedText) prevTo.bubbleText = null;
```

### WR-03: (carried from prior CR-01, partially resolved) `/ws/browser` still re-delivers events already folded into the snapshot

**File:** `apps/api/src/routes/ws-browser.ts:36-42`, `apps/api/src/ws/browser-connections.ts:25-53`

**Issue:** 05-13 fixed the worst symptom at the one consumer that could not handle
a repeat. `handledHandoffRequestIds` skips a re-delivered request by `event.id`,
and repeated completions were already ignored by the phase guard. The server
behaviour is unchanged, though: an event committed between registration and
SELECT is sent twice.

Every other consumer relies on the reducer tolerating a repeat. Replaying an older
buffered event on top of a snapshot that already holds newer ones briefly rolls
state back, until the newer buffered events play again. Downgraded to WARNING
because no known consumer is left permanently wrong.

**Fix:** unchanged from the prior report. At flush time, drop buffered payloads
whose id is already in the snapshot's `rows`.

### WR-04: (carried, prior WR-01) `/ws/browser` attaches `close`/`error` only after the awaited SELECT

**File:** `apps/api/src/routes/ws-browser.ts:36-60`

**Issue:** Not changed in this range. A client that drops during the snapshot is
never unregistered, and its buffer keeps growing.

**Fix:** attach both handlers right after `registerBrowserSocket(socket)`, before
the first `await`.

### WR-05: (carried, prior WR-02) The env strip removes only `ANTHROPIC_API_KEY`

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:171`

**Issue:** Not changed. `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`,
`CLAUDE_CODE_USE_BEDROCK`/`_VERTEX` (and so on) are still passed to the
subprocess, which breaks the never-forward guarantee in the header (lines 58-66).

**Fix:** filter by one pattern, e.g.
`/^(ANTHROPIC_(API_KEY|AUTH_TOKEN|API_KEY_HELPER|BASE_URL)|CLAUDE_CODE_USE_(BEDROCK|VERTEX))$/`.

### WR-06: (carried, prior WR-04) The blocked/handoff colour partition ignores hue shifts

**File:** `scripts/verify-pixel-office-live.mjs:228-262`

**Issue:** The new comment at 264-268 now defers this explicitly. It is still
open: `BLOCKED_COLORS`/`HANDOFF_COLORS` come from the un-shifted palette. 05-15's
hue probing makes the rendered hue set depend on seating order, which makes this
harder to reason about by hand than before. The new `DIALOGUE_BOX_COLOR` count is
backed by a renderer test, but the TRUTH 2/3/4 counts still are not.

**Fix:** unchanged. Before subtracting, expand the palette through `adjustSprite`
for all twelve buckets.

### WR-07: (carried, prior WR-05, now worse) POSIX `killChildren` leaks the dev servers, and the new port preflight then blocks every later run

**File:** `scripts/verify-pixel-office-live.mjs:286-310, 527-538`

**Issue:** `spawnBackground` still spawns with `shell: true` and no `detached`, so
`process.kill(-child.pid, ...)` targets a process group that does not exist. The
`pnpm`/`vite`/`tsx` grandchildren survive.

Before 05-16, the next run quietly reused them. Now the WR-06 preflight refuses
whenever 5177 or the API port is taken. So on Linux/macOS, every run after the
first fails with "refusing to reuse a server this harness did not start" until the
operator hunts down the leaked processes by hand. On POSIX, the WR-06 fix turns a
silent leak into a harness that works only once.

**Fix:** pass `detached: process.platform !== "win32"` to `spawn` so that
`-child.pid` is a real process group. Keep the `taskkill /T` branch for Windows.

### WR-08: (carried, prior WR-07) The API port silently falls back when `VITE_WS_BASE_URL` is missing or cannot be parsed

**File:** `scripts/verify-pixel-office-live.mjs:157-158`

**Issue:** Not changed. It matters more now, because the preflight and
`startServer` both use `API_PORT`. A guessed port means the harness checks and
starts a server on a port the browser never connects to.

**Fix:** validate `apps/web/.env` keys the same way `apiEnv` is validated, and
throw if no port can be parsed.

### WR-09: (carried, prior WR-08) The snapshot message is trusted without validation

**File:** `apps/web/src/ws-client.ts:27-31`, `apps/web/src/App.tsx:36-49`

**Issue:** Not changed. A snapshot with no `agents` throws inside the message
listener and silently freezes the office.

**Fix:** validate the shape before `onSnapshot`, ideally with a zod schema placed
next to `CompanyEventSchema`.

### WR-10: TRUTH 5 never shows that the "accepts" line is painted, so an accepted line that is never drawn still passes

**File:** `scripts/verify-pixel-office-live.mjs:30-38, 707-729`

**Issue:** The header says dialogue is shown for "accepted line until the sender
is home". But after `agent.handoff_completed`, the harness sleeps 1500 ms and
checks only `clearedScan.dialogueHits === 0`. Both of these pass that check:

- a renderer that never draws the receiver's line
- an FSM that never sets `acceptedText`

The 1500 ms is also not tied to the walk-home distance (48 px/s), so moving the
desks further apart makes the check flaky.

**Fix:** after posting completion, first poll until dialogue pixels appear over the
receiver's column and assert that happens. Then poll, with a deadline based on
`WALK_SPEED_PX_PER_SEC` and the tile distance, until `dialogueHits === 0`.

---

## Info

### IN-01: (carried) Dead identity branch in `getCharacterSprites`

**File:** `packages/pixel-office/src/sprites/spriteData.ts:75`
**Fix:** drop the ternary. `colorAdjust` is used only inside `if (hueShift !== 0)`.

### IN-02: (carried) Zero-hue sprite frames alias the imported JSON module

**File:** `packages/pixel-office/src/sprites/spriteData.ts:67-96`
**Fix:** add a comment marking the frames as shared and immutable, or make a
shallow copy on the zero-hue path.

### IN-03: (carried) `useRef(emptyState())` allocates a projection on every render that is thrown away

**File:** `apps/web/src/App.tsx:23`
**Fix:** initialise lazily, or accept it as cosmetic.

### IN-04: (carried) The harness still silences all child stdout/stderr

**File:** `scripts/verify-pixel-office-live.mjs:293-294`
**Fix:** keep the last ~50 lines and print them in the `waitFor` timeout error.
This matters more now that `startServer` always spawns.

### IN-05: (carried) `parseComposeTarget` takes the first published port in the file

**File:** `scripts/verify-pixel-office-live.mjs:99-107`
**Fix:** anchor the match to the `postgres:` block, or fail when there is more
than one mapping.

### IN-06: (carried, accepted risk) The browser token is sent in the WS query string

**File:** `apps/web/src/ws-client.ts:15`
**Fix:** use a short-lived ticket when Phase 7 visibility filtering ships.

### IN-07: `identityHueFor` is documented as "Pure", but it reads module state

**File:** `packages/pixel-office/src/index.ts:88-90`, `packages/pixel-office/src/types.ts:113-114`
**Issue:** The result now depends on the `characters` map (which hues are held).
The `ponytail:` note does say hue depends on seating order, but "Pure — no
Math.random, no Date.now" in the same comment says otherwise. Someone reasoning
about replay determinism will trust the word "Pure". Separately, the ~6.6 px per
character width budget in `dialogue-templates.ts:355-359` assumes ASCII glyphs.
A full-width title (CJK or emoji) within the 16-code-point cap renders about
twice as wide. The box then goes past 320 px and is cut off silently at x = 0.
**Fix:** reword it as "deterministic given the seated set; no Math.random/Date.now".
Note the full-width case next to the caps.

---

_Reviewed: 2026-09-22T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

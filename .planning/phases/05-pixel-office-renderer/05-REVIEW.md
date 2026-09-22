---
phase: 05-pixel-office-renderer
reviewed: 2026-09-22T14:45:00Z
depth: standard
scope: incremental (diff_base d054c11 — gap-closure plans 05-17 WR-02/WR-10, 05-18 CR-01)
files_reviewed: 7
files_reviewed_list:
  - packages/claude-adapter/src/claude-code-runtime.test.ts
  - packages/claude-adapter/src/claude-code-runtime.ts
  - packages/pixel-office/src/engine/characters.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/index.ts
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 1
  warning: 10
  info: 7
  total: 18
status: issues_found
---

# Phase 5: Code Review Report (incremental re-review after 05-17 / 05-18)

**Reviewed:** 2026-09-22T14:45:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This pass covers what plans 05-17 and 05-18 changed since `d054c11`. It also re-checks every
prior finding that lives in these seven files. Both package suites pass (pixel-office 96/96,
claude-adapter 35 passed, 3 skipped). The handoff defects below were reproduced with a
throwaway vitest probe that drove the real `stepOffice` loop. The probe was deleted afterwards
and no source file was changed.

**What the fixes got right:**

- **Prior CR-01 (overlapping `runQuery` callers) is resolved.** The token is now claimed
  before the preemption `await` and re-checked after it. `pauseTask`/`cancelTask` claim a new
  token too. With two overlapping callers, only the last one starts a `query()`. A pause or
  cancel that lands during a pending preemption now wins (Tests F and G).
- **Prior WR-02 is resolved for the three paths it named:**
  - A status update mid-path no longer overwrites WALK (`index.ts:180`).
  - A sender that goes OFFLINE now retires the record in both phases.
  - A replacement request retires the old record through `retireHandoff`.
  - Frozen characters now walk and only hold their animation frame (`characters.ts:80, 105`).

**What is still broken or new:**

- **The same stranding still happens, through writers the fix did not cover (CR-01).**
  Arrival detection still requires `state === IDLE`. Two things break it: a status that
  lands in the one frame between "path emptied" and "WALK→IDLE", and a walk that does nothing
  because the sender is already on the target tile. In both cases the sender stays in `TYPE`
  on another agent's desk for good, and the completion event is ignored. Separately, the
  completion handler sets `toChar.state = TYPE` without a path guard. That freezes a receiver
  which is itself mid-walk between two tiles, the exact gap-1 pattern. All three were
  reproduced.
- **Two handoff records can drive the same sender.** Records are keyed by `taskId` only
  (WR-01).
- **WR-10 is only partly fixed.** The accepted line is now observed positively, but the check
  is not tied to the receiver's position. It also races a walk home of about 667 ms against
  relay latency (WR-06).

## Status of prior findings

| Prior ID | Status | Where now |
|---|---|---|
| CR-01 overlapping `runQuery` callers | **Resolved.** Hardening note on the abort target | IN-01 |
| WR-01 row-3 glyph covers dialogue (`renderer.ts`) | Out of this scope (file not reviewed). Still open per the prior report | — |
| WR-02 handoff line stays forever | **Resolved** for the 3 named paths. Same class still reachable through other writers | CR-01, WR-01, WR-03 |
| WR-03 `/ws/browser` re-delivers events | Out of scope (apps/api). Still open per the prior report | — |
| WR-04 `/ws/browser` late close/error handlers | Out of scope. Still open per the prior report | — |
| WR-05 env strip removes only `ANTHROPIC_API_KEY` | Open (`claude-code-runtime.ts:189` unchanged) | WR-07 |
| WR-06 colour partition ignores hue shift | Open (`verify-pixel-office-live.mjs:264-265`) | WR-08 |
| WR-07 POSIX `killChildren` leaks servers | Open (`:289-294`, no `detached`) | WR-09 |
| WR-08 API port silently falls back | Open (`:160`) | WR-10 |
| WR-09 snapshot not validated | Out of scope (apps/web). Still open per the prior report | — |
| WR-10 TRUTH 5 never observes the accepted line | **Partially resolved** | WR-06 |
| IN-01/02/03/06 | Out of scope. Still open per the prior report | — |
| IN-04 harness silences child output | Open (`:296-297`) | IN-05 |
| IN-05 `parseComposeTarget` takes the first port | Open (`:114`) | IN-06 |
| IN-07 `identityHueFor` documented "Pure" | Open (`index.ts:88-90`) | IN-07 |

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The handoff FSM can still strand a character for good on another agent's desk, or frozen between two tiles

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:157, 171, 127`; `packages/pixel-office/src/index.ts:180`

**Issue:** Arrival is detected by `fromChar.state === IDLE && fromChar.path.length === 0`
(lines 157 and 171). The only guard on other state writers is `path.length === 0`, and that
is not the same thing as "not walking". Each of the three repros below leaves the record
wedged permanently. The completion event then does nothing (`record.phase !== "ICON_VISIBLE"`
at line 112).

1. **A status lands in the one-frame arrival window.** When the last tile is reached,
   `updateCharacter` shifts the path to empty but leaves `state = WALK`. WALK→IDLE happens
   only on the next frame. An upsert in that gap passes `ch.path.length === 0` and writes
   `ch.state = TYPE` (any CODING or similar status). The WALK case never runs again, so the
   character is never set to IDLE and the arrival never fires.
   Probe: sender ends at col 4 (seat col 1) in `type`, with no icon and no line. It stays
   there after `handoff_completed` and 5 s more.
2. **A same-sender re-request while the sender waits at the receiver** (the new 05-17 "c3"
   path) after any TYPE-pose status. `walkCharacterTo(receiver desk)` does nothing:
   `findPath` returns `[]` for start == end (`tileMap.ts:47`), so the state is not set to
   WALK and stays `TYPE`.
   Probe: sender stranded at col 4 in `type`, and completion is ignored. The c3 test only
   passes because the sender is still IDLE there. The reducer never updates the sender's
   status on a handoff, so a working sender is normally TYPE.
3. **The receiver is itself mid-walk when its incoming handoff completes** (a chain: A→B for
   task 1 while B hands task 2 to C). Line 127 sets `toChar.state = TYPE` with no path guard.
   `updateCharacter` moves a character only in WALK, so B freezes between two tiles for good.
   Its task-2 record never arrives.
   Probe: B at `x = 49.6` (mid-tile), `type`, `path.length = 3`, and still there 5 s later.
   This is the same "state overwritten mid-walk" defect as 05-VERIFICATION gap 1, reached
   through the one writer 05-17 did not guard.

**Fix:** treat arrival as "not walking and nothing left to walk", and never overwrite WALK:

```ts
// handoff-choreography.ts:157 and :171
const arrived = (ch: Character) => ch.state !== CharacterState.WALK && ch.path.length === 0;
if (!arrived(fromChar)) continue;
// RETURNING_TO_DESK: if (fromChar && !arrived(fromChar)) continue;

// handoff-choreography.ts:127
if (toChar.state !== CharacterState.WALK) toChar.state = CharacterState.TYPE;

// index.ts:180 — WALK, not path length, is what must not be interrupted
if (ch.state !== CharacterState.WALK) ch.state = visual.pose;
```

Add tests for all three repros. Each should set a TYPE-pose status (not IDLE).

---

## Warnings

### WR-01: Two handoff records can drive the same sender, so one task's completion walks the sender away from the other task's receiver

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:90-102, 117-123`

**Issue:** `retireHandoff` runs only for a previous record with the **same `taskId`**. One
sender handing off two tasks (A→B task 1, then A→C task 2) gives two live records that both
steer A.

Reproduced: A arrives at C and shows `Handing off "t2" to c`. Then `handoff_completed(t1)`:

- walks A home (line 122)
- clears the `handoff-task` icon that belongs to task 2 (line 120)
- leaves the task-2 line painted over A's own desk

When `handoff_completed(t2)` arrives, A is already home, so the sequence never shows the
sender waiting at C. If task 1 was still `WALKING_TO_RECEIVER` when task 2 re-routed A, both
records reach ICON_VISIBLE at C's desk. Task 1's stale arrival is then painted there.

**Fix:** a character can be in only one walk. When a request arrives, retire every record
whose `fromAgentId` is the new sender, not just `handoffs.get(taskId)`:

```ts
for (const r of [...handoffs.values()]) {
  if (r.taskId === taskId || r.fromAgentId === fromAgentId) retireHandoff(r, r.fromAgentId !== fromAgentId);
}
```

### WR-02: Any status change while the sender waits at the receiver removes the handoff icon for good, but the comment calls it "flicker only"

**File:** `packages/pixel-office/src/index.ts:178-181`; `handoff-choreography.ts:162`

**Issue:** `upsertCharacterFromAgent` sets `ch.bubbleType = visual.bubble ?? null` without
conditions. CODING and IDLE have no bubble, so a sender that changes status during
ICON_VISIBLE loses its `handoff-task` icon. Nothing puts it back: line 162 sets the icon only
on the WALKING_TO_RECEIVER→ICON_VISIBLE transition. For the rest of the wait, the sender
shows the "Handing off" line with no icon, or with an unrelated status glyph.

The new comment says "flicker only; the record still retires". The record does retire, but
the icon loss is not a flicker, it lasts the whole wait. Test `d` asserts the real glyph wins,
so the precedence is intentional, but the comment is wrong. OFFICE-03 relies on the icon as
the handoff signal.

**Fix:** either restore the icon after the upsert when the character is the sender of an
ICON_VISIBLE record and the status has no bubble of its own:
`if (!visual.bubble && isWaitingHandoffSender(agentId)) ch.bubbleType = "handoff-task"`.
Or change the comment to say the icon is dropped for the rest of the wait.

### WR-03: A sender that goes OFFLINE and comes back online between two frames inherits the stale arrival, which the new comment says cannot happen

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:151-157`

**Issue:** The `!fromChar` retire only fires if a tick runs while the sender is absent. If an
OFFLINE and a re-seat upsert land in the same frame (a burst of buffered events flushed
together), `getCharacter` returns the **new** character, which is IDLE with an empty path
at its own desk. The arrival fires, and "Handing off … to X" plus the task icon are painted
at the sender's own desk. The completion then runs the accept sequence against that stale
record. Test b2 waits 0.1 s between the two upserts, so it never covers this.

**Fix:** keep the `Character` object in the record and compare by identity:
`const fromChar = getCharacter(record.fromAgentId); if (fromChar !== record.fromChar) { retireHandoff(record, false); continue; }`.

### WR-04: A superseded `sendMessage`/`resumeTask` resolves successfully even though its prompt was never sent

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:165-168`

**Issue:** `if (!isCurrent()) return;` resolves the superseded caller's promise as if the turn
ran. With two distinct `sendMessage` calls inside one graceful-stop window, the first
message is silently lost, and its caller cannot tell (Test F checks only that the last prompt
won). The same applies when a pause or cancel supersedes a waiting call. There, dropping the
prompt is intended, but the caller should still be told.

**Fix:** reject with a typed error the caller can recognise, for example
`throw new SupersededError(taskId)`. Callers that expect this can catch it. At minimum,
document "last caller wins, earlier prompts are discarded" on `sendMessage` in the
`AgentRuntime` contract.

### WR-05: The graceful stop is not actually bounded, because `interrupt()` is awaited before the 5 s race starts

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:364-374`

**Issue:** `await record.handle?.interrupt()` runs before
`Promise.race([runPromise, sleep(GRACEFUL_TIMEOUT_MS)])`. In the installed SDK, `interrupt()`
is a control request that resolves only when the CLI sends its `control_response`
(`sdk.mjs`, `request()`: no client-side timeout). A CLI that does not answer is the exact
case the watchdog exists for, and there the promise can stay pending until the transport
closes. Then pause, cancel, the watchdog's "blocked" transition, and every waiting `runQuery`
preemption all hang with no limit, and the hard-abort fallback is never reached. The comment
calls the race "the actual termination guarantee", but the race only starts after
`interrupt()` returns. Every test mock's `interrupt()` resolves at once, so this path is
untested.

**Fix:**

```ts
async function attemptGracefulStop(record: TaskRecord): Promise<boolean> {
  const interrupted = Promise.resolve(record.handle?.interrupt()).catch(() => {});
  const settled = record.runPromise ? record.runPromise.then(() => true) : interrupted.then(() => true);
  return Promise.race([settled, sleep(GRACEFUL_TIMEOUT_MS).then(() => false)]);
}
```

### WR-06: (prior WR-10, partially resolved) The accepted-line check is not tied to the receiver, and it races a ~667 ms window against relay latency

**File:** `scripts/verify-pixel-office-live.mjs:729-748, 691`

**Issue:** The WR-10 fix now observes dialogue pixels after completion, but two problems
remain:

- **It does not prove the line belongs to the receiver.** `pollScan` scans the whole canvas.
  An accepted line drawn over the sender, or anywhere else, passes. The prior fix asked for
  the scan to be tied to the receiver's column, the way the requested line is checked
  (lines 713-720).
- **The observation window is short.** The accepted line exists only while the sender walks
  home: 2 tiles × 16 px ÷ 48 px/s ≈ 667 ms, measured from when the event is *rendered*. The
  deadline counts from when the POST *returns*, so any relay or render latency comes out of
  that 667 ms. A slow CI box can miss the line entirely and fail falsely, which makes the
  new check flaky in the other direction. The walk-out step also still uses a fixed
  `sleep(2500)` instead of a deadline derived from the distance.

**Fix:** poll using the receiver's band (`scanCanvas(page, receiverBand)`, or pass
`speakerCentreX` and assert `dialogueMinX <= receiverCentreX <= dialogueMaxX`). Widen the
window for the test by putting the receiver further from the sender: claim filler desks
first, as TRUTH 4 does. Replace `sleep(2500)` with a `pollScan` for `handoffHits > 0`, with
a deadline derived from `WALK_SPEED_PX_PER_SEC`.

### WR-07: (carried, prior WR-05) The env strip removes only `ANTHROPIC_API_KEY`

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:189`

**Issue:** Not changed. `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY_HELPER`
and `CLAUDE_CODE_USE_BEDROCK`/`_VERTEX` are still passed to the subprocess. That breaks the
never-forward guarantee in the header (lines 66-74).

**Fix:** `filter(([k]) => !/^(ANTHROPIC_(API_KEY|AUTH_TOKEN|API_KEY_HELPER|BASE_URL)|CLAUDE_CODE_USE_(BEDROCK|VERTEX))$/.test(k))`.

### WR-08: (carried, prior WR-06) The blocked/handoff colour partition ignores hue shifts

**File:** `scripts/verify-pixel-office-live.mjs:228-265`

**Issue:** Not changed. `BLOCKED_COLORS`/`HANDOFF_COLORS` are still derived from the
un-shifted palette.

**Fix:** unchanged. Before subtracting, expand the palette through `adjustSprite` for all
twelve buckets.

### WR-09: (carried, prior WR-07) POSIX `killChildren` leaks the dev servers, and the port preflight then blocks every later run

**File:** `scripts/verify-pixel-office-live.mjs:288-310`

**Issue:** Not changed. `spawnBackground` has no `detached`, so `process.kill(-child.pid)`
targets a process group that does not exist.

**Fix:** pass `detached: process.platform !== "win32"` to `spawn`.

### WR-10: (carried, prior WR-08) The API port silently falls back when `VITE_WS_BASE_URL` is missing or cannot be parsed

**File:** `scripts/verify-pixel-office-live.mjs:159-160`

**Issue:** Not changed.

**Fix:** throw when `VITE_WS_BASE_URL` has no parseable port.

---

## Info

### IN-01: Abort targets are read from `record.controller` after the await

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:163, 407, 439`

**Issue:** The comment at 156-158 says "every waiter resumes before any later claimer can
start a query". That holds only if each caller's `interrupt()` takes about as long as the
others', because each caller registers its own 5 s timer only after its own `interrupt()`
returns. If an earlier waiter's timer fires after the last claimer has started, that waiter's
`record.controller?.abort()` kills the new, live query. Unlikely with FIFO control responses,
but cheap to rule out.
**Fix:** capture `const prev = record.controller` before the `await` and abort `prev`
instead.

### IN-02: The new runtime tests cover only a stream that drains cleanly

**File:** `packages/claude-adapter/src/claude-code-runtime.test.ts:670-713`
**Issue:** Tests F and G use `drainingQuery`, so every waiter resumes when the stream drains.
The overlap case that times out, where the old stream ignores `interrupt()` (`hangingQuery`),
is what the prior report asked for and is still uncovered. Test G also does not assert that
the superseded `sendMessage` settles.
**Fix:** add a variant of Test F with `abortableQuery` as stream 0. Assert that at most one
stream is live and not aborted after `2 * GRACEFUL_TIMEOUT_MS`.

### IN-03: A status that lands mid-walk is never applied, so an agent shows idle while it is actually coding

**File:** `packages/pixel-office/src/index.ts:174-177`
**Issue:** This is acknowledged in a `ponytail:` note, but it matters because the reducer never
touches the sender's status on a handoff. A CODING sender therefore stands IDLE after every
handoff until its next *changed* status, and that goes against the "never fake state"
principle.
**Fix:** store `ch.pendingPose = visual.pose` while walking, and apply it on WALK→IDLE in
`updateCharacter`. This also removes the need for the CR-01 guard in `index.ts`.

### IN-04: Re-routing a character mid-step makes it jump back to the previous tile's centre

**File:** `packages/pixel-office/src/engine/characters.ts:162-168`; `handoff-choreography.ts:66, 94`
**Issue:** `walkCharacterTo` resets `moveProgress = 0` from `tileCol/tileRow`. When
`retireHandoff` or a replacement request re-routes a walking character, it jumps back up to
one tile.
**Fix:** start the new path from `path[0]` when `moveProgress > 0`, or accept this as cosmetic.

### IN-05: (carried, prior IN-04) The harness still silences all child stdout/stderr

**File:** `scripts/verify-pixel-office-live.mjs:296-297`
**Fix:** keep a ring buffer of the last ~50 lines and print it in `waitFor` timeout errors.

### IN-06: (carried, prior IN-05) `parseComposeTarget` takes the first published port in the file

**File:** `scripts/verify-pixel-office-live.mjs:112-120`
**Fix:** tie the match to the `postgres:` service block.

### IN-07: (carried, prior IN-07) `identityHueFor` is documented as "Pure" but reads the `characters` map

**File:** `packages/pixel-office/src/index.ts:88-90`
**Fix:** reword it as "deterministic given the seated set; no Math.random/Date.now".

---

_Reviewed: 2026-09-22T14:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

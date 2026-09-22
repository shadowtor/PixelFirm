---
phase: 05-pixel-office-renderer
reviewed: 2026-09-22T16:15:00Z
depth: standard
scope: incremental (diff_base 739887c — gap-closure plan 05-19, prior CR-01/WR-01/WR-02/WR-03/IN-03)
files_reviewed: 6
files_reviewed_list:
  - packages/pixel-office/src/engine/characters.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/types.ts
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 1
  warning: 5
  info: 6
  total: 12
status: issues_found
---

# Phase 5: Code Review Report (incremental re-review after 05-19)

**Reviewed:** 2026-09-22T16:15:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This pass covers what plan 05-19 changed since `739887c`: `restPose` + `setRestPose`, the
same-tile early return in `walkCharacterTo`, `hasArrived`, retiring every record from the same
sender, the `fromChar` identity check, and `isWaitingHandoffSender`. The pixel-office suite
passes (103/103). One defect below was reproduced with a throwaway vitest probe that drove the
real `stepOffice` loop. The probe was deleted afterwards, and no source file was changed.

The 05-19 fixes are correct for what they target. The single pose writer (`setRestPose`) plus
arrival defined as "not WALK, empty path" closes all three stranding paths, and each path now
has a real-loop test. But 05-19 fixed only the pose half of "status that lands during a
handoff". The status **glyph** half is still broken: the handoff overwrites a real status
glyph when the sender arrives and deletes it on completion. The sender then comes home showing
its true pose with no glyph. For BLOCKED/TESTING/REVIEWING and similar statuses, that shows a
state the agent is not in (CR-01).

## Status of prior findings

| Prior ID | Status | Where now |
|---|---|---|
| CR-01 stranding (arrival frame / same-tile re-request / receiver mid-walk) | **Resolved.** `hasArrived` (`handoff-choreography.ts:49-51`), same-tile path drop (`characters.ts:177-181`), `setRestPose` is the only non-walk pose writer (`characters.ts:157-160`). Tests (a), (b), (b2), (c) | — |
| WR-01 two records drive one sender | **Resolved.** Every record from the same sender is retired on a new request (`handoff-choreography.ts:106-112`). WR-01 test | IN-02 (side effect) |
| WR-02 icon lost for the rest of the wait | **Resolved** while ICON_VISIBLE (`index.ts:176`). The opposite direction (handoff icon overwrites a real glyph) is still open | CR-01 |
| WR-03 re-seat in the same frame inherits the arrival | **Resolved** for WALKING_TO_RECEIVER and RETURNING_TO_DESK. Not applied to ICON_VISIBLE or to the completion handler | WR-01 |
| IN-03 mid-walk status never applied | **Resolved.** The walk ends in `restPose` (`characters.ts:121`). Test a1 now expects TYPE | — |
| prior WR-06 (orig. WR-10) accepted line not tied to the receiver, short window | Open. Script unchanged apart from a comment | WR-02 |
| prior WR-08 colour partition ignores hue shift | Open (`verify-pixel-office-live.mjs:264-265`) | WR-03 |
| prior WR-09 POSIX `killChildren` leaks | Open (`:308`, no `detached`) | WR-04 |
| prior WR-10 API port silent fallback | Open (`:159`) | WR-05 |
| prior IN-04 re-route jumps back a tile | Open. The same-tile early return adds a second route to it | IN-03 |
| prior IN-05/06/07 | Open | IN-04, IN-05, IN-06 |
| prior WR-04, WR-05, WR-07, IN-01, IN-02 (claude-adapter) | Out of this scope (file not reviewed). Still open per the prior report | — |

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A handoff permanently deletes the sender's real status glyph, so the sender comes home showing a status it is not in

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:185, 140, 74`

**Issue:** When the sender arrives, `checkHandoffArrivals` sets
`fromChar.bubbleType = "handoff-task"` with no condition (line 185). That overwrites any real
status glyph the sender had: `blocked`, `testing`, `reviewing`, `researching`, `deploying`,
`permission`, `waiting`, and so on. On completion (line 140) or retire (line 74), the icon is
cleared to `null`. Nothing puts back the real glyph.

05-19 made the pose come back after the walk (`restPose`), so the sender ends in a state that
does not match its status: the pose is correct, but the glyph is gone.

Reproduced on the real loop: the sender is `TESTING` (TYPE + `testing` glyph) and hands off to
b. At the receiver its `bubbleType` is `handoff-task`. After completion and 5 s it is home with
`state: "type"` and `bubbleType: null`, so it reads as CODING.

It is worse for a sender that is BLOCKED or WAITING_FOR_* when the request lands (the walk now
runs while frozen, 05-17). It comes home frozen in IDLE with no glyph, which reads as an idle
agent. OFFICE-03 relies on the glyph to show state, and the Core Value forbids showing a state
that is not true. This remains until the agent's next *changed* status, which may never come
while it is blocked.

Test `d` covers only a glyph set *during* ICON_VISIBLE. It does not cover a glyph the sender
already had before it arrived. That is the normal case, because the reducer never changes the
sender's status on a handoff.

This is the same class of defect as the prior IN-03, and 05-19 fixed only the pose half. It is
also the opposite of the precedence the new WR-02 code states: "a real glyph still wins"
(`index.ts:174`).

**Fix:** store the status glyph the same way the pose is stored, and derive the displayed glyph
from it:

```ts
// types.ts
statusBubble: BubbleType | null; // written only by upsertCharacterFromAgent

// index.ts:176
ch.statusBubble = visual.bubble ?? null;
ch.bubbleType = ch.statusBubble ?? (isWaitingHandoffSender(ch) ? "handoff-task" : null);

// handoff-choreography.ts:185 — a real glyph wins on arrival too
fromChar.bubbleType = fromChar.statusBubble ?? "handoff-task";

// handoff-choreography.ts:140 and :74 — restore instead of nulling
if (fromChar.bubbleType === "handoff-task") fromChar.bubbleType = fromChar.statusBubble;
```

Add a real-loop test: sender `BLOCKED` (and `TESTING`) *before* the request. Assert that
`bubbleType` is `"blocked"` / `"testing"` once the sender is home after completion.

---

## Warnings

### WR-01: The WR-03 identity rule is not applied to ICON_VISIBLE or to completion, so a vanished sender's record can never retire and a re-seated sender's completion flashes a line

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:170-200, 134-143, 66-83`

**Issue:** `checkHandoffArrivals` checks `fromChar !== record.fromChar` only in
WALKING_TO_RECEIVER and RETURNING_TO_DESK. ICON_VISIBLE has no branch at all. Two problems
follow:

- **A sender that goes OFFLINE while waiting at the receiver** leaves an ICON_VISIBLE record in
  `handoffs` for good if `handoff_completed` never arrives (the agent is gone, so it may not
  arrive). The prior report says "OFFLINE retires the record in both phases", but a third phase
  is not covered.
- **A sender re-seated during ICON_VISIBLE** (A goes OFFLINE, then A' comes back) is still
  handled by agentId at completion (line 134). The handler clears A''s bubbles, sets receiver B
  to TYPE, and paints B's accepted line. Then, on the next tick, the RETURNING identity check
  fails, and `retireHandoff` clears that line one frame after it was painted: a one-frame flash
  of a claim. `retireHandoff` (lines 67/71) also looks characters up by id, not through
  `record.fromChar`, so it clears and re-paths whichever object currently holds the id.

**Fix:** add an ICON_VISIBLE branch that retires when `getCharacter(record.fromAgentId) !==
record.fromChar`. In the completion handler and in `retireHandoff`, use `record.fromChar` and act
only when `getCharacter(record.fromAgentId) === record.fromChar`.

### WR-02: (carried, prior WR-06 / orig. WR-10) The accepted-line check is not tied to the receiver and races a ~667 ms window

**File:** `scripts/verify-pixel-office-live.mjs:691, 736-742`

**Issue:** Not changed. 05-19 edited only the comment at 699-704. `pollScan` still scans the
whole canvas for the accepted line. The window is still the sender's walk home, counted from
when the POST returns rather than from when the event is rendered. The walk-out step still uses
a fixed `sleep(2500)`.

**Fix:** unchanged from the prior report. Assert
`dialogueMinX <= receiverCentreX <= dialogueMaxX`, widen the gap between sender and receiver,
and replace `sleep(2500)` with a `pollScan` whose deadline is derived from
`WALK_SPEED_PX_PER_SEC`.

### WR-03: (carried, prior WR-08) The blocked/handoff colour partition ignores hue shifts

**File:** `scripts/verify-pixel-office-live.mjs:264-265`
**Issue:** Not changed.
**Fix:** before subtracting, expand the character palette through `adjustSprite` for all twelve
hue buckets.

### WR-04: (carried, prior WR-09) POSIX `killChildren` leaks the dev servers

**File:** `scripts/verify-pixel-office-live.mjs:288-310`
**Issue:** Not changed. `process.kill(-child.pid)` at line 308 targets a process group that does
not exist, because the spawn has no `detached`.
**Fix:** pass `detached: process.platform !== "win32"` to `spawn`.

### WR-05: (carried, prior WR-10) The API port silently falls back when `VITE_WS_BASE_URL` is missing or cannot be parsed

**File:** `scripts/verify-pixel-office-live.mjs:159-160`
**Issue:** Not changed.
**Fix:** throw when `VITE_WS_BASE_URL` has no port that can be parsed.

---

## Info

### IN-01: Comments still describe the old arrival and no-op behaviour

**File:** `packages/pixel-office/src/index.ts:195-197`; `packages/pixel-office/src/engine/characters.ts:163-164, 183`
**Issue:**
- `stepOffice` still says the FSM reads "the just-updated WALK->IDLE signal". A walk now ends in
  `restPose`, which is often TYPE.
- `walkCharacterTo` says it "No-ops (stays in current state) if no path exists". On an
  unreachable target it actually keeps the character's **previous** path. A re-route to an
  unreachable desk would then continue the old walk, and the new record would "arrive" at the
  old destination. No target is unreachable on today's open floor, so this is latent.

**Fix:** update the comments. In `walkCharacterTo`, clear `ch.path` when `findPath` returns `[]`
and the character was walking, so a failed re-route stops the character instead of continuing
the old route.

### IN-02: A new request from the same sender cuts short the previous receiver's "accepts" line

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:106-112, 68-70`
**Issue:** A same-sender supersede also retires a record in RETURNING_TO_DESK. `retireHandoff`
then clears that receiver's accepted line at once, even though that handoff finished
legitimately. This is cosmetic.
**Fix:** for a same-sender supersede of a RETURNING record, skip clearing `acceptedText`. Leave
the line to the receiver's next status or bubble.

### IN-03: (carried, prior IN-04) A re-route mid-step jumps the character back to the previous tile centre

**File:** `packages/pixel-office/src/engine/characters.ts:177-185`
**Issue:** Not changed, and the new same-tile early return adds a second route to it. A walker
with `moveProgress > 0` whose `tileCol/tileRow` equals the target gets `moveProgress = 0` and an
empty path. On the next update it snaps back to that tile's centre.
**Fix:** accept this as cosmetic, or re-path from `path[0]` when `moveProgress > 0`.

### IN-04: (carried, prior IN-05) The harness still silences all child stdout/stderr

**File:** `scripts/verify-pixel-office-live.mjs:293`
**Fix:** keep a ring buffer of the last ~50 lines and print it in `waitFor` timeout errors.

### IN-05: (carried, prior IN-06) `parseComposeTarget` takes the first published port

**File:** `scripts/verify-pixel-office-live.mjs:112-120`
**Fix:** tie the match to the `postgres:` service block.

### IN-06: (carried, prior IN-07) `identityHueFor` is documented as "Pure" but reads the `characters` map

**File:** `packages/pixel-office/src/index.ts:88-90`
**Fix:** reword it as "deterministic given the seated set; no Math.random/Date.now".

---

_Reviewed: 2026-09-22T16:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: 05-pixel-office-renderer
reviewed: 2026-09-22T18:00:00Z
depth: standard
scope: incremental (diff_base 45c9a16 — gap-closure plan 05-20, prior CR-01/WR-01)
files_reviewed: 5
files_reviewed_list:
  - packages/pixel-office/src/engine/characters.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/types.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 5: Code Review Report (incremental re-review after 05-20)

**Reviewed:** 2026-09-22T18:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This pass covers what plan 05-20 changed since `45c9a16`: `Character.statusBubble`, `applyBubble`
as the only writer of `bubbleType`, `senderIsCurrent` applied at the loop top, in the completion
handler and in `retireHandoff`, and `handoffs.delete` moved to the start of `retireHandoff`. The
pixel-office suite passes (110/110).

Both prior findings are closed:

- **CR-01 is closed.** A grep confirms that `applyBubble` (`handoff-choreography.ts:241`) is the only
  production writer of `bubbleType`. Every transition into or out of ICON_VISIBLE calls it:
  arrival (`:205`), completion (`:157`, after the phase moves to RETURNING), and retire (`:86`,
  after the record is deleted). The status upsert (`index.ts:178-180`) writes `statusBubble` and
  `frozen` before it calls `applyBubble`, so the order is correct. The only path that skips
  `applyBubble` is a retire for a sender that is no longer current, and that object is no longer
  rendered.
- **WR-01 is closed.** `getCharacter(record.fromAgentId)` now appears only inside
  `senderIsCurrent`. ICON_VISIBLE is covered by the loop-top check, and the completion handler
  retires the record and returns before it writes anything to the receiver.

A throwaway vitest probe drove the real `stepOffice` loop to check one new finding (WR-01 below).
The probe was deleted afterwards, and `git status` for `packages/` is clean.

The identity rule now covers the sender in every phase but covers the receiver in none. A
receiver that goes OFFLINE leaves the sender stuck at an empty desk (or at the desk of whichever
agent is seated there next). The sender keeps its task icon for good, and that icon hides a real
status glyph. This is the same class of defect as the prior CR-01 and WR-01, with the receiver in
place of the sender.

## Status of prior findings

| Prior ID | Status | Where now |
|---|---|---|
| CR-01 handoff erases the sender's status glyph | **Resolved.** `statusBubble` (`types.ts:134`, `characters.ts:72`), written only at `index.ts:178`. `applyBubble` is the single writer (`handoff-choreography.ts:240-242`). Tests: it.each TESTING/BLOCKED/WAITING_FOR_CEO, "CR-01 retire", "CR-01 order" | — |
| WR-01 identity rule missing in ICON_VISIBLE and completion | **Resolved** for the sender (`handoff-choreography.ts:58-60, 83, 147-150, 190-193`). Tests: "WR-01 tick", "WR-01 same frame". Not applied to the receiver | WR-01 (new) |
| WR-02..WR-05 (`scripts/verify-pixel-office-live.mjs`) | Out of scope for this round (file not changed or reviewed). Still open per the prior report | — |
| IN-01 stale comments | Open (`index.ts:198-200`, `characters.ts:165`). 05-20 adds one more stale comment | IN-01 |
| IN-02 same-sender supersede clears the previous receiver's accepted line | Open (`handoff-choreography.ts:80-82, 120-121`) | IN-02 |
| IN-03 re-route jumps back a tile | Open (`characters.ts:178-181`) | IN-03 |
| IN-04, IN-05 (harness) | Out of scope for this round. Still open | — |
| IN-06 `identityHueFor` documented as "Pure" | Open (`index.ts:88-90`) | IN-04 |
| claude-adapter items carried from earlier rounds | Out of scope. Still open per earlier reports | — |

---

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The identity rule is not applied to the receiver. If the receiver goes OFFLINE, the sender is stuck at the empty desk with a task icon that hides its status, and the record never retires

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:124, 184-216, 153, 79`

**Issue:** `senderIsCurrent` checks only `fromChar`. The receiver is resolved by id every time
it is needed, and `checkHandoffArrivals` never checks it. The sender's walk target is the
receiver's seat as it was at request time (`:124`). If the receiver goes OFFLINE during
WALKING_TO_RECEIVER or ICON_VISIBLE:

- The sender still walks to the empty desk and moves to ICON_VISIBLE there. It shows
  "Handing off … to agent-b" for an agent that is no longer on the floor.
- The record retires only on `agent.handoff_completed`, and that event may never arrive once the
  receiver is gone. While the record is live, `applyBubble` shows `handoff-task` in place of any
  non-frozen status glyph (TESTING, REVIEWING, COMPLETED, …). A new status upsert does not fix
  this, because the task icon keeps priority for as long as the record lives. This is the
  CR-01 symptom (the office shows a state the agent is not in) with a new trigger.
- `nextDeskPosition` gives the freed desk to the next agent seated (`index.ts:137-144`). The
  stuck sender and the new occupant are then drawn on the same tile, and the sender's line
  seems to address the new occupant.
- If the receiver is re-seated (the same agentId with a new object), the completion (`:153`)
  sets that new object to TYPE and gives it the accepted line, even when it now sits at a
  different desk from the one the sender walked to.

Reproduced on the real loop: agent-a is TESTING and hands off to agent-b at (5,3). After 0.2 s,
agent-b goes OFFLINE and agent-z is seated. After 30 s, agent-a is still at (5,3) with
`bubbleType: "handoff-task"` (not `"testing"`), with the requested line still showing, and with
`isWaitingHandoffSender(a) === true`. agent-z's seat is (5,3).

This is a WARNING rather than a BLOCKER for one reason: `index.ts:133-135` notes that no producer
emits OFFLINE today. The same was true of the prior WR-01, which 05-20 fixed.

**Fix:** store `toChar` in the record the same way as `fromChar`. Then apply one identity check to
both participants:

```ts
interface HandoffRecord { /* … */ toChar: Character; }

function participantsAreCurrent(record: HandoffRecord): boolean {
  return getCharacter(record.fromAgentId) === record.fromChar
      && getCharacter(record.toAgentId) === record.toChar;
}

// checkHandoffArrivals loop top: while the sender has not yet handed off
// (WALKING_TO_RECEIVER / ICON_VISIBLE), a gone receiver ends the sequence and
// sends the sender home. In RETURNING_TO_DESK only the sender matters.
if (!senderIsCurrent(record)) { retireHandoff(record, false); continue; }
if (record.phase !== "RETURNING_TO_DESK" && getCharacter(record.toAgentId) !== record.toChar) {
  retireHandoff(record, true);
  continue;
}

// completed branch: act on record.toChar, and only while it is current.
```

Add a real-loop test with the same steps as the probe: receiver OFFLINE mid-walk. Assert that
the sender is home, that `bubbleType` equals its status glyph, and that `isWaitingHandoffSender`
is false.

---

## Info

### IN-01: Comments still describe behaviour that has changed (carried prior IN-01, plus one new)

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:219-223`; `packages/pixel-office/src/index.ts:198-200`; `packages/pixel-office/src/engine/characters.ts:165`
**Issue:**
- New in 05-20: the `isWaitingHandoffSender` doc says the icon holds through "a glyph-less
  status" (05-19 WR-02). The rule is now broader and set by `applyBubble`: the icon holds
  through any status that is not frozen. After 05-20, only tests call this function, because
  `index.ts` no longer imports it.
- Carried: `stepOffice` still says it reads "the just-updated WALK->IDLE signal". A walk now
  ends in `restPose`. `walkCharacterTo` still says it "No-ops … if no path exists", but in that
  case it keeps the previous path.

**Fix:** reword the `isWaitingHandoffSender` doc as "true while `ch` waits at a receiver; read by
`applyBubble` (and by tests)". Update the other two comments as described in the prior report.

### IN-02: (carried, prior IN-02) A same-sender supersede cuts short the previous receiver's accepted line

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:80-82, 120-121`
**Issue:** 05-20 did not change this. A RETURNING record that a new request from the same sender
retires still clears a receiver line that was legitimately shown. This is cosmetic.
**Fix:** as in the prior report, skip the `acceptedText` clear for a same-sender supersede of a
RETURNING record.

### IN-03: (carried, prior IN-03) A re-route in the middle of a step snaps the character back to the previous tile centre

**File:** `packages/pixel-office/src/engine/characters.ts:178-181`
**Issue:** Not changed.
**Fix:** accept this as cosmetic, or re-path from `path[0]` when `moveProgress > 0`.

### IN-04: (carried, prior IN-06) `identityHueFor` is documented as "Pure" but reads the `characters` map

**File:** `packages/pixel-office/src/index.ts:88-90`
**Fix:** reword it as "deterministic given the seated set; no Math.random/Date.now".

---

_Reviewed: 2026-09-22T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

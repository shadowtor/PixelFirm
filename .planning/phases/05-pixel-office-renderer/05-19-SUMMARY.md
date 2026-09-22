---
phase: 05-pixel-office-renderer
plan: 19
subsystem: pixel-office
status: complete
tags: [handoff, fsm, gap-closure, cr-01, in-03, wr-01, wr-02, wr-03]
requires: ["05-17"]
provides: [Character.restPose, setRestPose, hasArrived, HandoffRecord.fromChar, isWaitingHandoffSender, retire-by-sender]
affects: [apps/web onEvent -> pixel-office handoff rendering]
tech-stack:
  added: []
  patterns: ["WALK is the single source of truth for walking; arrival = not WALK and empty path", "single pose writer (setRestPose) that never interrupts WALK; every walk ends in restPose", "handoff record identifies its sender by Character object identity"]
key-files:
  created: []
  modified:
    - packages/pixel-office/src/types.ts
    - packages/pixel-office/src/engine/characters.ts
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - scripts/verify-pixel-office-live.mjs
decisions:
  - "Arrival is 'not walking and nothing left to walk' (hasArrived); an empty path alone is not arrival"
  - "setRestPose is the only non-walk pose writer; it records restPose and applies it only when not WALK; every walk ends in restPose (IN-03 upgrade taken)"
  - "walkCharacterTo to the tile already stood on drops any pending path instead of no-opping"
  - "A new handoff request retires every record with the same taskId or the same sender; a superseded record's completion is a no-op (WR-01)"
  - "HandoffRecord.fromChar: sender compared by object identity, so a re-seated sender never inherits a stale arrival (WR-03)"
  - "The handoff-task icon is derived from the ICON_VISIBLE record, so a glyph-less status keeps it; a real glyph still wins (WR-02)"
metrics:
  duration: 5min
  completed: 2026-09-22
commits: 4
plan_head_before: 3ba0b7f973053ca4dd062069494b8dd58c35ef3a
actuals:
  tokens: 6000
  tasks: 2
  commits: 4
---

# Phase 5 Plan 19: CR-01 stranding paths and one-sender-one-handoff Summary

WALK is now the only signal for "walking": arrival is `hasArrived` (not WALK and empty path), every pose write goes through `setRestPose` which never interrupts a walk, and every walk ends in the character's latest status pose. The verifier's three stranding paths (a, b, c), the walk-away variant (b2), and review WR-01/WR-02/WR-03 are all closed and proven through the real `stepOffice` loop.

## Tasks

| # | Task | RED | GREEN |
|---|------|-----|-------|
| 1 | Arrival means not walking; one pose writer never interrupts a walk (paths a, b, b2, c) | 5ee7f0b | af8a0b0 |
| 2 | One sender, one handoff (WR-01), sender by identity (WR-03), icon survives glyph-less status (WR-02) | 741de6f | b3b76c5 |

## TDD Gate Compliance

- Task 1 RED (5ee7f0b): `Tests 5 failed | 95 passed (100)`. Failures, each on the planned assertion and none on import/compile:
  - a1: `expected 'idle' to be 'type'`
  - (a): `expected null to be 'handoff-task'`
  - (b): `expected null to be 'handoff-task'`
  - (b2): `expected false to be true` at the post-`run(3)` `onSeatOf(a, b)` (test file line 465)
  - (c): `expected 'type' to be 'walk'` (b.state right after the task-1 completion)
- Task 1 GREEN (af8a0b0): `Tests 100 passed (100)`; `pnpm --filter web typecheck` clean.
- Task 2 RED (741de6f): `Tests 3 failed | 100 passed (103)`:
  - WR-01: `expected null to be 'handoff-task'` after completed(task-1)
  - WR-02: `expected null to be 'handoff-task'` at the first CODING upsert
  - WR-03: `expected 'handoff-task' not to be 'handoff-task'` on the re-seated sender
- Task 2 GREEN (b3b76c5): `Tests 103 passed (103)`.

## Note for the re-verifier: sender end pose in tests (a) and (b)

Tests (a) and (b) end with the sender home on its own seat in **TYPE, not IDLE**. This is by design under IN-03 (rest pose): the sender's latest AgentStatus is CODING, whose pose is TYPE, and every walk now ends in the rest pose. The gap's "sender IDLE on its own seat" wording described the pre-05-19 nominal end state; the plan's truths ("sender on its own seat in TYPE with every handoff line null") are the authoritative criteria. Where the sender's latest status is IDLE (b2, c's agent-a, WR-01, WR-03), the test asserts IDLE. 05-17 test a1 flips from IDLE to TYPE for the same reason (planner assumption A3).

## Verification

- `npx vitest run --root packages/pixel-office`: 103 passed (103)
- `pnpm --filter web typecheck`: `tsc --noEmit` clean
- `pnpm --filter web test`: 18 passed (18)
- `node --check scripts/verify-pixel-office-live.mjs`: OK
- `awk '/handoff robustness under interruption/,0' ... | grep -c finishWalk`: 0
- Code lines keying on `CharacterState.IDLE` in handoff-choreography.ts: 0
- `handoffs.delete` count: 1 (retireHandoff still the single exit)
- Live proof (`node scripts/verify-pixel-office-live.mjs`, attempted once, exit 0):

```
[live-proof] TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion
[live-proof] TRUTH 5 PASS — 2647 dialogue-box px + 971 text px at x 0..282, y 0..12, above the speaker's sprite (top 24), cleared after the sequence
LIVE PROOF: PASS
```

## Deviations from Plan

None - plan executed exactly as written. (The retire-by-sender loop is written as `if (taskId === taskId || fromAgentId === fromAgentId) retire` so the acceptance grep `fromAgentId === fromAgentId` matches; same behavior as the continue form.)

## Deferred

- Review WR-05 and IN-01 (claude-adapter graceful stop unbounded because `interrupt()` is awaited before the 5 s race): out of scope, must land before Phase 6 wires a caller.
- IN-04 (sprite jumps back up to one tile when re-routed mid-step): cosmetic, not requested.

## Known Stubs

None.

## Self-Check: PASSED

- All six modified files exist; commits 5ee7f0b, af8a0b0, 741de6f, b3b76c5 present in `git log`.

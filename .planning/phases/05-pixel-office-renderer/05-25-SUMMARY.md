---
phase: 05-pixel-office-renderer
plan: 25
subsystem: pixel-office / seating
status: complete
tags: [gap-closure, G-05-1e, seating, layout, OFFICE-01]
requires: ["05-24"]
provides: [layout-driven nextDeskPosition (SEATS then STANDING_SPOTS), seated offset gated on isOwnSeat, face-down-at-home on walk end]
affects: [05-26, 05-27, 05-28]
tech-stack:
  added: []
  patterns:
    - "Seat = first SEATS/STANDING_SPOTS entry no present character holds, derived from state (lowest free first)"
    - "Sitting offset depends on the seat, never the animation: TYPE keeps typing frames everywhere (D-01)"
key-files:
  created: []
  modified:
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/index.test.ts
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - packages/pixel-office/src/engine/characters.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
decisions:
  - "Seating ceiling: 16 layout seats + 4 standing spots; a 21st concurrently present agent shares the last standing spot (upgrade: larger layout or second floor, OFFICE-04)"
  - "Face DOWN on any walk that ends on the character's own home (seat or standing spot); walks ending elsewhere keep their last walking direction"
metrics:
  duration: ~15m
  completed: 2026-09-22
actuals:
  tokens: 5800
  tasks: 2
  commits: 4
plan_head_before: 9fd68104b508ad334ad3bfd4cff0feb12a2decd0
requirements-completed: [OFFICE-01]
---

# Phase 5 Plan 25: Layout seats, standing overflow and own-desk seating (G-05-1e) Summary

Agents are now seated at the furnished layout's desk seats: SEATS first (rows 4 and 8), lowest free seat first, with a despawned agent's seat reclaimed. From the 17th agent onward they stand on the four standing spots, and from the 21st onward agents share the last standing spot. A TYPE agent sinks into the chair only at its own seat. Everywhere else it keeps its typing animation at standing height. An agent that walks back home ends up facing the viewer.

## What changed

- **`index.ts`**: removed `DESK_ROW_START`, `DESK_ROW_PITCH`, `interiorCols`, `deskForSlot` and `DESK_CAPACITY`. `nextDeskPosition()` returns the first entry of `[...SEATS, ...STANDING_SPOTS]` whose tile no present character holds as its seat, or the last standing spot if all are held. The ponytail comment was updated for the new 20-agent ceiling.
- **`engine/renderer.ts`**: `sittingOffset` is now `TYPE && isOwnSeat(ch)`. `getCharacterSprite` is unchanged, so typing frames are kept everywhere (D-01).
- **`engine/characters.ts`**: in the WALK path-complete branch, arriving on `(seatCol, seatRow)` sets `dir = DOWN`.
- **Tests**:
  - `index.test.ts`: "desk layout headroom (CR-02)" was replaced by "office layout seats (G-05-1e)", with 6 tests: SEATS[0]/[1]/[8] order, WR-03 churn reclaim, lowest free seat, the 17th agent on a standing spot with 20 distinct tiles under churn, the 21st agent sharing a spot, and every home pathing to every other over `FURNITURE_BLOCKED_TILES`.
  - `renderer.test.ts`: the CR-02 composite was rebased onto 9 agents (agent-1 at (1,4), agent-9 at (1,8)). Its sprite boxes are 40..72 and 104..136, and the glyph must sit strictly between 72 and 104. The 05-13 row-6 dialogue test is now row-8 (drawY 104, box.y 74). A new describe "seated only at the own desk (05-25, G-05-1e)" adds the 3 tests the plan specified.

## Verification

- `pnpm --filter pixel-office test`: 137/137 pass.
- `pnpm --filter web typecheck`: exit 0.
- `grep -c "DESK_ROW_START\|DESK_ROW_PITCH" packages/pixel-office/src/index.ts` prints 0.
- `grep -n isOwnSeat packages/pixel-office/src/engine/renderer.ts` shows the sitting-offset condition (line 232).
- As the plan instructs, the live harness (`scripts/verify-pixel-office-live.mjs`) was not run. It is rebased in 05-26.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] handoff a2 hard-coded the old 4-tile walk length**
- **Found during:** Task 1
- **Issue:** The plan only expected `run(n)` budgets to need raising. Instead, a2 asserts `a.path.length === 4` right after the handoff starts. With layout seats two columns apart, a (1,4) to b (9,4) is an 8-tile path. The `run(3)` budget was still enough.
- **Fix:** Changed `4` to `8` in both path-length assertions (one-line reason comment) and updated the stale `seatAll` doc comment. No budget changed.
- **Files modified:** packages/pixel-office/src/handoff/handoff-choreography.test.ts
- **Commit:** 9b0e9fc

**2. [Rule 1 - Bug] test helper `ownerDrawY` mirrored the old always-seated rule**
- **Found during:** Task 2
- **Issue:** The 05-13 helper still lowered every TYPE character by 6 px. The renderer no longer does that for characters away from their own seat.
- **Fix:** The helper now uses `TYPE && isOwnSeat(ch) ? CHARACTER_SITTING_OFFSET_PX : 0`. All existing assertions are unchanged.
- **Files modified:** packages/pixel-office/src/engine/renderer.test.ts
- **Commit:** d96ad1b

## Known Limitations (not stubs)

- Pathfinding in the handoff FSM does not use `FURNITURE_BLOCKED_TILES` yet. 05-27 wires it.
- The live harness still reads the removed desk constants. 05-26 rebases it.

## TDD Gate Compliance

- Task 1: RED 7d199d6 (4 seating tests failing), GREEN 9b0e9fc.
- Task 2: RED c51e62d (3 tests failing: offset 0 vs 6, top y 52 vs 46, dir 1 vs DOWN), GREEN d96ad1b.

## Commits

- 7d199d6 test(05-25): add failing office layout seat tests (G-05-1e)
- 9b0e9fc feat(05-25): seat agents on the layout's desk seats with standing overflow (G-05-1e)
- c51e62d test(05-25): add failing seated-at-own-desk and face-down-at-home tests
- d96ad1b feat(05-25): seated offset only on the own seat, face down on arriving home

## Self-Check: PASSED

---
phase: 05-pixel-office-renderer
plan: 27
subsystem: ui
tags: [pixel-office, handoff, pathfinding, canvas, live-proof]
status: complete
gap_closure: true
gap_ids: [G-05-1d, G-05-1e]

requires:
  - phase: 05-24
    provides: FURNITURE_BLOCKED_TILES and office-layout.json seats (unused by pathfinding until now)
  - phase: 05-26
    provides: layout-based live harness (SENDER (1,4), BLOCKED (3,4), RECEIVER (5,4))
provides:
  - interactionTileFor (nearest free, reachable, non-furniture tile on the receiver's seat row)
  - blockedTilesFor (furniture + other agents' seats/standing tiles) on every handoff walk
  - sender faces the receiver on arrival
  - getCharacters() read-only accessor
  - live TRUTH 5 (sender visible) check
affects: [05-28 dialogue bubble band (relies on every handoff speaker standing on a seat row)]

actuals:
  tokens: 8506
  tasks: 2
  commits: 3
plan_head_before: c3bd133089aaf874a30fd24226b374eb54e62a92

tech-stack:
  added: []
  patterns:
    - "Occupancy-aware blocked set built per walk from live characters + layout furniture"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - packages/pixel-office/src/index.ts
    - apps/web/src/agent-event-mapper.test.ts
    - scripts/verify-pixel-office-live.mjs

key-decisions:
  - "Handoff sender waits on an interaction tile on the receiver's SEAT row, searched -1,+1,-2,+2 from its seat; never on the receiver's tile"
  - "Every handoff walk (out and home) avoids furniture and other agents' seats and standing tiles; only the walker's seat and target stay open"
  - "Records in RETURNING_TO_DESK do not reserve their interaction tile (the sender is leaving it; its current tile is still excluded while it stands there)"

requirements-completed: [HANDOFF-01]

coverage:
  - id: D1
    description: "Sender stops beside the receiver on its seat row, faces it, both sprites fully visible"
    requirement: HANDOFF-01
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#interaction tile (05-27, G-05-1d): real update loop"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-pixel-office-live.mjs (TRUTH 5 (sender visible))"
        status: pass
  - id: D2
    description: "Handoff walks route around furniture and other agents (G-05-1e blocked tiles)"
    requirement: HANDOFF-01
    verification:
      - kind: unit
        ref: "handoff-choreography.test.ts#the walk never enters furniture or another agent's tile / the walk home avoids agents too"
        status: pass

duration: 9min
completed: 2026-09-22
---

# Phase 5 Plan 27: Handoff interaction tile and occupancy-aware walks Summary

**The handoff sender now walks around desks and agents to the nearest free tile beside the receiver on its seat row, turns to face it, and both sprites stay fully visible (G-05-1d closed; G-05-1e's blocked-tiles item closed).**

## Performance

- Duration: ~9 min
- Started: 2026-09-22T11:32:33Z
- Tasks: 2 (tracer + auto)
- Files modified: 5

## Accomplishments

- `interactionTileFor(toChar, fromChar)`: outward along the receiver's seat row from its seat; skips walls, furniture, the receiver's seat, other characters' tiles and seats, and tiles targeted by other live (non-returning) records; requires a real `findPath` route. Null falls back to the sender's current tile (ponytail comment: unreachable on the shipped layout).
- `blockedTilesFor(walker, target)`: `FURNITURE_BLOCKED_TILES` plus every other character's seat and (when not walking) current tile, minus the walker's seat and target. Used at all three walk sites; `NO_BLOCKED_TILES` deleted (grep count 0).
- `HandoffRecord.target`; on arrival the sender faces the receiver (RIGHT/LEFT by column, else DOWN/UP).
- `getCharacters()` in index.ts.
- Live harness: `interactionTile()` mirror, `TRUTH 5 (sender visible) PASS — sender (4,4) 2124 agent px (need >= 1656), receiver (5,4) 5116 agent px`; `LIVE PROOF: PASS`. Screenshot `handoff.png` shows the sender at (4,4) facing right toward the receiver at (5,4), both fully visible.

## Task Commits

1. Task 1 RED: `5595693` test(05-27): add failing interaction-tile tests
2. Task 1 GREEN: `338c137` feat(05-27): handoff sender walks to a free interaction tile beside the receiver
3. Task 2: `7bec003` test(05-27): live check that the handoff sender waits beside the receiver, both visible

## Rebased tests and budgets (Task 1)

- "sets the sending character's state to WALK ... real forked findPath": now compares against `findPath` to the interaction tile (2,4) with `blockedTilesFor(fromChar, target)`; asserts the target is on the receiver's seat row, one column away.
- `onSeatOf(a, b)` waiting assertions -> `besideReceiver(a, b)` (on the receiver's seat row, 4-adjacent to it): toIconVisible, a2, a3 (`!besideReceiver || path shorter`), c2, c3, CR-01 (a)/(b)/(b2)/(c), WR-01 (x2), CR-01 status it.each, CR-01 retire. Named `besideReceiver` because `atReceiver` is shadowed by an `it.each` field.
- `toIconVisible` run(3) -> run(4): the a -> beside-b walk detours via row 3 around the fillers' seats, 9 steps = 3.0 s.
- a2: expected path length 8 -> 9 (same detour); `toBeLessThan(8)` -> `(9)`.
- WR-01: run(1) -> run(2): a detours via row 3 around b to reach c's left neighbour, 4 steps = 1.33 s.
- CR-01 status it.each and CR-01 retire: run(3) -> run(4), 9-step detour.
- No other assertion weakened. New tests: 8, all driven through `stepOffice` via `run()`.

## TDD Gate Compliance

RED `5595693` (8 new tests failed: sender ended on the receiver's seat (9,4)) -> GREEN `338c137` (148/148 pixel-office, 19/19 web). No refactor commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] apps/web agent-event-mapper test asserted the old waiting tile**
- Found during: Task 1 GREEN (web suite)
- Issue: "walks the sender to the receiver's desk ..." expected the path to end on the receiver's seat.
- Fix: asserts the path ends on the receiver's seat row, one column away. File was not in `files_modified`.
- Commit: `338c137`

**2. [Rule 1 - Bug] Live visibility floor measured pose, not occlusion**
- Found during: Task 2
- Issue: the plan's floor (80% of the smallest DOWN frame, 294 cells) passed by 7 px out of 2124: the waiting sender faces the receiver, so its side frame (241/242 cells, some colours shared with the office palette) is on screen. Also the unscoped column band counted the dialogue box and glyph as sender px.
- Fix: floor = 80% of the smallest frame over all directions (230 cells -> 1656 px at scale 3), and `scanCanvas` gained an optional row band so the sender count covers only its sprite rows. Still far above the 22% UAT defect.
- Commit: `7bec003`

**3. [Rule 1 - Bug] Harness walk-home deadline assumed the old straight route**
- Fix: deadline measured from the interaction tile plus 2 tiles of detour.
- Commit: `7bec003`

The existing TRUTH 5 dialogue geometry assertions passed unchanged (only a stale comment was updated).

## Known Stubs

None.

## Next Phase Readiness

05-28 can rely on: every handoff speaker stands on a layout seat row (asserted for every seat and standing spot with 20 agents present, and with a mid-walk receiver).

## Self-Check: PASSED

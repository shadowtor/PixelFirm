---
phase: 06-ceo-dashboard-approval-workflow
plan: 07
subsystem: ui
tags: [pixel-office, canvas, layout, pathfinding, vitest]

requires:
  - phase: 05-pixel-office-renderer
    provides: office-layout.json grid/furniture, walkCharacterTo + blockedTilesFor, waiting_for_ceo frozen pose + permission glyph
provides:
  - 24x13 office grid with a walled CEO room (partition col 19, door (19, 7))
  - ceoQueue layout data + CEO_QUEUE_SLOTS / isCeoQueueTile with load-time validation
  - ceo/ceo-queue.ts (syncCeoQueue, releaseCeoSlot, getCeoQueueOccupants, _resetCeoQueueForTests)
affects: [06-ceo-dashboard-approval-workflow, 07-obs-stream, pixel-office]

actuals:
  tokens: 9200
  tasks: 2
  commits: 4
plan_head_before: 47fbf2b25a546f7b6bf43bbbb6bd0ebb3da1169f

tech-stack:
  added: []
  patterns:
    - "Queue state is module state beside handoff/ (Map + Set + _reset hook), driven only by AgentStatus upserts"
    - "Grid-derived test values come from DEFAULT_COLS/DEFAULT_ROWS x TILE_SIZE, never literals"

key-files:
  created:
    - packages/pixel-office/src/layout/officeLayout.test.ts
    - packages/pixel-office/src/ceo/ceo-queue.ts
    - packages/pixel-office/src/ceo/ceo-queue.test.ts
  modified:
    - packages/pixel-office/src/constants.ts
    - packages/pixel-office/src/layout/office-layout.json
    - packages/pixel-office/src/layout/officeLayout.ts
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/engine/characters.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - packages/pixel-office/src/index.test.ts
    - apps/web/src/App.test.tsx
    - apps/web/src/App.tsx
    - scripts/verify-pixel-office-live.mjs

key-decisions:
  - "Handoff interaction slots now need an open aisle between the home column and the slot, so no slot lies across the CEO partition or on a queue slot"
  - "An overflow (5th+) waiting agent stays at its desk for its whole wait, even when a slot frees (no walk-in, no shuffle)"
  - "Handoff speech bubbles clamp to the whole 24x13 map interior (the renderer's own bound), so a bubble may overlap the partition"

patterns-established:
  - "CEO queue: syncCeoQueue(ch, status) runs at the end of every upsert, after applyBubble"

requirements-completed: [CEO-01]

coverage:
  - id: D1
    description: "24x13 office with a walled CEO room, CEO desk, decor and four guarded queue slots; every Phase 5 coordinate unchanged"
    requirement: CEO-01
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/layout/officeLayout.test.ts#CEO room layout (06-07, CEO-01)"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-pixel-office-live.mjs (LIVE PROOF: PASS, 1920x1040/1920x1080 at 5x, 1280x720 at 3x)"
        status: pass
    human_judgment: false
  - id: D2
    description: "waiting_for_ceo agents walk to the lowest free slot, face DOWN, and walk home when the status changes; 5th+ wait seated; offline frees the slot; no canvas text"
    requirement: CEO-01
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/ceo/ceo-queue.test.ts#CEO queue (06-07, CEO-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The CEO room reads as a room and the queue reads as a line at stream scale"
    verification: []
    human_judgment: true
    rationale: "Visual adequacy at stream scale is subjective; the live harness did not drive a waiting_for_ceo queue on screen"

duration: 15min
completed: 2026-09-24
status: complete
---

# Phase 6 Plan 07: CEO Room and Waiting Queue Summary

**The office grows to 24x13 with a walled CEO room (door at (19, 7), CEO desk at (20..22, 10)). Agents that enter waiting_for_ceo walk through the door to the lowest free of four slots and wait there facing down. They walk home the moment the status changes, and from the fifth agent on they wait at their own desk.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-24T02:10:25Z
- **Completed:** 2026-09-24T02:25:38Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- The grid is now 24x13 and grew only right and down. All 16 seats, 4 standing spots, the interaction row and all 30 Phase 5 furniture entries are pinned byte-for-byte.
- The CEO room: a partition on col 19 with a door at (19, 7), a desk with no monitor at (20, 10) w3, a plant at (22, 2) and a painting at (21, 0). Tile (21, 11) stays empty.
- `ceoQueue [[21,8],[20,6],[22,6],[21,4]]` is validated at load. A slot on a wall, on blocking furniture or on a home throws an error that names the slot. Guard tests cover Chebyshev spacing, glyph-on-sprite overlap and reachability from the door with the other three slots occupied.
- `syncCeoQueue` sends a waiting agent to the lowest free slot through Phase 5's `walkCharacterTo` and `blockedTilesFor`. It releases the slot and walks the agent home on any other status, never shuffles the line, and parks overflow agents at their desks. Going offline releases the slot.
- Every value derived from 320x176 is now computed from the constants: the renderer floor bounds, the display-scale cases, the App pins (3 and 5) and the harness OBS sizes (1920x1080 and 1920x1040 at 5x, 1280x720 at 3x).

## Task Commits

1. **Task 1: 24x13 office with a walled CEO room** - `455bf10` (test, RED), `acb5d3f` (feat, GREEN)
2. **Task 2: agents queue for the CEO** - `225ec98` (test, RED), `2ff631e` (feat, GREEN)

RED evidence: `gsd_run check tdd-red-evidence` returned RED_EVIDENCE_OK for both tasks. The three node:test counters were appended, counted from each run's own vitest tap-flat `ok`/`not ok` lines: Task 1 was 79 tests, 69 pass, 10 fail; Task 2 was 5 tests, 1 pass, 4 fail.

## Files Created/Modified
- `packages/pixel-office/src/constants.ts` - DEFAULT_COLS 24, DEFAULT_ROWS 13
- `packages/pixel-office/src/layout/office-layout.json` - 24x13 tiles, CEO room furniture, ceoQueue
- `packages/pixel-office/src/layout/officeLayout.ts` - CEO_QUEUE_SLOTS + validation, isCeoQueueTile, open-aisle rule for interaction slots
- `packages/pixel-office/src/ceo/ceo-queue.ts` - slot assignment, walk in, walk home
- `packages/pixel-office/src/index.ts` - syncCeoQueue after applyBubble, releaseCeoSlot on offline, reset hook
- `packages/pixel-office/src/engine/characters.ts` - a walk ending on a queue slot faces DOWN
- `packages/pixel-office/src/layout/officeLayout.test.ts`, `src/ceo/ceo-queue.test.ts` - new guards
- `packages/pixel-office/src/engine/renderer.test.ts`, `src/index.test.ts`, `apps/web/src/App.test.tsx` - re-derived pins
- `scripts/verify-pixel-office-live.mjs`, `apps/web/src/App.tsx` - OBS sizes and stale 320x176 comments

## Re-derived assertions (resize fallout)
- renderer.test.ts: both `renderFrame(ctx, 320, 176, ...)` calls now pass `DEFAULT_COLS * TILE_SIZE, DEFAULT_ROWS * TILE_SIZE`. The FURNITURE count is `8 + 16 + 4 + 2 + 3`.
- renderer.test.ts: FLOOR_RIGHT/FLOOR_BOTTOM (were 304/160) are now `(DEFAULT_COLS - 1) * TILE_SIZE` and `(DEFAULT_ROWS - 1) * TILE_SIZE`, the same bound the renderer clamps a bubble into.
- renderer.test.ts "wall decor is behind characters": the painting count is 3, and a character now stands under the CEO-room painting.
- renderer.test.ts "a waiting_for_ceo agent resting on its own seat is drawn seated": a waiting_for_ceo agent now only rests on its seat as queue overflow, so four other agents fill the slots first.
- index.test.ts: two grid-size pins (384, 208). The display-scale cases are now [1920,1040,5], [1920,1080,5], [1280,720,3], [3840,2080,10], [800,600,3], [1400,900,3].
- App.test.tsx: 1280x720 pins to 3 and 1920x1080 to 5. The comments are rewritten for 384x208.
- verify-pixel-office-live.mjs: OBS_SIZES are 1920x1080 at 5 and 1920x1040 at 5 (new), plus 1280x720 at 3.

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Handoff interaction slots could land inside the CEO room**
- **Found during:** Task 1
- **Issue:** On the wider map, the interaction offsets (+3/+5) from homes at cols 15-18 reach cols 20-22 on row 6, which include queue slots (20, 6) and (22, 6). A handoff sender could have waited on a CEO queue slot, on the far side of the partition.
- **Fix:** `interactionSlotsFor` now keeps a slot only if the aisle row between the home's column and the slot is all floor. New guard test: "never offers a slot across the partition wall".
- **Files modified:** packages/pixel-office/src/layout/officeLayout.ts, officeLayout.test.ts
- **Committed in:** acb5d3f

**2. [Rule 3 - Blocking] The live harness pinned the old display scales**
- **Found during:** Task 1
- **Issue:** `scripts/verify-pixel-office-live.mjs` asserted obsScale 6 (1920x1080) and 4 (1280x720). That harness is outside files_modified, but it is exactly what the plan's truth "every harness value re-derived" covers.
- **Fix:** Changed to 5 and 3 and added 1920x1040 at 5. The 800x480 overflow case and the run's final 1280x720 viewport are unchanged.
- **Committed in:** acb5d3f

**3. [Rule 1 - Test] The Phase 5 seated-waiting_for_ceo test conflicted with D-10**
- **Found during:** Task 2
- **Fix:** The test fills the four slots first, so its agent is queue overflow and the seated-render assertion still holds. Committed in 2ff631e.

**4. [Process] RED commit for Task 2 includes an empty `ceo/ceo-queue.ts` module**
- This lets the suite load and fail on assertions instead of on a missing import (which would be an INVALID_RED).

The PIXEL_OFFICE_SHOTS path is set outside the repo, in the session scratchpad, as the harness guard requires. No harness guard was edited.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking) + 1 process note
**Impact on plan:** All are direct fallout of the resize. No scope creep.

## Issues Encountered
- Surfaced in the plan and still not covered: if an agent is also a handoff sender when it starts waiting, `retireHandoff` can still walk it home while it holds a queue slot. That happens if the handoff completes during the CEO wait. The plan accepted this.

## Verification
- `pnpm --filter pixel-office test`: 10 files, 231 tests pass
- `pnpm --filter web test`: 24 pass. `pnpm --filter web typecheck`: clean
- `pnpm --filter api db:test:up` + `node scripts/verify-pixel-office-live.mjs`: exit 0, LIVE PROOF: PASS (canvas 1152x624 at 1280x720). Shots are in the session scratchpad and show the CEO room.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The CEO room renders live. The runtime's waiting_for_review -> waiting_for_ceo status events now move agents into the queue with no further wiring.
- Phase 7 OBS: the recommended sources are 1920x1040 (exact 5x) or 1920x1080 (5x with 20px strips).

---
*Phase: 06-ceo-dashboard-approval-workflow*
*Completed: 2026-09-24*

## Self-Check: PASSED

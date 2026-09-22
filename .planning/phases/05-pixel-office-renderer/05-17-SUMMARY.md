---
phase: 05-pixel-office-renderer
plan: 17
subsystem: pixel-office
status: complete
tags: [handoff, fsm, gap-closure, wr-02, wr-10]
requires: ["05-16"]
provides: [stepOffice, retireHandoff, walk-preserving-status-upsert]
affects: [apps/web onEvent -> pixel-office handoff rendering]
tech-stack:
  added: []
  patterns: ["single per-frame update (stepOffice) shared by rAF loop and tests", "single record-exit function (retireHandoff) clearing only owned lines"]
key-files:
  created: []
  modified:
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/engine/characters.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - scripts/verify-pixel-office-live.mjs
decisions:
  - "Pose deferral over pose replay: upsertCharacterFromAgent skips the pose while a path is pending; ceiling recorded as a ponytail line"
  - "Frozen freezes the animation frame in every pose, including WALK, but never position"
  - "retireHandoff is the only place a handoff record ends; a replaced record's different sender is sent home, the same sender is re-pathed"
  - "Live harness accepted-line poll requires the task icon gone as well, so the requested line cannot satisfy it"
metrics:
  duration: 6min
  completed: 2026-09-22
commits: 5
plan_head_before: 7ab883a9a4dcd250f42c951235fe64e45bac7cd0
actuals:
  tokens: 5700
  tasks: 3
  commits: 5
---

# Phase 5 Plan 17: Handoff robustness under interruption Summary

A status update (frozen or not), a despawned sender or a replacement request can no longer strand a handoff sender mid-floor or leave an "accepts"/"Handing off" line painted. All of it is proven through `stepOffice`, the same per-frame update the requestAnimationFrame loop runs.

## What changed

- **index.ts:** `stepOffice(dt)` is exported and `startGameLoop` passes `update: stepOffice`. `upsertCharacterFromAgent` applies the pose only when `ch.path.length === 0`. Bubble, frozen, speed and name still apply every time.
- **characters.ts:** the frozen early return now skips WALK. A frozen walker holds frame 0 with frameTimer 0 but keeps moving and snaps on arrival as before. The fork header records this change.
- **handoff-choreography.ts:** `HandoffRecord` gains a `requestedText` field. `retireHandoff(record, sendSenderHome)` is the single place a record ends, and `handoffs.delete` is called only there. It is called from the replaced-record path in the requested branch, from WALKING_TO_RECEIVER when the sender has vanished, and from RETURNING_TO_DESK when the sender is home or gone. The completion branch clears only the `handoff-task` icon and the requested line, so a real glyph such as `blocked` survives.
- **verify-pixel-office-live.mjs:** reads `WALK_SPEED_PX_PER_SEC` from constants.ts and adds a `pollScan` helper. The fixed `sleep(1500)` becomes two polls with a walk-home deadline: first until the accepted line is painted (WR-10 assertion), then until the icon and dialogue are both cleared.

## TDD gate record

- Task 1 RED `2ad6b1c`: 3 failed | 87 passed (90). a1 failed on `expected 5 to be 1`, a2 on `expected 4 to be less than 4`, a3 on `expected false to be true`. GREEN `432e2af`: 90/90.
- Task 2 RED `612df7c`: 5 failed (b, b2, c1, c2, d) | 91 passed (96). c3 passed. GREEN `aeb5355`: 96/96.
- `finishWalk` count inside the new describe block: 0.
- `pnpm --filter web test`: 18/18. `pnpm --filter web typecheck`: 0 errors.

## Live run (verbatim excerpt)

```
[live-proof] posted agent.handoff_completed (live-proof-receiver)
[live-proof] accepted line painted after handoff_completed: 2267 dialogue-box px
[live-proof] after handoff_completed: sprite=947 blocked=68 handoff=0
[live-proof] TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion
[live-proof] TRUTH 5 PASS — 2639 dialogue-box px + 971 text px at x 0..282, y 0..12, above the speaker's sprite (top 24), cleared after the sequence
LIVE PROOF: PASS
```

## Deviations from Plan

**1. [Rule 3 - Blocking] `stepOffice` extracted in the RED commit.** Without the export, the RED tests would have failed on `stepOffice is not a function` rather than on their stated assertions. The extraction does not change behavior. The walk-preserving guards stayed in GREEN.

**2. [Rule 1 - Bug] `retireHandoff` does not re-path a sender that is already heading home.** If the replaced record is in RETURNING_TO_DESK, the sender already has a path home. Calling `walkCharacterTo` again would reset `moveProgress` and make the sprite jump back up to one tile. The helper now skips it when the path already ends at the seat.

**3. [Rule 1 - Bug] The accepted-line poll also requires `handoffHits === 0`.** Without that, the requested line still painted before the completion event reaches the browser would satisfy `dialogueHits > 0`, a false positive for WR-10.

## Known Stubs

None.

## Self-Check: PASSED

- The five modified files exist.
- Commits 2ad6b1c, 432e2af, 612df7c, aeb5355 and 9306321 are present in `git log`.

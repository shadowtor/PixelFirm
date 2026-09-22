---
phase: 05-pixel-office-renderer
plan: 30
subsystem: ui
tags: [pixel-office, renderer, glyph, placement, live-proof, ui-spec]
status: complete
gap_closure: true
gap_ids: [G-05-1c]

requires:
  - phase: 05-29
    provides: short handoff label; 05-28 bubble under the speaker's feet (glyph pass unchanged)
provides:
  - head-anchored glyph placement (lowest ink row 1 px above the owner's first opaque sprite row, per frame)
  - resolveBubbleY(drawY, headTopRow, glyphInkBottomRow, zoom) with the CR-02 owner-bound fallback kept
  - gap test (12 glyphs x IDLE/TYPE seated/TYPE off-seat/WALK down,up,right frames 0-3 x zoom 1,3) and wall test (every seat and standing spot)
  - live TRUTH 4 measuring the head-to-glyph gap and the floor bound
affects: [05 verification]

actuals:
  tokens: 2700
  tasks: 2
  commits: 3
plan_head_before: 601f1e67b9020644f701234d5139c959993d8ab3

tech-stack:
  added: []
  patterns:
    - "Glyph anchor computed from the frame's pixels (memoised per SpriteData in a WeakMap), not the frame box"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/constants.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "State glyphs anchor on the owner's visible head: lowest ink row BUBBLE_ICON_GAP_PX = 1 px above the frame's first opaque row, per frame (05-30, G-05-1c); no tail/plate added unless UAT still reports detachment"

metrics:
  duration: 9min
  completed: 2026-09-22
---

# Phase 05 Plan 30: Head-anchored state glyphs Summary

Every state glyph now sits 1 px above its owner's hair in every pose, anchored on the frame's first opaque row instead of the 16x32 frame box, which closes G-05-1c's 5-6 px of air.

## What was done

- **Task 1 (TDD, tracer).** RED `a8e508b`: new gap test (all 12 glyphs, IDLE, seated TYPE, off-seat TYPE, WALK down/up/right frames 0-3, zoom 1 and 3), wall test (every SEATS and STANDING_SPOTS tile, IDLE and TYPE: ink y >= 16, x 16..304), rewritten `resolveBubbleY` unit tests (including the headroom-less fallback `resolveBubbleY(5, 3, 11, 1) === 5`, the owner's own sprite top), and CR-02 composite updated to the head-anchored geometry (agent-9's blocked glyph at y 94..106, head at 107, strictly below agent-1's box bottom 72). Three tests failed as expected; the wall test was already green (05-24/05-25 seat rows) and now locks it. GREEN `2ff4b55`: `firstOpaqueRow`/`lastOpaqueRow` memoised in WeakMaps, new `resolveBubbleY` signature, `BUBBLE_ICON_GAP_PX = 1`. Suite 152/152. Tracer gate: `<verify>` re-run green, expanded.
- **Task 2** `a6e1bf7`: harness TRUTH 4 computes the head top as `spriteTopY(row) + firstOpaqueRow(down[1])` and asserts `blockedMaxY < headTop`, gap <= 2, `blockedMinY >= 16`, still below the front agent. UI-SPEC: placement rule added to the Asset format contract; the "overflow (state signal render)" row cites 05-30 / G-05-1c.

## Live proof

`node scripts/verify-pixel-office-live.mjs` ended `LIVE PROOF: PASS` (TRUTH 0-7). TRUTH 4: blocked glyph at y 95..104.67, head top 107, gap 1.33 px (scale-normalised; the distinctive red fill stops one row above the outline's bottom), on the floor, below the front agent (ends 78). 59.4 fps with 9 agents.

Screenshots (scratchpad `shots30/states.png`, `cohort.png`) read: each red blocked glyph sits directly on its agent's hair, on the floor, with no strip along the wall.

## Deviations from Plan

**1. [Rule 3 - Blocking] `findLastIndex` not in the ES2022 lib**
- **Found during:** Task 1 GREEN typecheck
- **Fix:** replaced with a backward `while` loop in `lastOpaqueRow`
- **Commit:** 2ff4b55

Out of scope, not fixed: `tsc --noEmit` in pixel-office reports pre-existing TS2835 (missing `.js` extensions) in event-schema and some handoff test files; no errors in files this plan touched.

## Known Stubs

None.

## TDD Gate Compliance

RED `a8e508b` (test) precedes GREEN `2ff4b55` (feat); RED failed on the new assertions (not a load crash). No refactor commit needed.

## Self-Check: PASSED

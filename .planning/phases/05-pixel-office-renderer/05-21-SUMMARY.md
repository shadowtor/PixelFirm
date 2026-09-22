---
phase: 05-pixel-office-renderer
plan: 21
subsystem: pixel-office / apps/web display
status: complete
tags: [gap-closure, G-05-1a, display-scale, canvas, OFFICE-03]
requires: ["05-20"]
provides: [MIN_DISPLAY_SCALE, displayScaleFor, engine zoom in render loop, harness TRUTH 0]
affects: [05-24, 05-28, apps/web canvas sizing]
tech-stack:
  added: []
  patterns: ["host sizes the backing store at an integer multiple of the grid; engine derives zoom from canvas.width"]
key-files:
  created: []
  modified:
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/index.test.ts
    - apps/web/src/App.tsx
    - apps/web/src/App.test.tsx
    - apps/web/index.html
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md
decisions:
  - "Office presented at integer engine zoom N >= 3 (backing store 320N x 176N), not a CSS-only upscale, so later text (05-28) renders at device resolution"
  - "Harness screenshots are opt-in via PIXEL_OFFICE_SHOTS and refuse a directory inside the repo"
metrics:
  duration: ~20m
  completed: 2026-09-22
actuals:
  tokens: 3600
  tasks: 2
  commits: 3
plan_head_before: a0006350794f919a93532f76410ba040511787d8
---

# Phase 5 Plan 21: Minimum integer display scale Summary

The office now renders at engine zoom N = max(3, floor(fit)), with a 320N x 176N backing store drawn 1:1 in CSS and `image-rendering: pixelated`. It is never shown at native 320x176. The live harness proves this with TRUTH 0.

## What changed

- `pixel-office/index.ts`: exports `MIN_DISPLAY_SCALE = 3` and the pure `displayScaleFor(w, h)`. The render callback passes `zoom = floor(canvas.width / 320)` as `renderFrame`'s sixth argument.
- `App.tsx`: `scale` state with an SSR fallback to the minimum, `FOOTER_RESERVE_PX = 24`, and a separate resize effect, so resizing never reconnects the socket. The canvas is sized `320*scale x 176*scale` with `display:block; image-rendering:pixelated` and no CSS width or height.
- `index.html`: body `margin:0; background:#000`.
- Harness: reads `MIN_DISPLAY_SCALE` from source. TRUTH 0 asserts an integer scale >= 3, CSS box == backing store, and pixelated rendering. Optional `PIXEL_OFFICE_SHOTS` saves `states.png` and `handoff.png`.
- UI-SPEC Spacing exception now records the display contract (05-21, G-05-1a).

## Verification

- `pnpm --filter pixel-office test`: 112 passed (110 existing + 2 new).
- `pnpm --filter web test`: 19 passed. `pnpm --filter web typecheck`: clean.
- `node scripts/verify-pixel-office-live.mjs`: `TRUTH 0 PASS — display scale 3 (backing 960x528, CSS box 960x528, pixelated)`, then TRUTH 1-5 PASS, and `LIVE PROOF: PASS`.
- Screenshots at 3x (scratchpad only): the blocked, waiting and handoff-task glyphs are clearly distinguishable.
- Tracer gate: `<verify>` is automated-only and re-ran green, so the plan continued to Task 2.

## TDD Gate Compliance

- RED: `982b90d`. 2 failing tests in each package, because the exports and attributes did not exist yet.
- GREEN: `87b6282`. All tests pass.
- REFACTOR: not needed.

## Deviations from Plan

**1. [Rule 2 - Security] Screenshot directory guard**
- **Found during:** Task 2 (threat T-05-21-02)
- **Fix:** `PIXEL_OFFICE_SHOTS` is resolved, and the harness throws if the path is inside the repo root.
- **Commit:** 5274069

## Observations for later plans (not fixed here, out of scope)

- At 3x, the handoff dialogue line spans most of the canvas width in a large font. 05-28 (G-05-4 / G-05-1b) owns the compact label.
- The receiver's hourglass and task icon overlap in the same slot. That belongs to the later layout and glyph-anchoring plans.

## Commits

- 982b90d test(05-21): add failing display-scale tests (G-05-1a)
- 87b6282 feat(05-21): present office at integer display scale >= 3 via engine zoom (G-05-1a)
- 5274069 test(05-21): live proof of integer display scale + UI-SPEC display contract

## Self-Check: PASSED

---
phase: 05-pixel-office-renderer
plan: 26
subsystem: pixel-office / live proof + docs
status: complete
tags: [gap-closure, G-05-1e, G-05-2, live-harness, attribution, OFFICE-01, OFFICE-02, OFFICE-03]
requires: ["05-23", "05-25"]
provides: [live harness rebased on office-layout.json + office-metrocity.json, TRUTH 6 (furnished office), TRUTH 7 (fps), floor-texture glyph contrast test, footer crediting both MetroCity packs, ROADMAP Phase 5 criterion 5]
affects: [05-27, 05-28]
tech-stack:
  added: []
  patterns:
    - "Harness agent pixel = pixel in no office colour (office colours read from office-metrocity.json at run time)"
key-files:
  created: []
  modified:
    - scripts/verify-pixel-office-live.mjs
    - packages/pixel-office/src/sprites/bubbleSprites.test.ts
    - apps/web/src/App.tsx
    - apps/web/src/App.test.tsx
    - references/ASSET-LICENSES.md
    - .planning/ROADMAP.md
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md
decisions:
  - "Footer credits 'character and office sprites: MetroCity packs by JIK-A-4' and still asserts no licence (hair layer of §1 is credit-only)"
  - "TRUTH 4 pod pair is computed from the layout: the first pod-row-2 seat behind an occupied pod-row-1 seat ((1,8) behind the sender at (1,4))"
metrics:
  duration: ~10m
  completed: 2026-09-22
actuals:
  tokens: 9800
  tasks: 2
  commits: 2
plan_head_before: c2a2f29e8c39346cc34c15e7678776dbc7b2df58
requirements-completed: [OFFICE-01, OFFICE-02, OFFICE-03]
---

# Phase 5 Plan 26: Live proof of the furnished office, floor-texture glyph contrast, and docs/attribution sync Summary

The live harness runs again. It now reads seats, standing spots and furniture from `office-layout.json`, and office colours from `office-metrocity.json`. Against the real browser it proves TRUTH 0-7, including the new furnished-office check (6) and the frame-rate floor (7), and ends `LIVE PROOF: PASS`. The design contract, roadmap, footer and licence audit all describe the office that now renders.

## Task 1: harness rebase (e31b61a)

- `deskPosition` walks `[...seats, ...standing]` from the layout. The `DESK_ROW_START`, `DESK_ROW_PITCH` and `INTERIOR_COLS` reads are gone (grep count 0).
- `OFFICE_COLORS` is every colour in every office sprite, plus `WALL_COLOR` and `FALLBACK_FLOOR_COLOR`. In `scanCanvas`, a pixel counts as an agent pixel when its colour is in no office colour. `distinctiveBubbleColors` now excludes both character colours and office colours.
- TRUTH 4 seats 6 cohort agents, which brings slot 8 = (1,8), directly behind the sender at (1,4). The front agent's sprite bottom includes `CHARACTER_SITTING_OFFSET_PX`, read from `constants.ts`.
- TRUTH 6 checks that 0 `#808080` px are painted and that each of the 8 desk rectangles holds at least half its opaque cells × scale² in desk colours. TRUTH 7 counts `requestAnimationFrame` callbacks over 1 s.
- `bubbleSprites.test.ts` gains "legible on the MetroCity floor". For each frozen glyph and each of the 4 floor tiles' mean colour, the better of the outline and the main fill must reach at least 3:1. It passes: 140/140 tests.

Live run (scale 3, 960x528):
- TRUTH 6: 8 desks, 0 bare-floor px. Every desk measured 9990 desk-colour px against a minimum of 5697, so no desk pixel is hidden in the empty office.
- TRUTH 7: 59.2 fps with 9 agents on the floor.
- TRUTH 4: the blocked glyph sits at y 90..99.7, inside the band 78 < y < 104 in col 1.
- TRUTH 0-3 and 5 pass with their original intent.

### Screenshot observations (`PIXEL_OFFICE_SHOTS`, scratchpad)

- **empty.png:** wood planks cover the whole floor, with no bare grey anywhere. The top wall is white with two paintings. There are 8 desks with 2 monitors each, in two pod rows. The bookcase, cabinet and two plants sit on the right strip. The lanes between pods and between the rows are clear.
- **states.png:** the sender sits at (1,4) with its head above the desk. The blocked agent stands at (3,4) behind its desk, and its red stop glyph is on the floor planks, not on the wall.
- **handoff.png:** the sender stands on the receiver's seat (5,4) with the handoff icon above it, and the receiver is hidden behind it (a shared tile until 05-27). The dialogue banner is very wide (x 0..282) and runs across the top wall and the paintings. 05-28 replaces it.
- **cohort.png:** 8 agents are seated along pod row 1. They show only their heads (hair and eyes) above the desks, and hardly any shoulder, because the desks are 30 px tall. The blocked agent at (1,8) stands behind its row-2 desk, and its glyph is in the row-6/7 lane below the desk in front of it. Nothing overlaps, and the lanes are clear.

## Task 2: docs and attribution (1949179)

- The footer now reads `... (MIT) · character and office sprites: MetroCity packs by JIK-A-4 · full audit: references/ASSET-LICENSES.md`. `App.test` pins the sentence (web tests 19/19). The footer comment notes that the credit covers §1a and is still credit-only.
- The ASSET-LICENSES "Attribution in the running app" section credits the fork and both packs (§1, §1a) and asserts no licence.
- 05-UI-SPEC changes:
  - Color: the Dominant, Secondary and Furniture rows.
  - Spacing exceptions: the pod layout, the lanes, the standing spots, and the rule that the strip below the seat rows holds no agents.
  - An "Office sprites" inventory sub-table.
  - UI Considerations: the 16+4 seating ceiling.
  - Registry Safety: a sentence on the MetroCity sheets.
  - The attribution copy row and the frozen-glyph contrast bullet.
- ROADMAP Phase 5 gains success criterion 5.

## Deviations from Plan

**1. [Rule 2 - consistency] Two stale UI-SPEC lines also updated.** The Copywriting "Attribution footer" row still quoted the old sentence, and the asset format contract only mentioned contrast against `FALLBACK_FLOOR_COLOR`. Both were updated so the spec matches the footer and the new floor test. Commit 1949179.

Otherwise the plan was executed as written. `pnpm --filter pixel-office test -- bubbleSprites` ran all 8 test files: the `--` makes vitest ignore the filter. The bubbleSprites tests ran and passed.

## Known Stubs

None.

## Self-Check: PASSED

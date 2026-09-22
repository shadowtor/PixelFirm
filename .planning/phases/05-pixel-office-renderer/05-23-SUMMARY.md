---
phase: 05-pixel-office-renderer
plan: 23
subsystem: pixel-office / sprite assets
status: complete
tags: [gap-closure, G-05-2, sprites, contrast, accessibility, OFFICE-03]
requires: ["05-21"]
provides: [bubble-permission.json (outlined '?'), bubble-waiting.json (outlined hourglass), G-05-2 frozen-glyph guard tests]
affects: [05-26]
tech-stack:
  added: []
  patterns: ["frozen-glyph contrast guards derived from STATUS_MAP frozen entries (WCAG relLum/contrast in-test)"]
key-files:
  created: []
  modified:
    - packages/pixel-office/src/sprites/bubbleSprites.test.ts
    - packages/pixel-office/src/sprites/bubble-permission.json
    - packages/pixel-office/src/sprites/bubble-waiting.json
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md
decisions:
  - "Frozen-state glyphs (STATUS_MAP frozen: true) carry a closed 1 px #000000 outline (4-connected), fill >= 3:1 vs outline, enforced by bubbleSprites.test.ts"
  - "Hourglass neck is 3 px (odd width keeps it centred on the 11-wide grid; satisfies >= 2 px)"
  - "Hourglass uses #4361ee caps/sand plus light #a9bcff glass bulbs; '?' keeps amber #ffb703"
metrics:
  duration: ~10m
  completed: 2026-09-22
actuals:
  tokens: 9000
  tasks: 2
  commits: 3
plan_head_before: 676673475e3312da41fd186503e2061a735ba403
---

# Phase 5 Plan 23: Outlined frozen-state glyphs (G-05-2) Summary

The waiting_for_ceo '?' and the waiting_for_agent hourglass now have a closed 1 px black outline, and every feature is drawn in a fill colour that contrasts with that outline. Four new guard tests, driven by STATUS_MAP's frozen entries, now block any frozen glyph that is low-contrast or depends on colour alone.

## What changed

- **Tests** (`bubbleSprites.test.ts`): new describe "G-05-2 frozen-state glyph contrast". It derives `FROZEN` from STATUS_MAP and asserts it equals {blocked, permission, waiting}. Its four checks: a closed near-black outline (every edge cell is one colour with relLum <= 0.03); every interior cell >= 3:1 against the outline; the outline >= 3:1 against `FALLBACK_FLOOR_COLOR`; each pair of frozen masks differs in >= 20 cells.
- **bubble-permission.json**: amber '?' with the hook, a 2 px stem and a 2x2 dot, all in `#ffb703`. A 1 px `#000000` outline surrounds it, a transparent row separates the stem from the dot, and there is no plate behind it.
- **bubble-waiting.json**: hourglass with caps and sand in `#4361ee` and light `#a9bcff` glass in the bulbs. The neck is 3 px wide and the whole shape has a 1 px `#000000` outline.
- **05-UI-SPEC.md**: both inventory rows are updated, and the asset format contract has a new bullet on frozen-glyph outline and contrast (cites 05-23).

## TDD gate

- RED (`e404aee`): 4 failed / 124 passed. permission and waiting failed "closed near-black outline" (two edge colours each). Two more checks also failed: waiting interior #4361ee vs its #22246e caps was 2.71:1, and the permission edge #8a5a00 vs the floor was 1.50:1. blocked passed all four, as the plan predicted.
- GREEN (`d195174`): 128/128 pixel-office tests pass. The 12-glyph mask-uniqueness test still passes and so does the Hamming test. bubble-blocked.json is unchanged.

## Visual check (four variants)

I rendered the three frozen glyphs at 8x on a `FALLBACK_FLOOR_COLOR` (#808080) strip and a `WALL_COLOR` (#3A3A5C) strip, in four variants: original, grayscale (Rec.709), deuteranopia and protanopia (Machado 2009, severity 1.0). This was a throwaway scratchpad script and is not committed. Result: **pass in all 8 panels**. The '?' hook, stem and dot are all visible. The hourglass shows the glass top bulb, the sand bottom bulb and the neck. Blocked (octagon + bar), '?' and hourglass differ by shape even where deutan/protan turns red and amber into similar olive/yellow.

## Deviations from Plan

- **Hourglass neck is 3 px, not 2 px.** The plan requires >= 2 px, and the UI-SPEC row text from the plan said "2 px neck". An odd width keeps the neck centred on the 11-column grid, so the UI-SPEC row says "3 px neck (>= 2 px)".
- The outline is 4-connected, so diagonal corners are left open for a rounded pixel-art look. That matches exactly what the test checks: every opaque cell with a transparent or out-of-grid 4-neighbour is outline.

## Known Stubs

None.

## Commits

- e404aee test(05-23): add failing frozen-glyph contrast guard tests (G-05-2)
- d195174 feat(05-23): re-author '?' and hourglass glyphs with closed black outline (G-05-2)
- 41c66f7 docs(05-23): UI-SPEC frozen-glyph outline/contrast contract and re-authored inventory rows (G-05-2)

## Self-Check: PASSED

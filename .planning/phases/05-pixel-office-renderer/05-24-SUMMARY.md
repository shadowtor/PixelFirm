---
phase: 05-pixel-office-renderer
plan: 24
subsystem: pixel-office / renderer
status: complete
tags: [gap-closure, G-05-1e, layout, furniture, z-sort, sprite-cache, OFFICE-01]
requires: ["05-21", "05-22"]
provides: [office-layout.json, officeLayout.ts (OFFICE_TILE_MAP, tileSpriteAt, FURNITURE, FURNITURE_BLOCKED_TILES, SEATS, STANDING_SPOTS, isOwnSeat), furnished renderer, per-(sprite, zoom) OffscreenCanvas cache]
affects: [05-25, 05-26, 05-27, 05-28]
tech-stack:
  added: []
  patterns:
    - "One layout JSON drives the tile grid, furniture, seats and standing spots; officeLayout.ts throws at load on malformed data"
    - "Furniture and characters z-sorted together in renderer pass 1 (furniture zY = footprint bottom + z*0.01)"
    - "drawSpriteData -> spriteCanvas(sprite, zoom) WeakMap cache -> drawImage; fillRect fallback where OffscreenCanvas is absent"
key-files:
  created:
    - packages/pixel-office/src/layout/office-layout.json
    - packages/pixel-office/src/layout/officeLayout.ts
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - packages/pixel-office/src/index.ts
decisions:
  - "Office layout: 20x11 grid, 8 desks (3x1) at cols 1/5/9/13 on rows 5 and 9, 16 seats on rows 4 and 8, 4 standing spots (17,4) (18,4) (17,8) (18,8), decor on the right strip and wall row only"
  - "Monitor dy stays at -18 (the plan's starting value): the monitor sits on the desk top just in front of the seated agent's chest; screenshot confirmed"
  - "Sprite cache is a WeakMap<SpriteData, Map<zoom, OffscreenCanvas>>, never evicted (bounded by module-level sprites per zoom)"
metrics:
  duration: ~20m
  completed: 2026-09-22
actuals:
  tokens: 6900
  tasks: 2
  commits: 4
plan_head_before: 58c2769c8a27f6910b18ecf89ec8516e23c7b879
requirements-completed: [OFFICE-01]
---

# Phase 5 Plan 24: Furnished office layout and sprite cache (G-05-1e) Summary

The office now renders from one layout file. It has a MetroCity plank floor, a wall along the top, 8 desks in two rows of four pods with 16 monitors, a bookcase, a cabinet, two plants and two paintings. Furniture is z-sorted with characters, and every sprite is rasterised once per zoom and drawn with `drawImage` in the browser.

## What changed

- **`layout/office-layout.json`** holds the whole office as data: 11x20 `W`/`.` tile rows, 16 seats, 4 standing spots, and 30 furniture entries (8 desks, 16 monitors, bookcase, cabinet, plant, plantSmall, 2 paintings).
- **`layout/officeLayout.ts`** exports:
  - `OFFICE_TILE_MAP`
  - `tileSpriteAt` (a floor quadrant, `wallTop` on row 0, otherwise null so the tile is drawn in WALL_COLOR)
  - `FURNITURE` (placed in unzoomed px, with a zY)
  - `FURNITURE_BLOCKED_TILES`, `SEATS`, `STANDING_SPOTS`, `isOwnSeat`

  It throws at load if the grid size is wrong or a sprite key is unknown.
- **`engine/renderer.ts`**:
  - `renderTileGrid` draws the tile sprites.
  - `renderScene` and `renderFrame` take a trailing `furniture = []` parameter. Pass 1 z-sorts furniture and characters together. Dialogue and glyph passes are unchanged.
  - Task 2 added `spriteCanvas`, which `drawSpriteData` uses.
  - The header now records that the furniture layer was re-added from MetroCity (D-05).
- **`index.ts`**: `OFFICE_TILE_MAP` replaces `buildDefaultTileMap()` (the wall/floor shape is identical). The game loop passes `FURNITURE` to `renderFrame`. The old desk-row seating formula is left for 05-25 to replace.
- **Tests** (`renderer.test.ts`):
  - New describe "furnished office (G-05-1e)" with 5 tests: floor/wall tiles, furniture footprints, desk/agent layering, wall decor behind characters, and a well-formed seat model.
  - The 05-13 dialogue-colour guard now includes every office-metrocity colour.
  - New describe "sprite cache" uses a fake OffscreenCanvas to check that each distinct sprite is built once in frame 1 and nothing is built in frame 2.
  - `mockCtx` now records `drawImage`.

## Verification

- `pnpm --filter pixel-office test`: 134/134 pass (all earlier tests unchanged).
- `pnpm --filter web typecheck`: exit 0.
- **Screenshot check, Task 1 (fillRect-era build):** ran vite on port 5179, then a Playwright screenshot of `#office-canvas` at 1280x704 (zoom 4). The plank floor has no seams and the wall tile runs along the top. There are 8 desks in two rows of four with clear lanes at cols 4/8/12/16 and rows 3/6/7. Each seat position has one monitor on the desk top. The bookcase, cabinet and plants are on the right strip and the two paintings are on the wall. The final monitor dy is **-18**.
- **Screenshot check, Task 2 (drawImage path):** the page reports `typeof OffscreenCanvas === "function"`, so the cached `drawImage` path is used. The screenshot is byte-identical to the Task 1 screenshot (0 differing bytes).

## Deviations from Plan

None. The plan was executed as written.

## Known Limitations (not stubs)

- Agents are still seated by the old desk-row formula (rows 3/6/9), so a row-9 agent currently stands on a desk. 05-25 moves seating onto `SEATS`, as the plan intends.
- `FURNITURE_BLOCKED_TILES` is not yet used by pathfinding. 05-27 wires it.
- `FALLBACK_FLOOR_COLOR` is no longer painted by the renderer. It stays exported for tests and the harness, per the plan.

## Commits

- a57c3f3 test(05-24): add failing furnished-office layout and z-order tests (G-05-1e)
- 13affdb feat(05-24): furnished office from one layout file with z-sorted furniture (G-05-1e)
- e6789a2 test(05-24): add failing sprite-cache test and drawImage recording in mockCtx
- edb14d1 perf(05-24): rasterise each sprite once per zoom and draw with drawImage (T-05-24-01)

## Self-Check: PASSED

---
phase: 05-pixel-office-renderer
plan: 22
subsystem: pixel-office / sprite assets
status: complete
tags: [gap-closure, G-05-1e, sprites, metrocity, asset-licences, OFFICE-01, OFFICE-02]
requires: ["05-20"]
provides: [office-metrocity.json, decode-metrocity-interior.mjs --check, ASSET-LICENSES §1a]
affects: [05-24, 05-26]
tech-stack:
  added: []
  patterns: ["committed source sheets + SHA-256-pinned decode script + --check drift guard run from a test"]
key-files:
  created:
    - packages/pixel-office/assets/metrocity-interior/Home/TilesHouse.png
    - packages/pixel-office/assets/metrocity-interior/Home/LivingRoom-Sheet.png
    - packages/pixel-office/assets/metrocity-interior/Home/Flowers-Sheet.png
    - packages/pixel-office/assets/metrocity-interior/Home/Cupboard-Sheet.png
    - packages/pixel-office/assets/metrocity-interior/Home/Paintings-Sheet.png
    - packages/pixel-office/assets/metrocity-interior/Hospital/Miscellaneous-Sheet.png
    - packages/pixel-office/scripts/decode-metrocity-interior.mjs
    - packages/pixel-office/src/sprites/office-metrocity.json
    - packages/pixel-office/src/sprites/officeSprites.test.ts
  modified:
    - references/ASSET-LICENSES.md
decisions:
  - "Office floor/wall/furniture sourced from MetroCity Interior (CC0 at listing, user-approved); fork furniture packs stay deferred (§4)"
  - "wallTop = TilesHouse rect 16,24,16,16 (white wall, brown trim, wainscot top); floorTiles = 96,128 block (first choice tiled seamlessly)"
  - "monitorBack is a 10x9 original authored inline in the decode script, recorded in ASSET-LICENSES §3"
metrics:
  duration: ~10m
  completed: 2026-09-22
actuals:
  tokens: 41000
  tasks: 2
  commits: 3
plan_head_before: 7b0a01ae9dfd0801a768e2da17b8444ed74b094a
---

# Phase 5 Plan 22: MetroCity Interior office sprite pipeline Summary

Six MetroCity Interior sheets are now committed in the repo. A decode script pinned by SHA-256 turns them into `office-metrocity.json`, and `officeSprites.test.ts` fails on any drift (it runs `--check`). ASSET-LICENSES now documents the pack at its primary source and upgrades character link 2 for the outfit layer.

## What changed

- `assets/metrocity-interior/{Home,Hospital}/`: 6 byte-for-byte copies (checked with `cmp`) from the extracted Interior.rar.
- `scripts/decode-metrocity-interior.mjs`: a tile/bbox manifest, alpha>=128 tight boxes, SHA-256 per sheet and an inline original `monitorBack`. Importing it does not run it (`main()` is guarded). `--check` prints the first differing key and exits 1. I checked this by mutating `licence`: it reported `differs ... at licence` and exited 1.
- Final rects: floorTiles 96,128,32,32 · wallTop 16,24,16,16 · desk 25,15,46,30 · plant 22,3,20,41 · plantSmall 89,23,14,21 · bookcase 270,20,36,43 · cabinet 1333,20,22,27 · painting 73,7,14,16 · monitorBack 10x9 original. All bbox results match the planning-time measurements.
- ASSET-LICENSES:
  - §1 retitled. Link 2 is now verified for the outfit layer (110/110) and credit-only for the hair layer.
  - The character listing was re-fetched and still offers `MetroCity 2.0.rar`.
  - New §1a records the listing, fetch date, SHA table, rect table and JIK-A-4 credit.
  - `monitorBack` is added to the §3 originals.
  - The §3 "undocumented provenance" paragraph is rewritten, and §4 now has a pointer to §1a.

## Visual self-check (scratchpad, not committed)

I rendered a 4x3 tiling of floorTiles under a wallTop row, plus every furniture sprite, at 6x.
- The plank floor tiles with no seam.
- The first wall window (y=0) was a wood band over white wall, which reads as a wall top, not a base. I moved it to y=24, which shows white wall, a brown trim at rows 35-38 and the top of the wainscot. Every row in that window is uniform or periodic within the 16 px tile, so it tiles horizontally. Rows 40 and below were not used because the wainscot panel frame there starts mid-tile.
- No furniture crop is cut off or picks up pixels from a neighbour.

## Primary-source re-fetch (2026-09-22, curl, HTTP 200)

- https://jik-a-4.itch.io/metrocity: "MetroCity - Free Top Down Interior Asset Pack by JIK-A-4". Asset license: Creative Commons Zero v1.0 Universal. "Credits are not necessary but would be appreciated." Download: Interior.rar 180 kB.
- https://jik-a-4.itch.io/metrocity-free-topdown-character-pack: CC0. Downloads: MetroCity.rar 44 kB and MetroCity 2.0.rar 33 kB.

## Verification

- `node packages/pixel-office/scripts/decode-metrocity-interior.mjs --check` exits 0.
- `pnpm --filter pixel-office test`: 117 passed (112 existing + 5 new). `pnpm --filter web test`: 19 passed.
- No temp or upload path appears in the script or the JSON (grep count 0 for both). All 6 SHA values in ASSET-LICENSES match the JSON `sources`.
- Tracer gate: `<verify>` is automated-only and re-ran green, so the plan continued to Task 2.

## TDD Gate Compliance

- RED: `5bfde93`. 5 tests failed because the script and JSON did not exist.
- GREEN: `ee2f823`. All tests pass.
- REFACTOR: not needed.

## Deviations from Plan

- The plan's `pnpm --filter pixel-office test -- officeSprites` runs the whole suite (8 files), not just the filtered file. It still includes officeSprites and passes, so nothing was changed.
- The permission quote ("you are OK to use them if it makes things easier") is not in 05-UAT.md. It appears only in 05-22-PLAN.md's user context. §1a cites it that way, together with the UAT test 3 evidence ("user confirmed the art is fine to use"), and does not claim it is in the UAT file.
- The "Attribution in the running app" section was left for 05-26, as the plan says. It says the footer credits the pack without asserting a licence. That is still true, just more conservative than §1 now allows.

## Known Stubs

None. Nothing imports the JSON until 05-24, which is intentional.

## Commits

- 5bfde93 test(05-22): add failing office-metrocity sprite tests (G-05-1e)
- ee2f823 feat(05-22): commit MetroCity Interior sheets and reproducible office sprite decode (G-05-1e)
- 0ac078d docs(05-22): ASSET-LICENSES — Interior pack provenance (§1a), link-2 outfit-layer upgrade, original monitorBack

## Self-Check: PASSED

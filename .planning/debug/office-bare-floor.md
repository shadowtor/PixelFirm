---
status: diagnosed
trigger: "G-05-1e: office renders bare grey floor (FALLBACK_FLOOR_COLOR) with dark wall border; no desks/chairs/floor tiles/zones; characters at desk positions look scattered (seated TYPE agents drawn lower than IDLE)."
created: 2026-09-22T00:00:00Z
updated: 2026-09-22T00:00:00Z
goal: find_root_cause_only
symptoms_prefilled: true
bug_class: Bohrbug (deterministic, missing layer; not a runtime defect)
---

## Current Focus

hypothesis: CONFIRMED. The fork's furniture/floor-sprite/wall-sprite/seat layer was deliberately trimmed out in 05-01 ("re-add when a later plan needs it") and no later plan, requirement or success criterion ever asked for it back. The fork's no-assets fallback (solid FALLBACK_FLOOR_COLOR) became the production path. Desk slots are a bare coordinate grid picked for glyph headroom, not a furnished layout, and TYPE keeps the fork's chair sitting offset with no chair drawn.
test: done (code read, fork diff at 3537e140, screenshot measurement, sprite-frame measurement, planning-doc trace)
expecting: n/a
next_action: return ROOT CAUSE FOUND to the orchestrator (diagnose-only)

reasoning_checkpoint:
  hypothesis: "No furniture or floor tiles render because packages/pixel-office never contained a furniture/floor/wall/seat layer. 05-01 removed it on purpose, a human approved that, and nothing re-added it. renderTileGrid can only fillRect FALLBACK_FLOOR_COLOR or WALL_COLOR. Agents look scattered because seats are an unfurnished 18-per-row grid packed from (1,3), and because TYPE sinks 9px into a chair that isn't drawn."
  confirming_evidence:
    - "renderer.ts:5-16 header lists the dropped furniture/wall/carpet/area/pet layers and the floor-sprite PNG pipeline. renderer.ts:56-72 renderTileGrid has only two fills (WALL_COLOR, FALLBACK_FLOOR_COLOR)."
    - "index.ts:25-39 buildDefaultTileMap is a wall border plus FLOOR_1, commented 'No furniture/desks this plan (05-01)'. handoff-choreography.ts:38-40 has NO_BLOCKED_TILES = empty set, commented 'no furniture — 05-01's trim'."
    - "Fork renderer.ts:309-330 uses FALLBACK_FLOOR_COLOR only when !hasFloorSprites(), so it is the no-asset fallback. Here it is the only path."
    - "05-01-SUMMARY.md:53,171 records the trim as a human-approved deviation. 05-UI-SPEC.md:106 then locks #808080 as the 'Dominant 60%' floor colour."
    - "Measured: IDLE uses walk frame 1 (opaque rows 3-30). TYPE uses typing frames 3/4 (opaque rows 6-31) plus CHARACTER_SITTING_OFFSET_PX 6. That is 9px lower. Screenshot shows about 55 screen px at 6x, which is about 9 native px."
  falsification_test: "Any layer in packages/pixel-office that draws a furniture/tile sprite, or any plan/requirement after 05-01 that re-adds furniture and was reverted. Neither exists: grep plus git log over packages/pixel-office show no furniture/floor sprite code after 5be2437."
  fix_rationale: "n/a (diagnose-only)"
  blind_spots: "Did not render the fork's default-layout-1.json live against this repo. Did not verify the Interior pack's licence text beyond the UAT note (the pack ships no licence file)."
  candidate_causes:
    - "code: furniture/floor/wall/seat layer trimmed out in 05-01 and never restored (CONFIRMED)"
    - "config/scope (planning): no requirement or success criterion names desks/furniture, so 20 verification rounds never flagged it. UI-SPEC locked the fallback colour as the design (CONFIRMED, contributing)"
    - "data/assets: fork furniture/floor/wall PNGs have undocumented provenance (ASSET-LICENSES section 4), and D-05 scoped the audit to wired assets only (CONFIRMED, contributing: it removed the incentive to wire them)"
    - "environment: asset load failure at runtime (ELIMINATED: there is no asset loader to fail)"
  and_gate: "yes. The trim alone would likely have been caught if any requirement or success criterion mentioned desks or furniture. The gap needed both the code trim and the scope/spec omission (plus UI-SPEC enshrining the fallback colour)."

## Symptoms

expected: Office renders basic desks/workstations, floor tiles/walls and walking lanes; idle agents snap to desk/chair positions with clear paths between.
actual: Flat grey floor (FALLBACK_FLOOR_COLOR) with dark wall border; no desks, chairs, floor tiles or zones; characters stand at desk positions that look arbitrarily scattered; seated TYPE agents drawn lower than IDLE ones.
errors: none (visual)
reproduction: open live harness office with several agents (UAT 05 test 1, screenshot scratchpad uat05/1-states.png)
started: always (phase 05 as built)

## Eliminated

- hypothesis: floor/furniture sprites exist but fail to load at runtime (fallback colour shown because of an asset-load error)
  evidence: no asset loader, PNG pipeline, furniture type or layout JSON exists anywhere in packages/pixel-office/src. renderTileGrid has no sprite branch at all. ASSET-LICENSES.md section 3 confirms no fork furniture/floor/wall PNG is wired.
  timestamp: 2026-09-22
- hypothesis: furniture was an explicit user-level scope deferral (CONTEXT decision, ROADMAP/REQUIREMENTS deferral)
  evidence: 05-CONTEXT.md D-01..D-05 never mention furniture/desks, and "Deferred Ideas: None". ROADMAP Phase 5 success criteria 1-4 and OFFICE-01/02/03 say "render one floor with agents", with no furniture wording and no deferral. PROG-01 (v2) covers progression unlocks of additional desks/rooms, not a baseline furnished office. The only decisions are execution-level: the 05-01 Task 1 checkpoint trim (coordinator/human-approved) and D-05's licence-audit scoping, which deferred auditing unused fork asset packs.
  timestamp: 2026-09-22

## Evidence

- timestamp: 2026-09-22
  checked: screenshot uat05/1-states.png (1920x1056 = 320x176 at 6x)
  found: 20x11 grid, 1-tile WALL_COLOR border, solid #808080 interior. Six agents on seat row 3, cols 1-6, shoulder to shoulder in the top-left, with the rest of the floor empty. The three glyph agents (blocked/waiting_for_ceo/waiting_for_agent, IDLE pose) sit about 9 native px higher than the three glyph-less TYPE agents.
  implication: nothing but a tile fill and characters is drawn. Height scatter is pose-dependent.

- timestamp: 2026-09-22
  checked: packages/pixel-office/src/engine/renderer.ts (full)
  found: header lines 5-16 say the fork's ~1050-line renderer had its furniture/wall/carpet/area/pet layers and the floor-sprite PNG pipeline (getColorizedFloorSprite/hasFloorSprites) dropped, "Re-add the relevant layer here ... once a later plan actually needs furniture/carpets/areas/pets". renderTileGrid (56-72) fills WALL_COLOR or FALLBACK_FLOOR_COLOR only. renderScene (175-214) z-sorts characters only. Line 190 applies CHARACTER_SITTING_OFFSET_PX to TYPE with no chair.
  implication: the renderer cannot draw furniture or floor sprites. There is no code path for it.

- timestamp: 2026-09-22
  checked: packages/pixel-office/src/types.ts, constants.ts, engine/characters.ts, layout/tileMap.ts headers
  found: types.ts:5-14 dropped FurnitureInstance/FurnitureCatalogEntry/PlacedFurniture, CarpetTile/AreaDefinition/OfficeLayout, Seat. constants.ts:5-11 dropped carpet/area/etc. characters.ts:10-12 dropped "seat assignment/seat-rest logic (no furniture/seats exist in this plan's minimal renderer)". tileMap.ts (findPath/isWalkable/getWalkableTiles) was kept verbatim and already supports blockedTiles.
  implication: the whole layout/seat model was removed. Only the BFS that could consume it survives.

- timestamp: 2026-09-22
  checked: packages/pixel-office/src/index.ts
  found: buildDefaultTileMap (25-39) is a border WALL plus FLOOR_1 interior, commented "No furniture/desks this plan (05-01)". Seat slot k gives row 3 + 3*floor(k/18) and col 1 + k%18 (DESK_ROW_START=3, DESK_ROW_PITCH=3 at 73-76, deskForSlot 117-120). nextDeskPosition (137-144) takes the lowest free slot. Rows 3/6/9 were derived purely from glyph headroom (05-10, CR-02 comment 67-76), not from any office composition.
  implication: seats are coordinates, not workstations. 18 per row on a 16px pitch with 16px-wide sprites leaves zero horizontal gap. A team of 18 or fewer is one packed line in the top-left, with 80%+ of the floor empty.

- timestamp: 2026-09-22
  checked: handoff/handoff-choreography.ts:38-40,91,124,159
  found: const NO_BLOCKED_TILES = new Set() ("No blocked-tile tracking exists anywhere in this repo yet (no furniture — 05-01's trim)"). The sender walks to toChar.seatCol/seatRow, the receiver's own tile.
  implication: there is no notion of desk/chair/aisle tiles. Paths can cross other seats, and the sender stands on the receiver's tile (couples to G-05-1d). If desks are added as blocked tiles, the fork's findPath returns [] for a non-walkable end tile and walkCharacterTo silently no-ops. So the handoff target must become an adjacent free "interaction tile", or use the fork's withOwnSeatUnblocked trick.

- timestamp: 2026-09-22
  checked: sprites/character-metrocity.json down-direction frames, opaque row extents
  found: walk frames 0/2 have rows 2-29 and frame 1 (IDLE) rows 3-30. Typing frames 3/4 have rows 6-31. So TYPE is 3px lower in-frame, +6 CHARACTER_SITTING_OFFSET_PX, for 9px total.
  implication: "seated agents drawn lower" is the fork's chair-sit offset and seated-pose art rendered with no chair beneath. It matches the screenshot (about 55 screen px / 6 = 9.2 px).

- timestamp: 2026-09-22
  checked: fork pixel-agents-hq/pixel-agents @ 3537e140 (GitHub tree API plus raw files, saved in scratchpad/fork/)
  found: (a) renderer.ts:309-330 renderTileGrid uses FALLBACK_FLOOR_COLOR only when !hasFloorSprites(), otherwise getColorizedFloorSprite(tile, tileColors[i]). renderScene z-sorts furniture instances (f.zY) into the same drawables list as characters (charZY = ch.y + TILE_SIZE/2 + 0.5). renderFrame adds getWallInstances (auto-tiled walls) and a carpet layer. (b) layout/layoutSerializer.ts has layoutToTileMap, layoutToFurnitureInstances, getBlockedTiles (skips backgroundTiles rows), and layoutToSeats (every chair footprint tile becomes a seat, with facing from orientation or an adjacent desk). (c) engine/seatPlacement.ts has closestFreeSeat/anchorTile. officeState.ts:262 withOwnSeatUnblocked keeps seats blocked but unblocks your own for findPath. (d) furnitureCatalog.ts is a manifest-driven catalog. floorTiles.ts has 9 greyscale floor patterns colorized per tile. wallTiles.ts auto-tiles walls with a 4-bit mask. (e) assets/default-layout-1.json is a 21x22 grid whose used area is exactly 20x11 (rows 10-20). It has two rooms split by an internal wall at col 10 with a doorway at rows 14-17, floor patterns 7/1/9, and 36 furniture pieces: 2x DESK_FRONT+PC_FRONT+CUSHIONED_BENCH workstations, 1 TABLE_FRONT with 4 WOODEN_CHAIR_SIDE plus 4 PC_SIDE, a sofa/coffee-table lounge, bookshelves, plants, paintings, clock, bin. (f) Manifests: DESK_FRONT 48x32 (3x2 footprint, backgroundTiles 1), DESK_SIDE 16x64, PC 16x32 (1x2, canPlaceOnSurfaces, animated ON frames), WOODEN_CHAIR 16x32 (1x2, front/back/side), CUSHIONED_BENCH 16x16. Floors floor_0..8.png, wall wall_0.png.
  implication: everything G-05-1e asks for exists in the fork at the same 16px/16x32 scale as this repo's characters, and the fork's default footprint matches this repo's 20x11 grid. It was dropped, not missing upstream.

- timestamp: 2026-09-22
  checked: .planning/phases/05-pixel-office-renderer/05-01-PLAN.md:180, 05-01-SUMMARY.md:53,171, 05-RESEARCH.md:127,157
  found: RESEARCH planned "renderer.ts — draws tiles → furniture → characters → bubbles" and "layout/ forked verbatim: tileMap.ts (findPath), furnitureCatalog". The 05-01 PLAN's fork list omitted layoutSerializer/furnitureCatalog/officeState/seatPlacement/floorTiles/wallTiles and asked for "renderer.ts (tile/character draw calls, verbatim)". The executor flagged at the Task 1 checkpoint that the renderer pulled ~10 modules outside the file list. The coordinator approved trimming to "tile grid + one idle character". The SUMMARY says every trimmed header documents what was dropped "so a later plan re-adding furniture/carpets/pets/bubbles isn't guessing".
  implication: the trim happened at execution time and was approved as temporary. There was no owning plan to re-add it.

- timestamp: 2026-09-22
  checked: ROADMAP.md Phase 5, REQUIREMENTS.md OFFICE-01..04/PROG-01, 05-CONTEXT.md, 05-UI-SPEC.md:106, references/ASSET-LICENSES.md sections 3-4
  found: The success criteria and OFFICE-01 only say "render one floor with agents", with no furniture wording. CONTEXT D-01..D-05 have no furniture decision and Deferred Ideas is "None". PROG-01 (v2) is progression unlocks. UI-SPEC Color table locks "#808080 (FALLBACK_FLOOR_COLOR) Dominant 60% Office floor tiles". ASSET-LICENSES section 3 says there are no fork furniture/floor/wall PNGs wired ("flat solid-colour fill"). Section 4 lists the fork's furniture/floors/walls/carpets/pets packs as deferred, with provenance undocumented (no credit beyond the character pack).
  implication: not an explicit user scope decision. The omission slipped through because no verifiable truth covered it, and the UI-SPEC then ratified the fallback colour as design. 20 plans of gap closure never saw it.

- timestamp: 2026-09-22
  checked: MetroCity Interior pack (scratchpad uat05/mc/d188b927-Interior/Interior/), PNG dims and per-sprite bounding boxes
  found: Tile sheets are on a 16x16 grid (matches TILE_SIZE). Home/TilesHouse.png is 512x512: wood-plank 2x2 floor blocks at px (32,128), (96,128), (32,176), (96,176), a checker tile at (144,144), 3x4-tile wall faces (white/dark/teal) at rows 4-7, wallpaper panels (cream/red/blue/white) at cols 21-31, and a large green carpet at rows 20-23. Hospital/TilesHospital.png is 320x256: 3x4 wall faces (white x3, dark wood), blue grid / white tile / dark and light wood-plank floor 2x2 blocks. Furniture sheets: Hospital/Miscellaneous-Sheet.png 3072x64 with 64x64 frames, except the reception desks, which are 128x64 frames at x=2560/2688/2816 with 122x45 sprites (the third has a dark computer monitor on it). The same sheet has a whiteboard 52x23 at x~295, a side armchair 20x30, a dark tall-back side chair 15x25 at x~697, a 4-seat waiting row 62x25, a filing cabinet 22x27, a green-screen monitor 25x17 at x~1075, notice boards and signs, a bin, and a window. Home/LivingRoom-Sheet.png 192x96 has 96x96 frames and a wooden table 46x30, the best plain desk. Home/Miscellaneous-Sheet.png 640x64 has 64x64 frames: pink round table 33x26, pink chair side L/R 12x21, back 11x21, dressers. Home/TV-Sheet.png 256x96 has 64x96 frames: CRT front/back 24x29, flat screen front/back 48x27. Home/Cupboard-Sheet 64x96 frames, bookcase/cabinets. LivingRoom1-Sheet 384x960 has sofas in 10 colours (front/back/side). Lights, Flowers (plants), Paintings (32x32), Windows (64x64), Carpet (64x64), Doors. No licence file in the pack (UAT: itch page says credit not required, appreciated; credit JIK-A-4).
  implication: the pack provides floors, walls and decor at the right 16px scale. It has no dedicated small office computer desk or office chair: the closest are the hospital reception desk with monitor (about 8 tiles wide, too big for one desk per agent), the wooden table (3x2 tiles), and side chairs. A 1-agent workstation would need the fork's DESK/PC/chair or a composed table+monitor+chair.

## Resolution

root_cause: "05-01 cut the fork's office-layout subsystem (layoutSerializer/furnitureCatalog/seat model, floorTiles/wallTiles sprite pipelines, the furniture z-sort layer in renderer.ts) to a 'tile grid + one IDLE character' tracer. That was a human-approved execution-time trim, with every header saying 're-add once a later plan needs it', and no later plan did. renderTileGrid is left with only the fork's no-assets fallback (solid FALLBACK_FLOOR_COLOR / WALL_COLOR). Seats are bare coordinates: index.ts deskForSlot packs 18 agents per row shoulder-to-shoulder from (1,3), with rows 3/6/9 chosen only for glyph headroom, and there are no blocked tiles (NO_BLOCKED_TILES). TYPE keeps the fork's chair CHARACTER_SITTING_OFFSET_PX (6) plus the lower seated-frame art (3) with no chair drawn, so seated agents sit 9px below idle neighbours. It survived 20 plans because no ROADMAP success criterion or OFFICE-* requirement mentions desks/furniture, 05-UI-SPEC locked #808080 as the dominant floor colour, and D-05 deferred the fork's furniture/floor/wall packs (undocumented provenance) from the licence audit. The gap needed both the code trim and the scope omission; it was never an explicit user scope decision."
fix: ""
verification: ""
files_changed: []

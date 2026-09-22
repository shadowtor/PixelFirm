---
phase: 05-pixel-office-renderer
reviewed: 2026-09-22T22:15:00Z
depth: standard
scope: incremental (diff_base ff1e278 — gap-closure plans 05-21..05-30)
files_reviewed: 21
files_reviewed_list:
  - apps/web/index.html
  - apps/web/src/App.tsx
  - apps/web/src/App.test.tsx
  - apps/web/src/agent-event-mapper.test.ts
  - packages/pixel-office/scripts/decode-metrocity-interior.mjs
  - packages/pixel-office/src/constants.ts
  - packages/pixel-office/src/types.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/index.test.ts
  - packages/pixel-office/src/engine/characters.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/handoff/dialogue-templates.ts
  - packages/pixel-office/src/handoff/dialogue-templates.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/layout/officeLayout.ts
  - packages/pixel-office/src/layout/office-layout.json
  - packages/pixel-office/src/sprites/bubbleSprites.test.ts
  - packages/pixel-office/src/sprites/officeSprites.test.ts
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 0
  warning: 5
  info: 7
  total: 12
status: issues_found
---

# Phase 5: Code Review Report (incremental, 05-21..05-30)

**Reviewed:** 2026-09-22T22:15:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This pass covers the gap-closure plans 05-21..05-30: integer display scaling (App.tsx,
`displayScaleFor`), the furnished MetroCity Interior layout (`officeLayout.ts`,
`office-layout.json`, decode script), the per-(sprite, zoom) OffscreenCanvas cache,
furniture z-sorting, occupancy-aware handoff walks with interaction tiles (05-27), the
speech-bubble dialogue (05-28/05-29), and head-anchored glyphs (05-30). The pixel-office
suite passes (152/152), and `decode-metrocity-interior.mjs --check` reports no drift.

No blockers were found. Five warnings:

- One layout defect: the 20th agent's home tile is drawn behind a plant (WR-01).
- The "integer scale" guarantee does not hold when `devicePixelRatio` is not 1 (WR-02).
- The receiver-identity gap from the previous round is still open, and 05-27 widened it (WR-03).
- Two new failure modes in the 05-27 occupancy-aware walk: a walk home that silently does
  nothing and strands the sender (WR-04), and a sender that stands on a vacant seat, which a
  newly spawned agent is then placed on as well (WR-05).

## Status of prior findings

| Prior ID | Status |
|---|---|
| WR-01 identity rule is not applied to the receiver | **Open.** Not addressed by 05-21..05-30. 05-27/05-28 widen it (see WR-03) |
| IN-01 stale comments | **Open.** All three are still present; one more added (see IN-01) |
| IN-02 same-sender supersede clears the previous receiver's accepted line | **Open.** Unchanged (`handoff-choreography.ts:138-141, 178-180`) |
| IN-03 a re-route mid-step snaps the character back a tile | **Open.** Unchanged (`characters.ts:179-189`) |
| IN-04 `identityHueFor` documented as "Pure" | **Open.** Unchanged (`index.ts:77`) |
| Harness WR-02..WR-05 / IN-04..IN-05 from earlier rounds | Not re-evaluated this round. The harness changed heavily, so re-check them against the current file. New harness items are in IN-05 |

---

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The agent on standing spot (18,8) is mostly hidden behind the plant at (18,9)

**File:** `packages/pixel-office/src/layout/office-layout.json:37, 66`; `packages/pixel-office/src/layout/officeLayout.ts:59-66`
**Issue:** The plant sprite is 20x41 and anchored at the bottom of tile (18,9): `y = 160 - 41 = 119`,
`x = 286..305`, `zY = 160`. An agent standing on its home at (18,8) has its feet at y = 136, its
sprite at y 104..136 and x 288..303, and `zY = 144.5`. The plant sorts later and is drawn over the
agent. The decoded plant is opaque across almost its full 20 px width for every row from 119 to 136
(checked against `office-metrocity.json`), so rows 15-31 of the agent's 32-row sprite (torso and
legs) are covered. Only the head is visible. Nothing checks for this: the layout tests cover
walkability and glyph placement at every home, but not whether furniture covers a home.
(`cabinet` at (17,5) clips the feet of the (17,4)/(18,4) spots by 3 px. That is cosmetic.)
**Fix:** Move the plant so it does not sit directly below a home, for example to the (16,9) gap,
or drop `plant` in favour of `plantSmall`, whose top at y = 139 clears the feet. Add a layout guard
to `renderer.test.ts`: for every entry in `[...SEATS, ...STANDING_SPOTS]`, no furniture piece with
`zY` greater than the home's zY may have opaque pixels inside the home's standing sprite box, except
the seat's own desk.

### WR-02: The integer display scale is computed in CSS pixels, so at devicePixelRatio ≠ 1 the pixels are unevenly sized

**File:** `apps/web/src/App.tsx:24-28, 117-124`
**Issue:** `displayScaleFor(window.innerWidth, …)` works in CSS pixels, and the backing store is set
to `320·scale × 176·scale` with no CSS size ("the CSS box must equal the backing store"). At
Windows 125% or 150% scaling, or on any HiDPI browser, the browser then resamples every canvas
pixel by 1.25 or 1.5. `image-rendering: pixelated` keeps the pixels sharp but gives them uneven
1/2 device-pixel widths. That is the G-05-1a defect that 05-21 was meant to close. The repo never
reads `devicePixelRatio`, and TRUTH 0 in the harness compares CSS size to backing store, so it
passes in this state.
**Fix:** Size in device pixels and let CSS scale down by exactly the DPR:
```tsx
function currentDisplayScale(): number {
  if (typeof window === "undefined") return MIN_DISPLAY_SCALE;
  const dpr = window.devicePixelRatio || 1;
  return displayScaleFor(window.innerWidth * dpr, (window.innerHeight - FOOTER_RESERVE_PX) * dpr);
}
// <canvas width={320*scale} height={176*scale}
//   style={{ width: 320*scale/dpr, height: 176*scale/dpr, … }} />
```
Also listen for DPR changes, because `resize` does not always fire on a zoom change:
`matchMedia(`(resolution: ${dpr}dppx)`)`. If OBS (DPR 1) is the only supported target, state that
next to `FOOTER_RESERVE_PX` instead.

### WR-03: (carried, prior WR-01) A receiver going OFFLINE or being re-seated still strands the sender, and 05-27/05-28 make the result worse

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:161-195, 255-289`; `packages/pixel-office/src/engine/renderer.ts:309-313`
**Issue:** `senderIsCurrent` still checks only `fromChar`, and the receiver is still looked up by id.
Since 05-27, the sender walks to a tile beside the receiver's seat as it was at request time. If
the receiver leaves:
- The sender waits beside an empty seat in ICON_VISIBLE until an `agent.handoff_completed` arrives,
  which may never happen. The task icon hides every non-frozen status glyph on the sender (the
  prior CR-01 symptom).
- The seat is handed to the next spawned agent (`nextDeskPosition`). The stuck sender's requested
  line ("title → agent-b") then sits beside the new occupant. Because the partner lookup
  (`layouts.find(p => p.ch.id === partnerId)`) fails, the bubble falls back to the sender alone.
- If the receiver is re-seated, the completion handler sets TYPE and the accepted line on the new
  object, which may be at a different seat.
**Fix:** As in the prior report: store `toChar` in `HandoffRecord` and check its identity at the top
of the loop while the phase is not RETURNING_TO_DESK (`retireHandoff(record, true)`). In the
completion branch, act only on `record.toChar` while it is still current. Add a real-loop test: the
receiver goes OFFLINE mid-walk; the sender goes home, its `bubbleType` equals `statusBubble`, and
`isWaitingHandoffSender` is false.

### WR-04: The occupancy-aware walk home can silently do nothing, and the sender is then stranded for good

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:151-154, 226-227, 280-286`; `packages/pixel-office/src/engine/characters.ts:185`
**Issue:** Before 05-27 the walk home used an empty blocked set, so on this open grid it always
found a path. It now uses `blockedTilesFor(fromChar, seat)`, which also blocks every other agent's
seat and the tile of every agent that is not walking. When that BFS returns `[]`,
`walkCharacterTo` does nothing: the sender is not walking and its path is empty. On the next tick
`checkHandoffArrivals` treats RETURNING_TO_DESK as `hasArrived`, retires the record, and nothing
ever sends the sender home again. It keeps typing or idling on another agent's row for the rest of
the session. The layout makes this easy to reach. An interaction tile between two seats with a desk
below it (for example (2,4)) has one exit, (c,3). The (18,4) standing spot has two exits, (18,3)
and (17,4), and (17,4) is another agent's seat. Any agent standing still on the exit tile is enough.
One example is a sender whose request resolved `interactionTileFor → null` while it was walking
along row 3, so it stays where it is. No test covers a walk home with no path.
**Fix:** Make occupancy a preference, not a hard wall:
```ts
function walkAvoiding(ch: Character, to: Tile): void {
  const tileMap = getTileMap();
  const soft = blockedTilesFor(ch, to);
  const path = findPath(ch.tileCol, ch.tileRow, to.col, to.row, tileMap, soft);
  walkCharacterTo(ch, to.col, to.row, tileMap,
    path.length > 0 || (ch.tileCol === to.col && ch.tileRow === to.row) ? soft : new Set(FURNITURE_BLOCKED_TILES));
}
```
Use it at all three walk-home call sites. Add a test in which the only exit is held by a standing
agent, and assert that the sender still reaches its seat.

### WR-05: `interactionTileFor` can place the waiting sender on a vacant seat or standing spot, and a newly spawned agent then gets the same tile

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:74-100`; `packages/pixel-office/src/index.ts:117-120`
**Issue:** The candidate filter excludes the seats of present agents, their current tiles, and live
targets. It does not exclude unassigned `SEATS`/`STANDING_SPOTS` entries. When both d=1 neighbours
are taken (two concurrent handoffs to the same receiver, or a neighbour agent standing there), the
search moves to d=2. On seat rows d=2 is always a seat column, and for a receiver at (17,4) or
(17,8), d=1 on the right is the (18,·) standing spot. So the sender waits on a vacant home.
`nextDeskPosition` checks only which seats are owned (`ch.seatCol/seatRow`), not which tiles are
physically occupied. The next agent to come online is therefore created on the waiting sender's
tile. The two sprites overlap, and the new agent's glyph stacks on the sender's bubble, which
attributes state to the wrong agent. The seated agent is also drawn with the sitting offset while
the sender stands on the same tile.
**Fix:** Every seat row has 8+ non-home floor tiles, so stop using homes as waiting spots:
```ts
const HOME_KEYS = new Set([...SEATS, ...STANDING_SPOTS].map((h) => tileKey(h.col, h.row)));
// in interactionTileFor's candidate filter:
if (taken.has(key) || HOME_KEYS.has(key) || !isWalkable(...)) continue;
```
Also, or instead, have `nextDeskPosition` skip homes that any present character is standing on.

---

## Info

### IN-01: Stale comments (carried, plus new ones)

**File:** `packages/pixel-office/src/index.ts:180-183`; `packages/pixel-office/src/engine/characters.ts:166-167`; `packages/pixel-office/src/handoff/handoff-choreography.ts:293-297`; `packages/pixel-office/scripts/decode-metrocity-interior.mjs:46`; `packages/pixel-office/src/layout/officeLayout.ts:3-4`
**Issue:**
- Carried: `stepOffice` says "WALK->IDLE signal", but a walk ends in `restPose`. `walkCharacterTo`
  says it "No-ops … if no path exists", but it keeps the previous path, which is the root of WR-04.
  The `isWaitingHandoffSender` doc says "glyph-less status", but `applyBubble` holds the icon through
  any non-frozen status.
- New: the `MONITOR_BACK` comment says the palette avoids `#121212 / #f0f0f0 (dialogue colours)`.
  The dialogue colours are now `#dcdcdc / #161616` (constants.ts). The palette still avoids them, and
  officeSprites.test.ts guards this, but the comment is wrong.
- New: `officeLayout.ts` claims "Malformed data throws at load", but only the grid size and the
  furniture sprite keys are validated (see IN-06).
**Fix:** Reword each comment to match the current behaviour.

### IN-02: (carried) A same-sender supersede clears the previous receiver's accepted line

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:138-141, 176-181`
**Fix:** Skip the `acceptedText` clear when a same-sender supersede retires a record that is in
RETURNING_TO_DESK. This is cosmetic.

### IN-03: (carried) A re-route mid-step snaps the character back to the previous tile centre

**File:** `packages/pixel-office/src/engine/characters.ts:179-189`
**Issue:** 05-27 adds one more way to trigger it: `interactionTileFor → null` makes the sender target
its own current tile while it is mid-step, so the next update snaps it back to that tile's centre.
**Fix:** Accept this as cosmetic, or re-path from `path[0]` when `moveProgress > 0`.

### IN-04: (carried) `identityHueFor` is documented as "Pure" but reads the `characters` map

**File:** `packages/pixel-office/src/index.ts:77`
**Fix:** Reword it as "deterministic given the seated set; no Math.random/Date.now".

### IN-05: Harness: the interaction-tile mirror and walk-home deadline are approximations, and the screenshot guard has an edge case

**File:** `scripts/verify-pixel-office-live.mjs:98-108, 514-517, 51-54`
**Issue:**
- `interactionTile` claims to mirror `interactionTileFor`, but it ignores agents' current tiles,
  other live targets and BFS reachability. The shipped two-agent scenario happens to agree with it,
  but the "must change with it" contract is not enforced.
- `walkHomeMs` adds a fixed "+2 tiles" detour. A BFS route between seat rows through the column-4/8/12/16
  gaps can be longer than Manhattan + 2, which would give a false WR-10 timeout if the SENDER or
  RECEIVER slots change.
- The `SHOTS_DIR` guard treats any relative path that starts with `".."` as outside the repo, so an
  in-repo directory named `..shots` passes.
**Fix:** Derive the expected tile and the walk distance from the page itself, or reuse the
engine's `findPath` over the layout JSON. For the guard, use
`rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)`.

### IN-06: `office-layout.json` is only partly validated at load

**File:** `packages/pixel-office/src/layout/officeLayout.ts:34-39, 53-78`
**Issue:** Any character other than `W` becomes floor, so a typo is silently walkable. Seats,
standing spots and furniture footprints are not checked for being in bounds, on floor, distinct, or
unblocked by furniture. The shipped data is correct, and index.test.ts checks home connectivity,
but a bad edit fails far from its cause.
**Fix:** Throw on any tile character other than `W` or `.`, and check each home with
`isWalkable(col, row, OFFICE_TILE_MAP, FURNITURE_BLOCKED_TILES)` plus a uniqueness check.

### IN-07: The decode script's `crop` and `tightRect` have no bounds check

**File:** `packages/pixel-office/scripts/decode-metrocity-interior.mjs:67-88`
**Issue:** A rect that runs past the sheet's width is read from the next pixel row with no error,
and one past its height reads `undefined` and throws inside `toString`. All current rects fit their
sheets (verified: for example, cabinet [1320,0,48,64] sits in a 3072x64 sheet).
**Fix:** `if (x < 0 || y < 0 || x + w > png.width || y + h > png.height) throw new Error(`${key}: rect ${rect} outside ${png.width}x${png.height}`);`

---

_Reviewed: 2026-09-22T22:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

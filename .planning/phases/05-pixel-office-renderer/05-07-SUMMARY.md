---
phase: 05-pixel-office-renderer
plan: 07
subsystem: ui
tags: [canvas, sprites, pixel-art, rendering, typescript, vitest]

requires:
  - phase: 05-pixel-office-renderer (05-02)
    provides: STATUS_MAP's bubbleType assignment + the 9 existing bubble/badge JSON icon assets
  - phase: 05-pixel-office-renderer (05-04)
    provides: handoff-choreography.ts's bubbleType = "handoff-task" FSM step
  - phase: 05-pixel-office-renderer (05-06)
    provides: real MetroCity pixel data in getCharacterSprites() + resolveJsonModule in tsconfig
provides:
  - "3 previously-nonexistent icon assets: bubble-permission.json, bubble-waiting.json, bubble-handoff-task.json"
  - "bubbleSprites.ts — exhaustive Record<BubbleType, SpriteData> + resolveBubbleSprite()"
  - "engine/renderer.ts bubble/badge overlay draw pass, z-attached to each character's own drawable"
  - "BUBBLE_ICON_GAP_PX rendering constant"
affects: [06-ceo-dashboard, 07-visibility-overlay, phase-05-verification]

actuals:
  tokens: 5904
  tasks: 2
  commits: 4

plan_head_before: 7bfae6e2a20c3e6eb55ea9e30fa731af1745b24b

tech-stack:
  added: []
  patterns:
    - "palette+pixels JSON asset -> flat hex SpriteData resolution via a private resolvePaletteSprite() helper"
    - "Overlay glyphs drawn inside the owning character's own z-sorted drawable closure, never as a separate z entry"

key-files:
  created:
    - packages/pixel-office/src/sprites/bubble-permission.json
    - packages/pixel-office/src/sprites/bubble-waiting.json
    - packages/pixel-office/src/sprites/bubble-handoff-task.json
    - packages/pixel-office/src/sprites/bubbleSprites.ts
    - packages/pixel-office/src/sprites/bubbleSprites.test.ts
    - packages/pixel-office/src/engine/renderer.test.ts
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/constants.ts

key-decisions:
  - "bubble-waiting.json is an hourglass, not the fork's original checkmark concept — bubble-completed.json already owns the checkmark silhouette and OFFICE-03 forbids one glyph being another's recolour"
  - "bubble-permission.json is a bold amber question mark rather than the plan's alternative three-dots-in-a-bubble — badge-discussing.json already owns the rectangular-bubble-with-three-dots silhouette"
  - "The bubble draws inside the character's existing {zY, draw} closure rather than as its own z-sorted entry, so an overlay can never sort behind a character that should be in front of it"
  - "resolvePaletteSprite falls back to transparent for an unknown palette key instead of throwing — a malformed asset loses a pixel, never takes down the render loop"
  - "The bubble-position test uses a control render (bubbleType null) to isolate the base sprite's extent; a colour partition cannot, because bubble-blocked shares #000000/#ffffff with the character sprite"

patterns-established:
  - "Distinct-silhouette enforcement as a mechanical test: compare non-empty-cell masks across all glyphs, not hex values"
  - "Canvas draw proof via a plain object recording fillRect + the fillStyle in effect, cast to CanvasRenderingContext2D at the call site"

requirements-completed: [OFFICE-01, OFFICE-03, HANDOFF-01]

coverage:
  - id: D1
    description: "All 12 BubbleType union members resolve to a real 13x11 SpriteData grid via resolveBubbleSprite"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#has a defined SpriteData entry for every one of the 12 BubbleType members"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#has no keys beyond the 12 BubbleType members"
        status: pass
    human_judgment: false
  - id: D2
    description: "The 3 newly authored icon assets (permission, waiting, handoff-task) are valid 13x11 palette+pixels JSON"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#%s parses as valid JSON with a palette object and a 13x11 pixels grid"
        status: pass
    human_judgment: false
  - id: D3
    description: "No two of the 12 glyphs share a non-empty-cell pattern — colour is never the only signal"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#gives all 12 glyphs a pixel pattern no other glyph repeats (never a recolour)"
        status: pass
    human_judgment: false
  - id: D4
    description: "renderScene genuinely paints a non-null bubbleType's glyph to canvas, above the character and never for a null bubbleType"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#paints a blocked character's bubble glyph with bubble-blocked's own palette colour"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#paints nothing from any bubble palette when bubbleType is null"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#draws the bubble strictly above the character's own base sprite"
        status: pass
    human_judgment: false
  - id: D5
    description: "The handoff FSM's task icon is visible on screen during a handoff (HANDOFF-01's 'a task icon appearing')"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#centers the bubble horizontally over the character"
        status: pass
    human_judgment: true
    rationale: "Unit tests prove the handoff-task glyph resolves and paints at the right coordinates, but whether the icon reads as 'a task being carried' at a glance during a live handoff is a visual judgment no assertion covers — 05-VERIFICATION.md's Truth 2 is an at-a-glance claim."

duration: 12min
completed: 2026-09-21
status: complete
---

# Phase 05 Plan 07: Bubble/Badge Icon Overlay Rendering Summary

**engine/renderer.ts now actually paints each character's status icon above its sprite, backed by a 12-member BUBBLE_SPRITES table whose 3 previously-missing assets (permission, waiting, handoff-task) were authored here**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-21T15:48Z
- **Completed:** 2026-09-21T16:00Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- Closed 05-VERIFICATION.md's Truth 2 render gap: `Character.bubbleType` has been correctly computed since 05-02 but nothing in `renderer.ts` ever read it. It does now — a blocked or waiting agent is visually distinguishable on canvas, not just in the data layer.
- Authored the 3 icon assets that had been referenced-but-nonexistent: `bubble-permission.json` (amber question mark, `waiting_for_ceo`) and `bubble-waiting.json` (blue hourglass, `waiting_for_agent`) — 05-02-SUMMARY.md's own disclosed gap — plus `bubble-handoff-task.json` (violet folded-corner document), which `handoff-choreography.ts` has set as a `bubbleType` since 05-04 with no backing asset at all.
- `bubbleSprites.ts` gives all 12 `BubbleType` members an exhaustive `Record`-typed resolver, making a missing glyph a compile-time impossibility (same pattern as `status-mapping.ts`'s `STATUS_MAP`).
- OFFICE-03's "colour is never the only signal" prohibition is now mechanically enforced: a test compares all 12 glyphs' non-empty-cell masks and fails if any two match.
- `renderer.ts` gained its first test file, proving the draw actually reaches canvas via a recording mock context rather than asserting on computed state.

## Task Commits

1. **Task 1: 3 missing bubble icon assets + exhaustive resolver** — `a2e1c71` (test, RED) → `9df473a` (feat, GREEN)
2. **Task 2: bubble/badge overlay draw pass in engine/renderer.ts** — `232ca88` (test, RED) → `b24dcc3` (feat, GREEN)

## Files Created/Modified

- `packages/pixel-office/src/sprites/bubble-permission.json` — amber (`#ffb703`) question-mark glyph for `waiting_for_ceo`
- `packages/pixel-office/src/sprites/bubble-waiting.json` — blue (`#4361ee`) hourglass for `waiting_for_agent`
- `packages/pixel-office/src/sprites/bubble-handoff-task.json` — violet (`#7209b7`) folded-corner document for the handoff FSM's task icon
- `packages/pixel-office/src/sprites/bubbleSprites.ts` — `BUBBLE_SPRITES` (12 entries) + `resolveBubbleSprite`
- `packages/pixel-office/src/sprites/bubbleSprites.test.ts` — exhaustiveness, asset shape, distinct-silhouette, palette-resolution tests
- `packages/pixel-office/src/engine/renderer.ts` — bubble draw pass inside each character's z-sorted draw closure
- `packages/pixel-office/src/engine/renderer.test.ts` — canvas draw proof via a recording mock context
- `packages/pixel-office/src/constants.ts` — `BUBBLE_ICON_GAP_PX = 2`

## Decisions Made

- **Hourglass, not a checkmark, for `waiting`.** The fork's original bubble-waiting concept was a checkmark, but `bubble-completed.json` (05-02) already claimed that silhouette, and OFFICE-03 forbids one glyph being another's recolour. The plan explicitly called this out; followed as written.
- **Question mark, not three-dots-in-a-bubble, for `permission`.** The plan offered both. `badge-discussing.json` already owns the rectangular-bubble-with-three-dots silhouette, so the dots option would have failed the distinct-silhouette test it was authored alongside.
- **Bubble drawn inside the character's own `{zY, draw}` closure**, not as a separate z-sort entry — an overlay can then never sort behind a character that should be in front of it.
- **`resolvePaletteSprite` falls back to transparent** for an unknown palette key rather than throwing. A malformed asset should lose a pixel, never take down a per-frame render loop.
- **`tsconfig.json` was left untouched** — 05-06 already added `resolveJsonModule: true`, exactly the conflict the plan warned about. Verified on disk before writing; no second addition made.

## Deviations from Plan

None affecting scope or behavior. One in-flight test correction during Task 2's GREEN phase, documented below because it changed a test the RED commit had already recorded.

**1. [Rule 1 - Bug] Bubble-position test misclassified the bubble's own outline as base-sprite pixels**

- **Found during:** Task 2 (GREEN verification)
- **Issue:** The test partitioned recorded `fillRect` calls into bubble vs. base by colour. `bubble-blocked.json` shares `#000000` and `#ffffff` with the character sprite, so the bubble's black outline landed in the "base" bucket and the assertion compared the bubble against itself (expected 20 ≤ 9). The implementation was correct — the test was.
- **Fix:** Replaced the colour partition with a control render (the same character with `bubbleType: null`), which isolates the base sprite's true extent, then diffed by painted coordinate.
- **Files modified:** `packages/pixel-office/src/engine/renderer.test.ts`
- **Verification:** All 4 renderer tests pass; the assertion still genuinely fails if the bubble is drawn at or below the sprite top.
- **Committed in:** `b24dcc3` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 test bug)
**Impact on plan:** No scope change. The corrected test is strictly stronger than the original — it no longer depends on glyph colours being disjoint from character colours.

## Issues Encountered

- `npx tsc --noEmit` on this package still reports the repo-wide pre-existing `TS2835` extensionless-relative-import errors in `event-schema/src/index.ts` and in several pre-existing test files (already logged as a Phase 5 blocker in STATE.md). **None of the files this plan touched produce a type error** — verified by grepping the tsc output for `renderer.ts`, `bubbleSprites`, and `constants.ts` (zero hits). Out of scope per the deviation scope boundary; not fixed here.

## Known Stubs

None. All 12 `BubbleType` members resolve to a real authored asset; no placeholder, empty, or TODO glyph remains.

## Threat Flags

None. The new draw pass reads only `Character.bubbleType` (a closed TypeScript union set exclusively by `STATUS_MAP` and `handoff-choreography.ts`'s literal) and draws `bubbleType`'s glyph — never `bubbleText`, so no text-rendering surface was added. Both registered threats (T-05-24, T-05-25) remain correctly dispositioned `accept`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The two rendering gaps 05-VERIFICATION.md called out (05-06's sprite pixel data, 05-07's bubble overlay) are both now closed. OFFICE-03's at-a-glance distinction and HANDOFF-01's task-icon-appearing step are demonstrable rather than data-only.
- **Still outstanding for a live demo:** no producer of `agent.online` exists anywhere in this codebase (flagged since 05-01), so the phase's literal live-browser demo remains unreproducible until an agent-identity event producer ships.
- Remaining visual polish deliberately out of scope: `bubbleText` tooltip/dialogue rendering (05-UI-SPEC.md Typography defers it) and any bubble tail/frame chrome.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*

## Self-Check: PASSED

All 9 claimed files exist on disk; all 4 claimed commit hashes resolve in git history.

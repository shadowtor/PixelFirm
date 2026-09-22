---
phase: 05-pixel-office-renderer
plan: 32
subsystem: ui
tags: [canvas, pixel-art, sprites, renderer, vitest, playwright, accessibility]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer
    provides: "05-24/05-25's office layout, SEATS/STANDING_SPOTS, isOwnSeat and CHARACTER_SITTING_OFFSET_PX"
  - phase: 05-pixel-office-renderer
    provides: "05-30's head-anchored glyph placement (resolveBubbleY off the drawn frame's first opaque row)"
  - phase: 05-pixel-office-renderer
    provides: "05-23's frozen-glyph contrast/outline/shape-separation contract in bubbleSprites.test.ts"
  - phase: 05-pixel-office-renderer
    provides: "05-31's live-proof harness at its current viewport and TRUTH ordering"
provides:
  - "Any character resting (not walking) on its own layout seat is drawn seated, whatever its status — the desk hides its lower body"
  - "Only off-seat characters stand full-body: walkers, handoff senders at an interaction tile, and agents on standing spots"
  - "bubble-waiting.json redrawn as a true hourglass: full-width 3-row caps, triangular bulbs, a 3 px-ink / 1 px-fill waist, sand in the lower bulb"
  - "A 1x silhouette test for the hourglass, so the glyph is identifiable by shape alone (OFFICE-03 / D-03)"
  - "Live TRUTH 4 measured against the seated head top"
affects: [ceo-dashboard, stream-overlay, obs-capture]

actuals:
  tokens: 40814
  tasks: 3
  commits: 5
plan_head_before: cdb4241643b0e8fa5b74dadb6958717d96c9d6e4

tech-stack:
  added: []
  patterns:
    - "Visible-body-rows assertion: composite the scene twice (with and without the character) and count rows where the final colour at a cell differs — measures occlusion, not sprite position"
    - "Pose-independent geometry assertion: derive drawY as painted-top minus the DRAWN frame's own first ink row, so poses with different ink bounds are comparable"
    - "Silhouette tests assert shape features (cap width, strict monotonic ink widths, waist fill count) derived from the resolved sprite, never colour"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - packages/pixel-office/src/sprites/bubble-waiting.json
    - packages/pixel-office/src/sprites/bubbleSprites.test.ts
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "The sitting rule is expressed negatively (NOT walking) rather than as a list of resting states, so a future CharacterState cannot silently fall back to standing at its own desk"
  - "renderer.test.ts's spriteBox and ownerDrawY now share one sittingOffsetOf helper instead of each restating the rule — the CR-02 disjointness guard was testing a box 6 px too high once seating became status-independent"
  - "Visible body rows are measured by compositing difference, not by sprite geometry: the desk is drawn after the seated agent, so only a composite can prove the rows are gone rather than shifted"
  - "The hourglass keeps its exact palette (#000000 / #4361ee / #a9bcff) so the live harness's derived colour sets and every existing contrast test are unaffected by the redraw"
  - "The waist is 3 px of ink with 1 fill cell rather than 1 px of ink: a 1 px-wide black column would be an outline cell with no interior, and the pinch still reads at 1x"

patterns-established:
  - "Occlusion-based legibility test: assert a pose difference in SURVIVING pixels, not in draw coordinates"
  - "Glyph silhouette contract: a glyph whose identity depends on a specific shape feature carries a 1x test for that feature, beyond being merely distinct from the other eleven"

requirements-completed: []  # OFFICE-01/OFFICE-03 held by the shared-ID gate — siblings 05-33..05-35 also declare them and have no SUMMARY yet

coverage:
  - id: D1
    description: "Any character resting on its own layout seat is drawn sunk by CHARACTER_SITTING_OFFSET_PX whatever its status (idle, blocked, waiting_for_agent, waiting_for_ceo, failed, completed, coding), keeping the frame its pose dictates"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#a %s agent resting on its own seat is drawn seated, keeping its pose's own frame (G-05-P3, D-01) (7 cases via it.each)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only an off-seat character stands full-body: a walker on its own seat tile, a character on a standing spot, and a character resting on someone else's seat are all un-lowered"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#only an off-seat character stands: walking, on a standing spot, or away from home (G-05-P3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A resting agent at its own desk is visually distinct from one standing nearby: it shows at least 8 fewer visible body rows in the composited frame (measured 11 — 17 seated vs 28 standing)"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#a resting agent at its own desk shows at least 8 fewer visible body rows than the same agent standing in the aisle (G-05-P3)"
        status: pass
      - kind: automated_ui
        ref: "scripts/verify-pixel-office-live.mjs#handoff.png — seated blocked agent and seated receiver vs the full-body standing sender on the same row"
        status: pass
    human_judgment: true
    rationale: "G-05-P3 was raised by the CEO from a native-scale capture as a legibility judgment ('at the desk' vs 'standing nearby'). Automation proves the row-count difference and the three review screenshots were inspected and clearly show it, but whether the distinction now reads at a glance on their own screen is theirs to confirm."
  - id: D4
    description: "The glyph stays head-anchored to the seated frame: exactly BUBBLE_ICON_GAP_PX above the first opaque row in every pose, and on the floor for every seat and standing spot"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#leaves exactly BUBBLE_ICON_GAP_PX of air between every glyph's ink and the head, in every pose, at zoom 1 and 3"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#keeps every glyph on the floor for every seat and standing spot, standing and seated"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#never paints a later-row agent's blocked glyph inside the sprite box of the agent seated in front of it (glyph y 100..112, boxes y 46..78 / 110..142)"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs#TRUTH 4 — 1088 glyph px at y 101..110.75, gap 1.25 above head top 113, below the front agent (ends 78)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The waiting_for_agent glyph is a true hourglass at 1x — full-width 3-row caps, strictly triangular bulbs (9/7/5 down to 3 and back up 5/7/9), a single 3 px-ink / 1 px-fill waist, sand in the lower bulb — while staying 11x13 with a closed near-black outline"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#1x hourglass silhouette (G-05-P5) (4 cases: caps, waist, triangular bulbs, sand)"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#G-05-2 frozen-state glyph contrast (closed outline, interior >= 3:1, floor >= 3:1, MetroCity legibility, >= 20-cell pairwise separation — measured 63 vs blocked, 58 vs permission)"
        status: pass
      - kind: automated_ui
        ref: "scripts/verify-pixel-office-live.mjs#handoff.png — the receiver's hourglass on the live canvas"
        status: pass
    human_judgment: true
    rationale: "G-05-P5 is a native-scale recognisability judgment ('does this read as an hourglass rather than a spool?'). The shape features are asserted deterministically and the live screenshot was inspected, but only the CEO can confirm it reads for them at 1x on a compressed stream."
  - id: D6
    description: "05-UI-SPEC.md records both rules: the hourglass asset row plus its 1x silhouette test in the asset format contract, and the seated-whenever-resting rule in the Office layout paragraph"
    verification:
      - kind: other
        ref: "grep -n \"05-32\" .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md (3 matches: asset inventory row 54, asset format contract line 77, Office layout line 102)"
        status: pass
    human_judgment: false

duration: 12 min
completed: 2026-09-22
status: complete
---

# Phase 05 Plan 32: Seated-at-Desk Rendering and the Hourglass Glyph Summary

**Every agent resting at its own desk is now drawn seated behind it whatever its status — so a blocked agent at its desk no longer stands in exactly the pose a handoff sender uses beside it — and the waiting_for_agent glyph is a true hourglass with a single-pixel waist instead of a spool that leaned on being blue.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-22T22:52:57Z
- **Completed:** 2026-09-22T23:05:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `renderScene`'s sitting condition went from `state === TYPE && isOwnSeat` to `state !== WALK && isOwnSeat`: one condition, expressed negatively so a future `CharacterState` cannot silently fall back to standing at its own desk. Only the vertical offset changed — frames still come from the pose (D-01), `STATUS_MAP`, the FSM and the frozen flag (D-03) are untouched.
- Seven statuses are now pinned seated through the real `upsertCharacterFromAgent` path (so the genuine `STATUS_MAP` pose, frozen flag and glyph are in play), each asserting the drawn frame is the one the pose dictates and that the same character with its seat moved elsewhere is *not* lowered.
- The legibility claim is measured, not asserted geometrically: a resting agent at its desk shows **17** visible body rows against **28** for the same agent standing in the open aisle — an 11-row difference, measured by compositing difference with furniture on (before this plan it was 23 vs 28, a 5-row difference that failed the >= 8 bar).
- `bubble-waiting.json` redrawn with ink widths 11,11,11,9,7,5,**3**,5,7,9,11,11,11 — full-width caps, strictly triangular bulbs and a single-pixel-fill waist, with the sand pooled in the lower bulb. Palette untouched, so every existing contrast test and the live harness's derived colour sets are unaffected; the mask differs from `blocked` in **63** cells and `permission` in **58** (plan predicted exactly these).
- Live TRUTH 4 now measures against the seated head (`spriteTopY + CHARACTER_SITTING_OFFSET_PX + headRow`) and passes with a 1.25 px gap, on the floor, strictly below the front agent — every original assertion kept.

## Task Commits

1. **Task 1 (RED): failing tests for seated-whenever-resting** — `9e53ee3` (test)
2. **Task 1 (GREEN): the renderer sitting condition** — `48f804c` (feat)
3. **Task 2 (RED): failing 1x hourglass silhouette test** — `f2801c9` (test)
4. **Task 2 (GREEN): the redrawn hourglass asset** — `7a242dc` (feat)
5. **Task 3: live TRUTH 4 on the seated head + UI-SPEC rows** — `af13377` (test)

_No REFACTOR commit for either TDD task: Task 1's GREEN diff is a single boolean condition and its comment, Task 2's is a static asset grid. There was nothing to clean up (per `tdd.md`, REFACTOR commits only on change)._

## Files Created/Modified

- `packages/pixel-office/src/engine/renderer.ts` — the sitting condition and its rewritten rationale comment
- `packages/pixel-office/src/engine/renderer.test.ts` — one shared `sittingOffsetOf` helper feeding `spriteBox`/`ownerDrawY`, the renamed seated describe with 9 new cases, and the CR-02 composite's restated geometry
- `packages/pixel-office/src/sprites/bubble-waiting.json` — the hourglass grid (palette unchanged)
- `packages/pixel-office/src/sprites/bubbleSprites.test.ts` — the "1x hourglass silhouette (G-05-P5)" describe, 4 cases
- `scripts/verify-pixel-office-live.mjs` — TRUTH 4's `headTop` and the `spriteTopY` contract note
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — asset inventory row, asset-format-contract bullet, Office layout rule

## Decisions Made

- **The rule is negative, not an allow-list.** `state !== WALK && isOwnSeat(ch)` rather than enumerating IDLE/TYPE/etc. A new pose added later defaults to *seated at its own desk*, which is the safe default — a new resting pose that stood at its desk would silently reopen G-05-P3, whereas a new moving pose that sits is an obvious visual bug caught at first sight.
- **`spriteBox` and `ownerDrawY` now share one helper.** They each restated the sitting rule independently. Once seating became status-independent, `spriteBox` was returning a box 6 px too high for every resting seated agent — which would have weakened the CR-02 disjointness guard by exactly the rows most at risk. Both now call `sittingOffsetOf`.
- **Visible body rows are measured by compositing difference.** Comparing sprite boxes proves only that the character moved. The desk is drawn *after* the seated agent (desk `zY` 96 > agent `zY` 80.5), so the only instrument that can show the rows are *gone* rather than *shifted* is a two-render diff of final per-cell colour with furniture on.
- **The waist is 3 px of ink with 1 fill cell, not 1 px of ink.** A 1 px-wide black column has no interior, so the closed-outline/interior-contrast rule (05-23) would have nothing to check there; 3 px ink with a single `#4361ee` fill cell reads as a pinch at 1x and keeps the contract intact. The cap-to-bulb joins carry no internal black line for the same reason — an enclosed black cell is an interior cell at 1:1 contrast with the outline and would fail.
- **The hourglass palette is frozen.** Keeping `#000000` / `#4361ee` / `#a9bcff` means the live harness's `collectColors`-derived sets, the MetroCity floor legibility test and the floor-contrast test all continue to measure the same colours. A redraw that also recoloured would have made a green suite ambiguous about which change fixed what.

## Deviations from Plan

None — plan executed as written.

One recorded difference in *evidence handling*, not scope: `gsd check tdd-red-evidence` could not certify RED on this repo. Its record parser targets `node --test`'s TAP summary lines, which Vitest never emits, so it returns `INVALID_RED (zero_tests_discovered)` on a genuinely red run. This is the standing tooling gap already flagged in STATE.md for 01-03, 03-02 (twice) and 05-31, and the orchestrator's dispatch note pre-authorised manual verification. RED was verified manually for both TDD tasks (evidence below).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None.

## TDD Gate Compliance

| Task | Gate | Commit | Status |
|------|------|--------|--------|
| 1 (tracer) | RED | `9e53ee3` `test(05-32)` | Pass — 8 named target tests failed on assertions, 153 unrelated green |
| 1 (tracer) | GREEN | `48f804c` `feat(05-32)` | Pass — 161/161 |
| 1 (tracer) | REFACTOR | — | Not needed; no commit made |
| 2 | RED | `f2801c9` `test(05-32)` | Pass — 3 named target tests failed on assertions, 162 unrelated green |
| 2 | GREEN | `7a242dc` `feat(05-32)` | Pass — 165/165 |
| 2 | REFACTOR | — | Not needed; no commit made |

**Manual RED evidence, Task 1** (target tests failing on assertions about the planned behaviour, ruling out syntax, discovery and fixture failures):

```
7x "a <status> agent resting on its own seat is drawn seated" — expected 40 to be 46
   (drawY of an IDLE/BLOCKED/WAITING_*/FAILED/COMPLETED agent on SEATS[0])
1x "a resting agent ... at least 8 fewer visible body rows"    — seated shows 23 body
   rows, standing shows 28: expected 5 to be >= 8
1x "never paints a later-row agent's blocked glyph ..."        — expected 94 to be 100
Tests  8 failed | 153 passed (161)
```

The `coding` case passed at RED, correctly: `CODING` maps to the `TYPE` pose, which already sank under 05-25's rule. It is in the suite as a regression pin, not as a RED target.

**Manual RED evidence, Task 2:**

```
"has heavy caps ..."          — row 0 is not full-width ink: expected false to be true
"pinches to a single-pixel-fill waist ..." — expected 5 to be 3
"has triangular bulbs ..."    — row 6 must be wider than row 5: expected 5 to be > 5
Tests  3 failed | 162 passed (165)
```

The "sand in the lower bulb" case passed on the old spool too (10 below vs 5 above) — kept as a pin rather than dropped, since it is part of the G-05-P5 shape contract.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter pixel-office test` | 165/165 passed (8 files) |
| `pnpm --filter web test` | 23/23 passed (3 files) — the asset redraw broke nothing downstream |
| `grep -n "CharacterState.WALK && isOwnSeat" .../renderer.ts` | line 289, match |
| `grep -n "05-32" .../05-UI-SPEC.md` | 3 matches (asset row, format contract, Office layout) |
| `node --check scripts/verify-pixel-office-live.mjs` | clean |
| `node scripts/verify-pixel-office-live.mjs` | **LIVE PROOF: PASS** — all eight truths |

Live TRUTH 4 output:

```
blocked glyph in col 1 (x 16..32): 1088 px, y 101..110.75, head top 113, gap 1.25
  (front sprite ends at 78)
TRUTH 4 PASS — 1088 blocked-glyph px at y 101..110.75, 1.25 px above
  live-proof-seat-05's head (top 113), on the floor, below live-proof-sender (ends 78)
```

**Screenshot review** (written to a scratch directory outside the repo via `PIXEL_OFFICE_SHOTS`, all three inspected):

- `states.png` — both agents (one idle, one blocked) sit behind their desks showing head and shoulders only; the blocked agent's stop-sign glyph sits directly on its head. Before this plan both stood full-body with their legs in front of the desk.
- `handoff.png` — **the G-05-P3 proof in one frame.** Three agents on the same seat row: the blocked sender's neighbour (col 1) and the receiver (col 5) are both seated behind their desks, head and shoulders only, while the handoff sender waiting on the aisle interaction tile (col 4) stands full-body with legs and feet clearly visible below the desk line. "At the desk" and "standing nearby" are now unmistakably different at a glance. The receiver's hourglass glyph reads as an hourglass — heavy dark-blue caps, bulbs tapering to a visible pinch, sand filling the lower bulb — with no reliance on its colour.
- `cohort.png` — nine seated agents across both pod rows, every one showing head and shoulders behind its desk, with the two blocked agents' glyphs on their heads and clear of the agent in front.

## Issues Encountered

- `gsd check tdd-red-evidence` cannot certify RED on this Vitest repo (recurring tooling gap, see Deviations). Resolved by manual RED verification, pre-authorised by the orchestrator's dispatch note and consistent with 01-03 / 03-02 / 05-31.
- `pnpm turbo test` still bails on `packages/orchestration-adapter`'s empty suite (known repo condition, flagged by the orchestrator as not this plan's to fix). Whole-workspace signal was taken per-package instead: `pixel-office` and `web` both green.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **G-05-P3 and G-05-P5 are closed** and proven both in unit tests and on the live composited canvas.
- **OFFICE-01 and OFFICE-03 stay held open by the shared-ID gate**: sibling gap-closure plans 05-33..05-35 also declare them and have no SUMMARY yet. They flip when the last declaring plan finishes.
- Nothing in the event path, layout data, `STATUS_MAP` or the pose FSM was touched, so the remaining gap-closure plans are unaffected. `05-33` (G-05-P4, the handoff read path) and the interaction-slot gap G-05-P2 both remain open and independent of this change.
- One knock-on worth knowing when planning G-05-P2: with resting agents seated, a *standing* sender beside a seated receiver is now the tallest thing on its row, which makes the shoulder-to-shoulder spacing defect G-05-P2 describes more visually prominent, not less.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-22*

## Self-Check: PASSED

All six modified files exist on disk; all five task commits (`9e53ee3`, `48f804c`, `f2801c9`, `7a242dc`, `af13377`) are present in git history. Measured commit count from the plan ledger (`cdb4241..HEAD`) is 5, matching the `actuals.commits` frontmatter.

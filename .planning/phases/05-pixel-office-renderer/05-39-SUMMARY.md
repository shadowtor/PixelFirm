---
phase: 05-pixel-office-renderer
plan: 39
subsystem: ui
tags: [pixel-art, sprites, wcag-contrast, grayscale-legibility, vitest, tdd]

# Dependency graph
requires:
  - phase: 05-38
    provides: "Glyph head gap at 3 px and the seated sink offset; the constants this plan's band counts sit above, untouched here"
  - phase: 05-32
    provides: "The 1x hourglass SILHOUETTE guards (full-width caps, triangular bulbs, single-pixel waist, sand in the lower bulb) that this repaint had to leave byte-identical"
provides:
  - "bubble-waiting.json repainted so glass and sand separate by luminance, not hue"
  - "A four-case grayscale band test that goes red if either half of the repaint is reverted"
  - "Glass fill #c8d4ff at 3.423:1 against the sand — clear of the WCAG 3:1 floor"
affects: [05-40, pixel-office-renderer, stream-legibility, OFFICE-03]

actuals:
  tokens: 1123
  tasks: 1
  commits: 2
plan_head_before: 2e2ba6c999709f32038c0ff1882f4fdc1cb57f4f

tech-stack:
  added: []
  patterns:
    - "Grayscale-first glyph legibility: assert the luminance PROFILE (plate/glass/pinch/sand/plate), not the hue"
    - "Fills derived from the resolved sprite by luminance order, never by hex literal, so tests survive a palette retune"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/sprites/bubble-waiting.json
    - packages/pixel-office/src/sprites/bubbleSprites.test.ts

key-decisions:
  - "Repaint, not redraw: the silhouette was already a correct hourglass, so not one opaque cell moved and all four 05-32 silhouette guards stayed green untouched"
  - "Glass fill raised to #c8d4ff rather than darkening the sand — darkening #4361ee would have cost contrast against the near-black outline, which the G-05-2 frozen-glyph rule also measures"
  - "Both fills are derived by luminance order in the new assertions; no hex literal appears, so a future palette retune cannot silently invalidate the test"

patterns-established:
  - "Luminance-band assertions: count fill cells above/below the derived waist row rather than eyeballing a render"
  - "Revert-proof spot check per half: each of the two changes has its own assertion that goes red alone"

requirements-completed: [OFFICE-03]

coverage:
  - id: D1
    description: "The waiting_for_agent glyph reads as an hourglass by luminance structure alone — dark plate, light upper bulb, pinch, sand-filled lower bulb, dark plate — with no dependence on the glyph being blue"
    requirement: OFFICE-03
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#reads as an hourglass in grayscale (05-39, G-05-1a) > keeps the upper bulb visibly empty: light fill outnumbers sand at least 3 to 1 above the waist"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#reads as an hourglass in grayscale (05-39, G-05-1a) > fills the lower bulb: sand outnumbers light fill below the waist"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#reads as an hourglass in grayscale (05-39, G-05-1a) > caps the profile with solid plates: first and last rows are entirely the darkest colour"
        status: pass
    human_judgment: false
  - id: D2
    description: "The glyph's light fill and its sand fill differ by a WCAG contrast ratio of at least 3:1, so the empty/full split survives desaturation and compressed stream video"
    requirement: OFFICE-03
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/bubbleSprites.test.ts#reads as an hourglass in grayscale (05-39, G-05-1a) > separates glass from sand by luminance alone (>= 3:1, survives desaturation)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The repaint changes zero opaque cells, so every pre-existing silhouette, distinctness and frozen-contrast guard stays green"
    verification:
      - kind: unit
        ref: "pnpm --filter pixel-office test (200 passed, up from the 196 baseline; the four 1x silhouette tests and the G-05-2 frozen-contrast describe unedited)"
        status: pass
      - kind: other
        ref: "opaque-mask diff against 2e2ba6c: identical"
        status: pass
    human_judgment: false
  - id: D4
    description: "At real stream resolution the repainted glyph is identifiable as an hourglass to a viewer, in colour and desaturated"
    verification: []
    human_judgment: true
    rationale: "G-05-1a came from human UAT of a live stream frame. The band and contrast tests prove the luminance structure is present, but whether a viewer reads it as an hourglass at 1x on compressed video is a perceptual judgment no assertion settles. 05-40 runs the live harness last so all four gap closures are reviewed on one set of frames."

# Metrics
duration: 8 min
completed: 2026-09-23
status: complete
---

# Phase 05 Plan 39: Grayscale Hourglass Repaint Summary

**The waiting glyph's upper bulb repainted from sand-blue to #c8d4ff glass, so the empty/full split reads by luminance at 3.42:1 instead of vanishing into one blue mass — zero opaque cells moved.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-23T07:17:40Z
- **Completed:** 2026-09-23T07:25:37Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Closed G-05-1a: the hourglass no longer reads as a blue bowtie. Its top-to-bottom luminance profile is now dark plate / light glass / pinch / sand / dark plate — the shape of a real hourglass in any greyscale, so the state survives a desaturated or heavily compressed stream.
- Raised palette key `"3"` from `#a9bcff` to `#c8d4ff`, taking glass-vs-sand contrast from 2.707:1 (below the WCAG 3:1 floor) to **3.423:1**, while keeping 14.317:1 against the near-black outline.
- Emptied the upper bulb: rows 1 and 2's eighteen interior cells moved from sand to glass, flipping the above-waist ratio from **14 light : 19 sand** to **32 light : 1 sand**.
- Added a four-case grayscale describe that derives both fills by luminance order (no hex literals), so the guard stays honest through a future palette retune.
- Zero regressions: **200 tests passing** in pixel-office (baseline 196), 24 in web, typecheck clean.

## Task Commits

1. **Task 1 — RED: failing grayscale hourglass test** - `118ca8b` (test)
2. **Task 1 — GREEN: repaint glass fill and upper bulb** - `fe93c6f` (feat)

**Plan metadata:** see the `docs(05-39)` commit.

_No REFACTOR commit: the change is one data file and one additive describe — there was nothing to clean up, and tdd.md commits REFACTOR only on change._

## Files Created/Modified

- `packages/pixel-office/src/sprites/bubble-waiting.json` - palette key `"3"` `#a9bcff` → `#c8d4ff`; `pixels[1][1..9]` and `pixels[2][1..9]` `"2"` → `"3"`. 19 lines changed, opaque mask byte-identical.
- `packages/pixel-office/src/sprites/bubbleSprites.test.ts` - new `reads as an hourglass in grayscale (05-39, G-05-1a)` describe, 4 cases, 57 lines added and **zero lines removed** — no existing test was edited.

## Decisions Made

- **Repaint over redraw.** The silhouette was already correct (05-32 proved it with four opacity-only guards). The failure was the FILL, so the fix touched colour only. This is what let all four silhouette tests, the ≥20-differing-cells distinctness rule and the frozen-contrast describe pass with no edit at all.
- **Raise the glass, don't darken the sand.** Both directions open the glass/sand gap, but darkening `#4361ee` would eat into its contrast against the near-black outline, which the G-05-2 frozen-glyph rule measures independently. Raising the light fill moves one number without spending another.
- **Derive fills, never hard-code them.** The new assertions sort the glyph's non-outline colours by luminance and take darker-first, matching how the existing sand test already works. A palette retune re-derives rather than silently passing against a stale literal.

## Deviations from Plan

None - plan executed exactly as written.

The plan's one flagged risk did materialise exactly as predicted and was harmless: the frozen-contrast describe's `mainFill` flipped from `#4361ee` to `#c8d4ff` (36 cells against 31). The "legible on the MetroCity floor" rule still passes unmodified, because the black outline term dominates its `max()` against every floor-tile mean. The rule was not weakened.

The plan's own cell-count arithmetic was one off on that point — it predicted 36 against 33; the actual post-repaint counts are 36 glass, 31 sand, 44 outline. The direction and the conclusion are unaffected.

## Issues Encountered

**`gsd_run check tdd-red-evidence` expects node:test TAP counters; vitest emits none.** The RED gate's parser reads `# tests / # pass / # fail` summary lines, which vitest's `tap-flat` reporter does not produce (it emits the `1..N` plan and `ok`/`not ok` lines only). Resolved without touching the gate: captured the real `tap-flat` output, mechanically counted its own `ok` and `not ok` lines, and appended the three counters in the node:test dialect. No number was invented — every count is derived from the same run's TAP lines. Verdict returned `RED_EVIDENCE_OK`, `reason: target_test_failed`.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `118ca8b` `test(05-39): ...` | Pass — `RED_EVIDENCE_OK`. The two target assertions failed on planned-behavior assertions (`14 light (#a9bcff) vs 19 sand (#4361ee)`, `2.707 >= 3` false); the other 28 tests in the file passed, so this was not a load crash, a zero-discovery run or an unrelated failure. |
| GREEN | `fe93c6f` `feat(05-39): ...` | Pass — 200/200 after the repaint. |
| REFACTOR | — | Not needed; no cleanup existed to make. |

**Revert-proof spot check (plan verification step 3), both halves run independently:**

| Reverted half | Result |
|---|---|
| palette `"3"` → `#a9bcff` | 1 failed / 199 passed — only `separates glass from sand by luminance alone` went red |
| rows 1-2 → `"2"` | 1 failed / 199 passed — only `keeps the upper bulb visibly empty` went red |
| both restored | 200 passed |

Each half is guarded by exactly one assertion, and neither guard fires for the other's revert.

## Verification Results

| Check | Result |
|---|---|
| `pnpm --filter pixel-office test -- --reporter=verbose bubbleSprites` | 30/30 in file, exit 0 |
| `pnpm --filter pixel-office test` | **200 passed** (> 196 required) |
| `pnpm --filter web test` | **24 passed** (>= 24 required) |
| `pnpm --filter web typecheck` | clean |
| Opaque mask vs `2e2ba6c` | identical |
| Hex literals in new assertions | 0 |

The live harness was deliberately **not** run, per the plan's verification note: this change is pure asset data with no geometry consequence, 05-40 runs the harness last so its review frames show all four gaps closed at once, and running it here would contend with 05-38's run for the API and web ports.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-05-1a is closed at the asset level and regression-guarded from both directions.
- Ready for **05-40**, which runs the live harness and should show all four gap closures on one set of review frames. D4 above is the one deliverable still awaiting human eyes — that is the frame review 05-40 produces, not a blocker here.
- No blockers. No stubs, skipped tests or unrun verifications were introduced.

## Self-Check: PASSED

- `packages/pixel-office/src/sprites/bubble-waiting.json` — exists, palette `"3"` = `#c8d4ff`, rows 1-2 each nine `"3"` between two `"1"`.
- `packages/pixel-office/src/sprites/bubbleSprites.test.ts` — exists, new describe present, zero lines removed.
- Commits `118ca8b` and `fe93c6f` both present in `git log`.
- All 8 plan acceptance criteria re-run and passing.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-23*

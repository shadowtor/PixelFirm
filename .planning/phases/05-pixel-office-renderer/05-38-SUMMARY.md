---
phase: 05-pixel-office-renderer
plan: 38
subsystem: ui
tags: [canvas, pixel-art, renderer, spacing-constants, playwright, vitest]

# Dependency graph
requires:
  - phase: 05-30
    provides: head-anchored glyph placement (resolveBubbleY reads BUBBLE_ICON_GAP_PX per frame)
  - phase: 05-32
    provides: a character resting on its own seat is drawn seated, sunk by CHARACTER_SITTING_OFFSET_PX
  - phase: 05-33
    provides: resolveDialogueBox's "above" candidate, which clears the glyph band over the same gap
provides:
  - "BUBBLE_ICON_GAP_PX raised 1 -> 3: the status glyph is visibly detached from its owner's head at stream scale"
  - "CHARACTER_SITTING_OFFSET_PX raised 6 -> 10: a seated agent reads as head-and-shoulders against a standing sender's full body"
  - "A two-sided live gap bound in TRUTH 4, replacing the one-sided ceiling that stayed green when the glyph collapsed back onto the head"
  - "A head-visibility floor (seatedRows >= 10) that goes red if a future over-sink buries the head instead of the body"
affects: [05-39, 05-40, phase-06-ceo-dashboard, phase-07-overlay]

actuals:
  tokens: 42108
  tasks: 2
  commits: 3  # MEASURED: git rev-list --count 81c8ba9..HEAD — 2 task commits + this SUMMARY's own docs commit
plan_head_before: 81c8ba9d5e63e52a4536a6fbbb28ff51d1c70705

tech-stack:
  added: []
  patterns:
    - "A spacing guard is two-sided: a literal pin on the constant (goes red on a revert) plus a derived assertion over the same constant (proves the value buys real air)"
    - "Harness expectations are expressions over readNumberConst reads, never literals — a constant change moves the assertion with it instead of silently invalidating it"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/constants.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "The live TRUTH 4 two-sided bound guards renderer-vs-constant drift, NOT a constant revert — the harness reads the same constant the renderer does, so both sides move together; the unit literal pins are what catch a revert"
  - "The plan's PIXEL_OFFICE_SHOTS=.gsd/uat-shots-05-38 is inside the repo and the harness refuses it by design (05-21, T-05-21-02); review frames were written to the session scratchpad instead rather than weakening that guard"
  - "TAIL_REACH_PX derived as 13 + BUBBLE_ICON_GAP_PX + DIALOGUE_TAIL_PX + 2 (= 20), retiring the literal 18 that IN-05 had already flagged as drift-prone"

patterns-established:
  - "Two-sided spatial guards: every widening carries the bound that catches the over-correction (gap floor AND ceiling; body-sink delta AND head-visibility floor)"

requirements-completed: [OFFICE-03]

coverage:
  - id: D1
    description: "A status glyph leaves 3 unzoomed px (12 device px at display scale 4) of air between its lowest ink row and its owner's visible head, in every pose, at zoom 1 and 3"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#glyph sits on its owner's head (05-30, G-05-1c) > leaves exactly BUBBLE_ICON_GAP_PX of air between every glyph's ink and the head, in every pose, at zoom 1 and 3"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#resolveBubbleY — owner-bound glyph placement > puts the glyph's lowest ink row BUBBLE_ICON_GAP_PX (3) above the owner's first opaque row when there is headroom"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs TRUTH 4 — measured gap 3.25 device px, head top 117, need 3..4"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every glyph stays on the floor (top y >= 16 unzoomed) for every seat and every standing spot, seated and standing, at the raised gap"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#glyph sits on its owner's head (05-30, G-05-1c) > keeps every glyph on the floor for every seat and standing spot, standing and seated"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs TRUTH 4 — blocked glyph top y 103 >= TILE_SIZE 16"
        status: pass
    human_judgment: false
  - id: D3
    description: "A resting agent at its own desk shows at least 12 fewer visible body rows than the same agent standing in the aisle (measured: 13 seated vs 28 standing, delta 15)"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#seated whenever resting on the own seat (05-25, G-05-P3) > a resting agent at its own desk shows at least 12 fewer visible body rows than the same agent standing in the aisle, and still shows its head"
        status: pass
    human_judgment: false
  - id: D4
    description: "A seated agent's head survives the composited frame: at least 10 body rows still visible with the desk and all furniture drawn (measured 13)"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#seated whenever resting on the own seat (05-25, G-05-P3) > seatedRows >= 10 guard (probe-proven message: 'only 13 body rows survive the composite')"
        status: pass
    human_judgment: false
  - id: D5
    description: "The live harness measures the raised head gap on real browser pixels and goes red both when the gap shrinks below BUBBLE_ICON_GAP_PX and when it exceeds BUBBLE_ICON_GAP_PX + 1"
    requirement: "OFFICE-03"
    verification:
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs TRUTH 4 — headGap >= BUBBLE_ICON_GAP_PX && headGap <= BUBBLE_ICON_GAP_PX + 1, LIVE PROOF: PASS"
        status: pass
    human_judgment: false
  - id: D6
    description: "At stream scale the aisle sender reads as a full-body standing figure while seated agents read as head-and-shoulders behind their desks, with no seated face clipped"
    requirement: "OFFICE-03"
    verification:
      - kind: automated_ui
        ref: "scratchpad/uat-shots-05-38/handoff.png and cohort.png (Playwright, 1280x704 at scale 4) — inspected by the executor"
        status: pass
    human_judgment: true
    rationale: "The UAT gaps this plan closes (G-05-1c, G-05-2a) were raised by a human judging legibility at stream scale; the executor's own frame review is evidence, not a substitute for the human re-judging the same scenes. Task 2's <human-check> harvests to end-of-phase UAT per workflow.human_verify_mode = end-of-phase."

duration: 13 min
completed: 2026-09-23
status: complete
---

# Phase 05 Plan 38: Glyph Head Gap and Seated Sink Summary

**Two spacing constants raised with their guards: the status glyph now sits 3 unzoomed px (12 device px at stream scale) clear of its owner's head, and a seated agent shows 13 visible body rows against a standing agent's 28.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-23T06:58:25Z
- **Completed:** 2026-09-23T07:11:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `BUBBLE_ICON_GAP_PX` 1 → 3 (G-05-1c). `resolveBubbleY` and `resolveDialogueBox`'s `above` candidate both already multiplied the constant, so the glyph and the dialogue band followed with no renderer edit.
- `CHARACTER_SITTING_OFFSET_PX` 6 → 10 (G-05-2a). Every extra sunk row is a row the desk covers, so the seated/standing visible-row delta grew one-for-one: 15 rows, against the old 11.
- **A new head-visibility floor**, the half the UAT ask did not contain: `seatedRows >= 10` goes red if a future offset "closes" this gap by burying the head. Measured 13, so the guard binds at an offset of 14.
- **TRUTH 4's one-sided `headGap <= 2` became two-sided** over the constant. The old bound stayed green when the glyph collapsed back onto the head — precisely the regression this plan exists to prevent.
- `TAIL_REACH_PX` stopped being the literal `18` that IN-05 had flagged as drift-prone; it is now `13 + BUBBLE_ICON_GAP_PX + DIALOGUE_TAIL_PX + 2` (= 20), read from the engine's own source.

## Task Commits

1. **Task 1 (tracer): Raise the glyph head gap end to end** — `7253424` (fix)
2. **Task 2: Sink a seated agent further behind its desk, with a head-visibility guard** — `30607af` (fix)

## Files Created/Modified

- `packages/pixel-office/src/constants.ts` — both constants raised, both doc comments cite 05-38 and state the unzoomed-px unit
- `packages/pixel-office/src/engine/renderer.test.ts` — literal pins on both constants, `resolveBubbleY` headroom cases re-derived (28 / 84), `ABOVE_Y` 18 → 16, CR-02 composite geometry moved twice (50..82 / 114 / glyph band 102..114), delta floor 8 → 12, new head-visibility guard
- `scripts/verify-pixel-office-live.mjs` — two new `readNumberConst` reads, derived `TAIL_REACH_PX`, two-sided TRUTH 4 gap bound with the computed range in the failure message
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — lines 76, 102 and 170 only

## Decisions Made

- **The live TRUTH 4 bound guards renderer-vs-constant drift, not a constant revert.** The harness reads `BUBBLE_ICON_GAP_PX` from the same source the renderer compiles from, so reverting the constant moves the rendered gap *and* the expected range together and the assertion stays green. What it catches is a renderer that stops honouring the constant, and a measured gap of 1.25 against the shipped 3. This is a correction to the plan's success-criterion phrasing ("three guards each go red on a revert of the value they protect") — the two unit literal pins are the revert guards; the live bound is the drift guard. Stating it rather than letting the plan's framing stand unexamined.
- **The plan's review-frame path was not used.** `PIXEL_OFFICE_SHOTS=.gsd/uat-shots-05-38` is inside the repo, and 05-21 deliberately made the harness throw on an in-repo path (threat register `T-05-21-02`, "never into the repo"). Frames went to the session scratchpad, matching every prior 05-* plan. See Deviations.
- **No step-down was needed.** The plan's safety net (drop the offset toward 9 if the head guard fires) did not engage: the seated agent shows 13 rows against a floor of 10, exactly the `23 - offset` the plan predicted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's review-frame directory is refused by the harness's own guard**
- **Found during:** Task 1 (live verification)
- **Issue:** The plan specifies `PIXEL_OFFICE_SHOTS=.gsd/uat-shots-05-38` in both tasks' `<verify>` blocks and in Task 1's acceptance criteria. `scripts/verify-pixel-office-live.mjs` throws at module load for any path inside the repo root — a deliberate 05-21 guard (`T-05-21-02`, "written only when `PIXEL_OFFICE_SHOTS` is set, to that directory; never into the repo"). Confirmed empirically: `Error: PIXEL_OFFICE_SHOTS must be outside the repo (F:\Sidegigs\PixelFirm), got F:\Sidegigs\PixelFirm\.gsd\uat-shots-05-38`.
- **Fix:** Pointed `PIXEL_OFFICE_SHOTS` at the session scratchpad (`…/scratchpad/uat-shots-05-38`), which is what every prior 05-* plan did. The guard was NOT relaxed — weakening a hygiene control to satisfy a mis-specified env var would trade a real protection for a path string.
- **Files modified:** none (invocation-only)
- **Verification:** `LIVE PROOF: PASS` with `states.png`, `cohort.png`, `handoff.png`, `empty.png` and three viewport frames written to the scratchpad.
- **Committed in:** n/a — no source change was required.

**2. [Rule 1 - Bug] Two derived test literals the plan's task list did not enumerate**
- **Found during:** Task 1
- **Issue:** `ABOVE_Y = 18 // 43 - (13 + 1) - 2 - 9` in the `resolveDialogueBox` describe is computed from `BUBBLE_ICON_GAP_PX`; the plan noted that the `above` candidate "shifts with the constant" but listed only four repair sites, none of them this one. Left alone, seven assertions across that describe would have gone red.
- **Fix:** `ABOVE_Y` 18 → 16, its arithmetic comment re-derived over the named constants rather than bare numbers, and the neighbouring `// headTop 16 => above y -9` comment corrected to `-14`. `ABOVE_Y` is still ≥ `FLOOR_TOP` (16), so the "above" candidate stays valid and the out-of-bounds case it is contrasted against stays invalid.
- **Files modified:** packages/pixel-office/src/engine/renderer.test.ts
- **Verification:** all 196 tests pass; the `an 'above' candidate that would start above the floor top is never returned` case still asserts `candidates[1].valid === false`.
- **Committed in:** `7253424` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** No scope creep. Deviation 1 is invocation-only; deviation 2 is a site the plan's own repair list missed. Both constants landed at the plan's target values.

## Verification Results

| # | Check | Result |
|---|---|---|
| 1 | `pnpm --filter pixel-office test` | 196 passed (8 files) — the plan's floor is 196 |
| 2 | `pnpm --filter web test` / `pnpm --filter web typecheck` | 24 passed / clean, no `error TS` |
| 3 | `pnpm turbo run test --force` | 10/10 tasks successful, 0 cached |
| 4 | `node scripts/verify-pixel-office-live.mjs` | `LIVE PROOF: PASS`, TRUTH 0–7 green, frames written |
| 5a | Revert probe: `BUBBLE_ICON_GAP_PX` → 1 | **7 failed** / 189 passed → restored |
| 5b | Revert probe: `CHARACTER_SITTING_OFFSET_PX` → 6 | **2 failed** / 194 passed → restored |
| 5c | Head-guard probe (floor temporarily 99) | Message reads `only 13 body rows survive the composite` → restored |
| 6 | `git diff 05-UI-SPEC.md` | hunks at lines 76, 102, 170 only |

**Live TRUTH 4, before and after Task 2:** head top 113 → 117, front sprite bottom 78 → 82, glyph band y 99..108.75 → 103..112.75. Gap held at 3.25 device px through both, inside the printed `3..4` range. Neither harness expression that reads `CHARACTER_SITTING_OFFSET_PX` was edited — they followed the constant, which is the property the plan wanted demonstrated.

**Success criteria (`<success_criteria>`):** `BUBBLE_ICON_GAP_PX` is 3 ✓ · `CHARACTER_SITTING_OFFSET_PX` is 10 (≥ 9) ✓ · guards go red as recorded above ✓ (with the TRUTH 4 nuance in Decisions) · `LIVE PROOF: PASS` with no TRUTH weakened or removed ✓ · no change to `renderer.ts`, `handoff-choreography.ts`, any sprite asset or the attribution footer — the whole-plan diff is exactly 4 files ✓

### Frame review (executor, scratchpad)

Read at 1:1 before handing anything to human UAT:

- **`handoff.png`** — the aisle sender stands full-body at its interaction tile with the whole torso and legs clear of furniture; the two seated agents behind the row-4 desks show head and shoulders only. No seated face is clipped by its desk. Both glyphs (stop sign, hourglass) float with unmistakable air above their owners' heads.
- **`cohort.png`** — nine seated agents across four pods, every head and shoulder line intact above the desk edge, none buried. The two `blocked` stop signs read as detached signals rather than sprite ink, which is the specific complaint G-05-1c recorded.

## Issues Encountered

None. Both tasks' arithmetic matched the plan's pre-derivation exactly (seated rows `23 - offset` = 13; glyph band 98..110 then 102..114), so neither the plan's off-canvas check nor its offset step-down path had to be exercised.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both UAT gaps closed with guards. 05-39 and 05-40 (the remaining round-3 cosmetic closures) are unblocked; 05-40 owns four different `05-UI-SPEC.md` rows and runs in a later wave, so there is no file contention with the three rows this plan took.
- The test Postgres container is left running, matching 05-01/05-04's documented choice (`pnpm --filter api db:test:down` to stop it).
- Task 2's `<human-check>` (the `handoff.png` read at 1:1) harvests to the end-of-phase UAT batch per `workflow.human_verify_mode: end-of-phase`. The executor's own frame review above is evidence for that batch, not a replacement for it.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-23*

## Self-Check: PASSED

All four key files exist on disk; both task commits (`7253424`, `30607af`) are present in `git log --oneline --all`.

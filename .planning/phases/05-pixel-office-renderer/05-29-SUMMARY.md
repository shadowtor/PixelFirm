---
phase: 05-pixel-office-renderer
plan: 29
subsystem: ui
tags: [pixel-office, handoff, dialogue, ui-spec, live-proof]
status: complete
gap_closure: true
gap_ids: [G-05-1b]

requires:
  - phase: 05-28
    provides: compact tailed speech bubble (5 world-px font, 9 px tall) whose width follows the text
provides:
  - short deterministic handoff labels ("<title> → <name>", "<name> accepts <title>")
  - MAX_DIALOGUE_TITLE_CHARS = 12, MAX_DIALOGUE_NAME_CHARS = 10
  - width-budget test (longest line 31 code points <= 100 world px)
  - 05-UI-SPEC Typography/Color/Copywriting/UI Considerations matching the shipped bubble and label
affects: [05-30]

actuals:
  tokens: 5300
  tasks: 2
  commits: 3
plan_head_before: b9c9d1e294e729fe618429682b3cd59f0fdbfee8

tech-stack:
  added: []
  patterns:
    - "Width budget asserted in a unit test from the same constants the renderer uses"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/handoff/dialogue-templates.ts
    - packages/pixel-office/src/handoff/dialogue-templates.test.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "Handoff dialogue templates are short labels: requested '<title> → <name>', accepted '<name> accepts <title>'; caps 12/10 code points with U+2026 (longest line 31 code points, about 93 world px)"
  - "05-UI-SPEC supersedes the 11px canvas dialogue scale and the above-the-glyph-slot placement; the DOM footer keeps 11px"

requirements-completed: [HANDOFF-02]

coverage:
  - id: D1
    description: "Short deterministic templates with 12/10 caps, surrogate-safe cut, tone rules and zero network/LLM surface"
    requirement: HANDOFF-02
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/dialogue-templates.test.ts#short label templates and caps (05-29, G-05-1b)"
        status: pass
  - id: D2
    description: "Longest possible line fits 100 world px of bubble"
    requirement: HANDOFF-02
    verification:
      - kind: unit
        ref: "dialogue-templates.test.ts#the longest possible line fits the label budget"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-pixel-office-live.mjs (TRUTH 5)"
        status: pass

duration: 6min
completed: 2026-09-22
---

# Phase 5 Plan 29: Short handoff label and UI-SPEC amendment Summary

**The handoff bubble now says `live-proof-… → live-proo…` instead of a truncated sentence: templates are `<title> → <name>` and `<name> accepts <title>`, capped at 12/10 code points, so the longest line is 31 code points (about 93 world px). 05-UI-SPEC now describes the 05-28 bubble and these labels. G-05-1b closed.**

## What was done

- `dialogue-templates.ts`: new templates, caps 12/10, rewritten ponytail (31 code points, about 93 world px at the 5px font; raise only with a wider layout). Tone header, Phase 7 stream-safety note and code-point cut kept.
- `dialogue-templates.test.ts`: exact-template test, 30→12 title cut, 20→10 name cut, width budget (`31 * 0.6 * 5 + 2 * (2 + 1) = 99 <= 100`). Surrogate, tone and no-network/LLM tests kept. The two interpolation tests use inputs under the new caps.
- `handoff-choreography.test.ts`: the 7 `toContain("Handing off")` assertions now check `" → "`. Nothing else changed.
- `05-UI-SPEC.md`: Label row, Handoff dialogue paragraph (5 world px, 9px bubble, 1px ink border, 2px tail, hung from the foot line, spans sender to receiver, clamped to the floor interior, layout guard, superseded note), both Color rows (`#dcdcdc` fill, `#161616` ink), the three Copywriting rows and the long-text row. Tone rule unchanged. `grep "stacked directly above the speaker"` finds nothing.

## Verification

- RED `e7f5ca7`: 4 new template tests and 16 choreography tests failed. GREEN `42c949d`: 150/150 pixel-office tests pass.
- Live: `TRUTH 5 (during) PASS — requested: 3884 bubble px + 715 text px at x 43.7..116.3, y 75..81.7` (05-28 was x 17..147.3). `TRUTH 5 (accepted) PASS — x 43.3..132.3`. `LIVE PROOF: PASS`.
- Screenshot (`scratchpad/shots29/handoff.png`, x3): a small light bubble under the row-4 pair reads `live-proof-… → live-proo…`, crisp and readable. All glyphs above the heads are clear.

## Task Commits

1. Task 1 RED: `e7f5ca7` test(05-29): add failing short-label template, 12/10 cap and 100px width-budget tests
2. Task 1 GREEN: `42c949d` feat(05-29): handoff dialogue is a short label with 12/10 caps
3. Task 2: `c7349ed` docs(05-29): UI-SPEC typography, colour and copy describe the 05-28 bubble and 05-29 short label

## TDD Gate Compliance

RED commit `e7f5ca7` (tests failing for the intended reason: old wording and caps) came before GREEN `42c949d`. No refactor commit.

## Deviations from Plan

**1. [Rule 1 - Bug] Old interpolation tests used inputs over the new caps**
- **Found during:** Task 1 GREEN
- **Issue:** "Fix login bug" (13) and "reviewer-bot" (12) were now cut, so `toContain` failed.
- **Fix:** inputs changed to "Fix login" / "reviewer". Assertions unchanged.
- **Commit:** `e7f5ca7` (folded into the test commit)

`tsc --noEmit` run directly in the package fails with pre-existing TS2835 module-resolution errors across the package (no package typecheck script). This is unrelated to this plan, so it was left alone.

## Known Stubs

None.

## Self-Check: PASSED

- All four modified files exist; commits e7f5ca7, 42c949d and c7349ed are in `git log`.

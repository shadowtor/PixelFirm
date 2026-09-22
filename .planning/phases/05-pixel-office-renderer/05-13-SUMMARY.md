---
phase: 05-pixel-office-renderer
plan: 13
subsystem: pixel-office
tags: [canvas, renderer, handoff, dialogue, fsm, idempotence, vitest]
status: complete

requires:
  - phase: 05-10
    provides: "desk rows 3/6/9 and the owner-bound resolveBubbleY the dialogue box stacks above"
  - phase: 05-04
    provides: "handoff FSM and locked dialogue templates"
provides:
  - "renderScene paints handoff dialogue (Character.bubbleText) in an owner-bound box: sprites -> dialogue -> glyphs"
  - "resolveDialogueBox(ownerCenterX, drawY, textWidth, zoom, canvasWidth) — exported, @internal"
  - "Code-point caps on TaskState.title (16) and agent name (12) inside resolveHandoffDialogue"
  - "Dialogue constants in constants.ts (one-line `export const` form, readable by 05-16's regex)"
  - "Handoff FSM clears the accepted line at sequence end and ignores re-delivered request event ids"
affects: [05-16, verify-phase-05, 07-stream-safety]

actuals:
  tokens: 10300
  tasks: 3
  commits: 6
plan_head_before: 0e77c214a017a16f754e44f7b38e4867ae5550cc

tech-stack:
  added: []
  patterns:
    - "One per-frame layout list shared by every render pass; state glyphs are the last pass so nothing can occlude them"
    - "Draw-call assertions (fillText + op-order log) rather than string-content assertions for render claims"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/constants.ts
    - packages/pixel-office/src/types.ts
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - packages/pixel-office/src/handoff/dialogue-templates.ts
    - packages/pixel-office/src/handoff/dialogue-templates.test.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts

key-decisions:
  - "Dialogue colours are #121212 (box) and #f0f0f0 (text), not the planned #1a1a1a/#ffffff: both planned values are painted by the character sprites (#1a1a1a) or sprites and glyphs (#ffffff). Both replacements are achromatic and absent from every palette at every identity hue."
  - "Render order is sprites -> dialogue -> glyphs. A dialogue box can overlap glyph rows (desk rows 3/6/9 leave no free position), so glyphs go last and a state signal can never be hidden."
  - "Request-event dedup lives in the FSM (handledHandoffRequestIds), the only non-idempotent consumer. Completions were already idempotent via the phase check."

requirements-completed: [HANDOFF-01, HANDOFF-02, OFFICE-03]

coverage:
  - deliverable: "Capped handoff dialogue painted in an owner-bound box"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/pixel-office/src/engine/renderer.test.ts#tracer: a real handoff's capped 'requested' line is drawn once"
        status: pass
      - kind: test
        ref: "packages/pixel-office/src/handoff/dialogue-templates.test.ts#resolveHandoffDialogue — length caps"
        status: pass
  - deliverable: "State glyphs drawn above dialogue boxes"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/pixel-office/src/engine/renderer.test.ts#renderScene pass order — state glyphs are the top layer"
        status: pass
      - kind: test
        ref: "packages/pixel-office/src/engine/renderer.test.ts#dialogue colours are unambiguous"
        status: pass
  - deliverable: "FSM clears dialogue at sequence end and ignores re-delivered requests"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#handoff sequence end + re-delivery idempotence"
        status: pass
      - kind: command
        ref: "pnpm --filter web test"
        status: pass
  - deliverable: "Whether an 11px line on the 320px canvas is legible at stream scale"
    human_judgment: true
    rationale: "Judgment-tier (planner assumption A7); routed to 05-16's human check along with real-canvas pixel evidence."

duration: 8 min
completed: 2026-09-22
---

# Phase 5 Plan 13: Handoff Dialogue Draw Pass Summary

**Handoff dialogue is now painted: code-point-capped template lines in a dark box stacked above the speaking agent. State glyphs are the top render layer, and the handoff FSM clears its line when the sequence ends and ignores re-delivered request events.**

## Performance

- Duration: about 8 min
- Tasks: 3 (6 commits: RED plus GREEN for each)
- Files modified: 8
- Tests: pixel-office went from 63 to 80, all passing; web has 18, all passing

## Accomplishments

- `resolveHandoffDialogue` caps the title at 16 code points and the name at 12, cutting with U+2026. It splits with `Array.from`, so surrogate pairs stay whole. The longest possible line is 46 code points. Inputs under the caps come out byte-identical, and the locked templates are unchanged.
- `resolveDialogueBox` puts the box directly above the owner's glyph slot, clamped at y = 0, and centred on the owner. It is clamped horizontally into the canvas, so the box always contains the owner's centre x and never overlaps the owner's own sprite.
- `renderScene` computes each character's layout once per frame, then paints three passes in order: base sprites, dialogue boxes and text, then state glyphs. `renderFrame` now passes `canvasWidth` through.
- The FSM stores `acceptedText` on the record and clears the receiver's line once the sender is back at its desk, but only if the line is unchanged. `handledHandoffRequestIds` stops a request event id from driving the walk twice. This closes the CR-01 stranding sequence.

## Task Commits

1. Task 1 (tracer): RED `e2fdf7b`, GREEN `f484ec0`
2. Task 2: RED `89db94d`, GREEN `b507521`
3. Task 3: RED `f11f930`, GREEN `8d4f0f2`

## TDD Gate Compliance

- **Task 1 RED:** the tracer failed with `expected +0 to be 1` on the fillText count. The cap cases failed with `expected undefined to be 16` / `12`, because the MAX exports did not exist yet. All 65 existing cases passed in the same run. The new symbols are loaded with dynamic imports, so the failures were assertion failures, not load crashes.
- **Task 2 RED:** the layering composite failed on op order: `a glyph rect was painted before the dialogue box/text: expected 636 to be greater than 1054`. The own-glyph case failed with `expected 230 to be greater than 614`. Every other renderer case passed. After the test-helper fix (see Deviations), I checked RED again against the Task 1 renderer and it still failed on ordering.
- **Task 3 RED:**
  - The end-of-sequence case failed with `expected 'agent-b accepts "task-1"' to be null`.
  - The replay case failed with `expected [ { col: 2, row: 3 } ] to deeply equal []`: the sender walked again.
  - The mid-sequence duplicate failed with `expected 'idle' to be 'type'`: the completion no-opped, which is CR-01's strand.
  - All 77 other cases passed.
- **Colour-guard non-vacuity:** I temporarily set `DIALOGUE_BOX_COLOR` to `#1a1a1a`, a colour taken from `character-metrocity.json`. The guard failed with `AssertionError: #1a1a1a is also painted by a character or glyph: expected true to be false`. I then reverted the constant; `git status` was clean afterwards.
- **Tracer gate:** end-of-phase mode with automated-only verify. I re-ran `pnpm --filter pixel-office test -- renderer dialogue-templates` and it was green before expanding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The planned dialogue colours collide with the sprite palette**
- **Found during:** Task 1 GREEN. The tracer found 4 rects painted in `#1a1a1a` instead of 1.
- **Issue:** Both `#1a1a1a` and `#191919` appear in the character sprites. A probe of all 303 palette colours (12 hues plus every glyph) found these achromatics: `#000000 #191919 #1a1a1a #353535 #4f4f4f #595959 #9f9f9f #ffffff`.
- **Fix:** The box colour is now `#121212`, which the plan explicitly allowed.
- **Files modified:** constants.ts
- **Commit:** f484ec0

**2. [Rule 2 - Missing critical] The text colour also collided, so it changed and the guard now covers it**
- **Issue:** The prohibition says "MUST NOT use a dialogue box **or text** colour that a character sprite ... or a state glyph can also paint". The planned `#ffffff` is painted by both. The planned guard only checked the box colour.
- **Fix:** The text colour is now `#f0f0f0` (achromatic, in no palette), and the guard asserts both colours.
- **Files modified:** constants.ts, renderer.test.ts
- **Commit:** f484ec0 / 89db94d

**3. [Rule 1 - Bug] Test helper `bubbleOnlyColors` compared colours case-sensitively and ignored neighbours' hues**
- **Found during:** Task 2 GREEN. The layering composite still failed after the reorder.
- **Issue:** Sprites store `#FFFFFF` and glyphs store `#ffffff`, so white counted as a glyph-only colour. Separately, the helper only excluded the owner's hue, so a neighbour's hue-shifted sprite pixels matched too.
- **Fix:** The helper now lower-cases both sides and takes a list of scene characters. Existing calls with a single argument behave the same, and all earlier cases stayed green.
- **Files modified:** renderer.test.ts
- **Commit:** b507521

**Total deviations:** 3, all auto-fixed. **Impact:** colour constants changed but keep the one-line hex form that 05-16's regex reads. No scope change.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file surface. T-05-13-01, 03, 04 and 05 are mitigated as planned.

## Next Phase Readiness

Ready for 05-14. 05-16 should read `DIALOGUE_BOX_COLOR = "#121212"` and `DIALOGUE_TEXT_COLOR = "#f0f0f0"` from constants.ts, not the values given in the plan text. `npx tsc` shows only the existing TS2835 / status-mapping.test.ts set.

## Self-Check: PASSED

- All 8 modified files exist, and the 6 commits (e2fdf7b, f484ec0, 89db94d, b507521, f11f930, 8d4f0f2) are in `git log`.
- Every acceptance grep passes:
  - constants: 4 numeric and 2 hex
  - renderer.ts: resolveDialogueBox 1, fillText 1
  - dialogue-templates.ts: MAX caps 2, Array.from 1
  - handoff-choreography.ts: handledHandoffRequestIds 4, acceptedText 5
- `pnpm --filter pixel-office test` passes 80/80 and `pnpm --filter web test` passes 18/18.

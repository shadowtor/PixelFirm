---
phase: 05-pixel-office-renderer
plan: 33
subsystem: ui
tags: [canvas, pixel-art, renderer, layout, vitest, playwright, dialogue]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer
    provides: "05-28's partner-spanning speech bubble, DIALOGUE_* constants and the renderBubbleFrame test harness"
  - phase: 05-pixel-office-renderer
    provides: "05-30's head-anchored glyph placement (resolveBubbleY off the drawn frame's first opaque row)"
  - phase: 05-pixel-office-renderer
    provides: "05-32's seated-whenever-resting rule, which is the obstacle profile the scorer now reads"
  - phase: 05-pixel-office-renderer
    provides: "05-24's furnished floor (FURNITURE / office-layout.json) and 05-31's live-proof harness"
provides:
  - "resolveDialogueBox scores four ordered candidate positions (below / above the glyph band / right / left) against the frame's real obstacles and returns the chosen box, its tail and all four scored candidates"
  - "Glyphs and the floor interior are hard constraints; desks, then all other furniture, then characters rank the survivors, so a desk-covering bubble is never chosen while a valid desk-free one exists"
  - "A tail that always binds the box to its speaker, whichever candidate wins"
  - "lastDialoguePlacements(): the per-frame placement record, so tests assert the ranking against the candidates the scorer actually considered"
  - "A 40-scene position-agnostic sweep (20 receiver homes x requested/accepted, full 20-agent office) that does not depend on where handoff senders stand"
  - "FURNITURE_RECTS in the live harness: one placement rule shared by TRUTH 6 and TRUTH 5"
affects: [ceo-dashboard, stream-overlay, obs-capture]

actuals:
  tokens: 12463
  tasks: 3
  commits: 3
plan_head_before: fbd21fc54058f33a06e7464371485956e89e61b8

tech-stack:
  added: []
  patterns:
    - "Ordered-candidate placement with a lexicographic obstacle key: hard constraints filter, soft constraints rank, candidate index breaks ties — the chosen position is a pure function of the frame, never of the layout"
    - "One helper produces both the drawn rect and the scored obstacle rect (glyphPlacement), so a scorer can never rank against a position the renderer does not use"
    - "Scorer self-instrumentation: the per-frame candidate set is exported read-only, so a sweep can assert the RANKING (and its non-vacuity) rather than only the outcome"
    - "Position-agnostic scene tests: the speaker is derived from bubbleText/bubbleTextPartnerId, never from a hard-coded tile, so a later plan that moves speakers needs no test edit"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - packages/pixel-office/src/layout/officeLayout.ts
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "Desks are counted under BOTH the desk key and the furniture key, so no furniture tie-break can ever reverse a desk decision"
  - "GLYPH_ROWS is derived from BUBBLE_SPRITES rather than restated as 13, so the 'above' candidate keeps clearing the glyph band if a glyph is ever redrawn taller"
  - "A desk entry is recognised by sprite object identity (DESK_SPRITE exported from officeLayout), so PlacedFurniture needs no new field"
  - "Character obstacle rects are clipped at the foot line: a seated agent's lower body is behind its desk and is not something a bubble can cover"
  - "Task 2's test-only rewrite was committed in Task 1's RED commit — splitting it would have made Task 1's own verify gate red by construction"

patterns-established:
  - "Hard/soft obstacle split: a placement that would hide a state signal is INVALID, never merely low-ranked"
  - "Non-vacuity counters in a sweep: count the scenes where the ranking actually had a worse alternative to reject, and fail if that count is zero"

requirements-completed: [HANDOFF-01, HANDOFF-02]

coverage:
  - id: D1
    description: "resolveDialogueBox with no obstacles reproduces 05-28's geometry on the new signature: below the feet, centred on the pair midpoint, clamped into the floor interior (never x = 0), every length scaling by 3 at zoom 3"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#with no obstacles it hangs below: centred on the pair, clamped to the floor interior, x3 at zoom 3"
        status: pass
    human_judgment: false
  - id: D2
    description: "Glyphs and the floor bounds are hard limits — a candidate intersecting any glyph, or starting above the floor top, is never returned; when below and above are both blocked the bubble goes right, or left when right would leave the floor"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#a candidate intersecting a glyph is never returned: glyphs on below and above force 'right'"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#an 'above' candidate that would start above the floor top is never returned"
        status: pass
    human_judgment: false
  - id: D3
    description: "Soft ranking is desk, then all other furniture, then character, then candidate index: a 4 px desk under 'below' loses to a 594 px character or plant over 'above', a plant under 'below' loses to a character over 'above', and when every candidate covers a desk the least desk area (45 px of 180/270/360/45) wins"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#a desk under 'below' moves the bubble 'above', with zero desk overlap"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#when every candidate covers a desk, the least desk area wins"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#a desk outranks everything soft: a 4 px desk under 'below' loses to a full character or plant over 'above'"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#non-desk furniture outranks characters: a plant under 'below' loses to a character over 'above'"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#returns all four candidates in order, and the chosen box is the lowest-keyed valid one"
        status: pass
    human_judgment: false
  - id: D4
    description: "For each of the four candidate kinds the tail is 1 px across (zoom-scaled), shares an edge with its box, does not overlap it, and reaches the speaker's foot line, head top or sprite side — at zoom 1 and 3"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#each candidate's tail is 1 px across, shares an edge with its box, and reaches the speaker"
        status: pass
    human_judgment: false
  - id: D5
    description: "Driven through the real handoff flow with the shipped furniture: a seated receiver's accepted line, and a sender's requested line, land inside the floor interior over no furniture and no glyph with the tail on the speaker"
    requirement: "HANDOFF-01"
    verification:
      - kind: integration
        ref: "packages/pixel-office/src/engine/renderer.test.ts#tracer: the accepted line of a seated agent clears its desk, every glyph and the floor edge, tail on the receiver"
        status: pass
      - kind: integration
        ref: "packages/pixel-office/src/engine/renderer.test.ts#requested line, clear office: one bubble, 5px monospace text in a 9 px box, tail on the sender, clear of furniture and glyphs"
        status: pass
      - kind: integration
        ref: "packages/pixel-office/src/engine/renderer.test.ts#the accepted bubble belongs to the receiver alone"
        status: pass
    human_judgment: false
  - id: D6
    description: "40 scenes (each of 16 seats + 4 standing spots as receiver, requested and accepted, full 20-agent office with every bystander blocked): the box is inside the floor interior, no glyph of any character overlaps it, the tail touches the speaker, the recorded box equals the drawn fill, the chosen candidate is valid, and it is desk-free/furniture-free whenever any valid candidate is — with counters proving the ranking rejected a worse alternative at least once"
    requirement: "HANDOFF-01"
    verification:
      - kind: integration
        ref: "packages/pixel-office/src/engine/renderer.test.ts#every home, full office: in the floor, off every glyph, tail on the speaker, desk-free whenever a valid candidate is"
        status: pass
    human_judgment: false
  - id: D7
    description: "Pass order, dialogue colours, font, box height/padding and the 05-29 templates/caps are unchanged: state glyphs are still painted after every box and text"
    requirement: "HANDOFF-02"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#paints a neighbour's blocked glyph after a dialogue box that crosses its column"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#paints the owner's own handoff-task glyph after its own dialogue box"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#uses achromatic colours absent from every sprite/glyph palette, floor and wall"
        status: pass
    human_judgment: false
  - id: D8
    description: "On the live composited canvas the requested bubble lands at x 42.75..117.5 y 20..29 (above, over the open rows) and the accepted bubble at x 98..189.25 y 52..61 (right of the seated receiver): both inside the floor, carrying text, with 0 state-glyph px inside the box, no FURNITURE_RECTS intersection, and within 18 px tail reach of their speaker"
    requirement: "HANDOFF-01"
    verification:
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs#TRUTH 5 (during) and TRUTH 5 (accepted) — LIVE PROOF: PASS"
        status: pass
      - kind: automated_ui
        ref: "scripts/verify-pixel-office-live.mjs#handoff.png — bubble in the open rows above the pod, tail on the sender's head, desks and monitors clear"
        status: pass
    human_judgment: true
    rationale: "G-05-P1 was raised by the CEO as a polish judgment from a native-scale capture ('the bubble sits on the desk / crosses the edge'). Every property is now asserted deterministically and the live screenshot was inspected and clearly shows the bubble in clear floor above the pod, but whether the new position reads as well-placed at a glance on their own stream is theirs to confirm."
  - id: D9
    description: "05-UI-SPEC.md records the candidate placement rule (the four candidates, validity, ordering, the tail, and the two-tier obstacle model) under Typography, and the Spacing 'Office layout' paragraph points at it instead of 05-28's under-the-feet strip"
    verification:
      - kind: other
        ref: "grep -n \"05-33\" .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md (2 matches: Spacing line 102, Typography line 117)"
        status: pass
    human_judgment: false

duration: 33 min
completed: 2026-09-23
status: complete
---

# Phase 05 Plan 33: Candidate-Scored Handoff Bubble Placement Summary

**A handoff speech bubble is now placed by scoring four ordered candidates (below, above the glyph band, right, left) against the frame's real glyphs, desks, furniture and characters — so the accepted line of a desk agent, which used to land squarely on its desk and monitors every time, now sits in clear floor with a tail pointing back at its speaker.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-09-23T09:14:00Z
- **Completed:** 2026-09-23T09:47:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `resolveDialogueBox` went from one fixed position to four ordered candidates scored per frame. **Glyphs and the floor interior are hard constraints** — a candidate that would cover any state glyph, or cross the canvas edge, is simply not returned. Among the survivors the key is `(deskArea, furnitureArea, characterArea, index)`, which is the UAT's own ranking: a desk-covering box is never chosen while a valid desk-free one exists.
- The G-05-P1 defect measured before and after, on the same scene: the accepted line of a seated receiver used to be drawn at `x 43..133, y 74..83` — directly over the row-5 desk (`y 66..96`) and its monitors. It is now placed clear of both. On the live canvas the requested line moved from the desk band to `y 20..29`, in the open rows above the pod.
- **The tail always binds the line to its speaker**, whichever candidate wins: a vertical 1 px rect to the foot line (below) or the head top (above), or a horizontal one across the gap to the sprite side (right/left). Pass 3 draws the speaker's own glyph over the "above" tail, which is why the glyph band is cleared by construction rather than by luck.
- Glyph placement was factored into one `glyphPlacement()` helper used by **both** the draw pass and the obstacle list, so the rects the scorer ranks against are exactly the rects that get painted — the class of bug where a scorer avoids a position the renderer does not actually use is now unrepresentable.
- The 05-28 band tests were replaced by **position-agnostic sweeps**: 40 scenes (each of the 16 seats and 4 standing spots as receiver, requested and accepted, full 20-agent office with every bystander blocked). The sweep reads `lastDialoguePlacements()` — the scorer's own per-frame record — so it asserts the *ranking*, not just the outcome, and carries non-vacuity counters that fail if no scene ever had a worse alternative to reject. Nothing in these tests names a sender tile, so 05-34's interaction-slot move must pass them unchanged.
- The live harness's TRUTH 5 was rebased from "in the band under the pair's feet, containing both centres" to the five properties that actually matter: inside the floor interior, text present, **0 state-glyph px inside the box** (blocked + handoff + the new waiting colours), no `FURNITURE_RECTS` intersection, and within 18 px tail reach of the speaker's sprite box. TRUTH 6's desk arithmetic was generalised into that same `FURNITURE_RECTS`, so one placement rule now serves both truths.

## Task Commits

1. **Task 1 (RED) + Task 2: failing tests for candidate placement and the sweeps** — `fdd8403` (test)
2. **Task 1 (GREEN): the four-candidate scorer, obstacle build and `lastDialoguePlacements`** — `f995bed` (feat)
3. **Task 3: live TRUTH 5 rebased + the UI-SPEC placement rule** — `3028b78` (test)

_No REFACTOR commit: the GREEN diff arrived with its helpers already extracted (`glyphPlacement`, `intersectArea`, `coveredArea`, `beats`) and named types, so there was nothing left to clean up — per `tdd.md`, REFACTOR commits only on change._

## Files Created/Modified

- `packages/pixel-office/src/engine/renderer.ts` — the candidate scorer and its types, `GLYPH_ROWS` derived from `BUBBLE_SPRITES`, `glyphPlacement()`, the per-frame obstacle build in `renderScene`, and `lastDialoguePlacements()`
- `packages/pixel-office/src/engine/renderer.test.ts` — 8 pure scoring cases, the scene tracer, the two position-agnostic sweeps, and the retired 05-28 band guard
- `packages/pixel-office/src/layout/officeLayout.ts` — `DESK_SPRITE` exported so a desk entry is recognised by object identity
- `scripts/verify-pixel-office-live.mjs` — `FURNITURE_RECTS`, `FLOOR`, `WAITING_COLORS`, and the rewritten `assertBubble`
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — the placement rule under Typography, and the Spacing pointer to it

## Decisions Made

- **Desks are counted twice, deliberately.** A desk rect appears in both `desks` and `furniture`, so its area contributes to both keys. Since the desk key is compared first, no furniture tie-break can ever reverse a desk decision — which is what "a desk-covering placement is never chosen when a valid desk-free one exists" actually requires when the furniture set is a superset.
- **`GLYPH_ROWS` is derived, not restated.** `Math.max(...Object.values(BUBBLE_SPRITES).map((s) => s.length))`. The "above" candidate's bottom edge is `headTop − (GLYPH_ROWS + BUBBLE_ICON_GAP_PX + DIALOGUE_TAIL_PX)`, so it clears *whichever* glyph the speaker happens to be wearing, and keeps clearing it if one is ever redrawn taller. A literal 13 would have silently started overlapping.
- **Desk identity by sprite object, not a new field.** `DESK_SPRITE` is exported from `officeLayout.ts` and compared with `===`, the same lookup `renderer.test.ts` already used. `PlacedFurniture` gains nothing, and a layout edit that renames the sprite key fails loudly at load rather than silently declassifying a desk.
- **Character rects are clipped at the foot line.** A seated agent's sprite extends 6 px below its foot line, but the desk is drawn *after* it, so those rows are not visible and are not something a bubble can cover. Scoring the full sprite box would have penalised placements that hide nothing.
- **The `beats()` comparison is strict, so index is the implicit final tie-break.** `best` is seeded with the first valid candidate and only ever replaced on a strictly-lower key, which makes "then the earlier candidate" fall out of the loop rather than needing a fourth comparison.
- **The no-valid-candidate fallback is marked, not defended.** It returns candidate 1 with a `ponytail:` comment naming its ceiling and upgrade path (more candidates). The 40-scene sweep asserts the chosen candidate is valid in every scene, which is the evidence that the branch is unreachable on the shipped layout — rather than prose claiming it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's test-only rewrite committed inside Task 1's RED commit**

- **Found during:** Task 1 (RED)
- **Issue:** The plan puts the rewrite of 05-28's tracer, its "attributed at every position" test and its layout-guard band test in Task 2, but all three assert the contract Task 1 supersedes. Task 1's `<verify>` (`pnpm --filter pixel-office test -- renderer`, `fails_when` any failed test) is therefore unsatisfiable while they remain: the layout-guard test calls the old 7-argument signature (a crash), and the other two assert `box.y >= foot line` and `spansX(box, sender.x)`, both of which the new rule correctly breaks.
- **Fix:** All of Task 2's test content was written in Task 1's RED commit, where it is red for the same reason as Task 1's own targets. Task 2 is `tdd="true"` but its `<files>` list is test-only, so it is not behaviour-adding and has no RED/GREEN of its own to lose. Every Task 2 behaviour and acceptance criterion is present and green.
- **Files modified:** `packages/pixel-office/src/engine/renderer.test.ts`
- **Verification:** Both Task 2 acceptance criteria pass — the full `pixel-office` suite is green (173/173) and `grep -n "every home, full office"` matches the sweep, which runs all 40 scenes inside it.
- **Committed in:** `fdd8403` (RED), green at `f995bed`

**2. [Rule 3 - Blocking] `NO_OBSTACLES` inferred as `never[]`**

- **Found during:** Task 1 (GREEN)
- **Issue:** The empty-array literal made every obstacle field `never[]`, so `{ ...NO_OBSTACLES, desks: [rect] }` was a type error in six places. Vitest transpiles without typechecking, so the suite was green while `tsc --noEmit` was not.
- **Fix:** Annotated `NO_OBSTACLES` with `Box[]` fields.
- **Files modified:** `packages/pixel-office/src/engine/renderer.test.ts`
- **Verification:** `npx tsc --noEmit -p packages/pixel-office` reports nothing in `renderer.ts`, `renderer.test.ts` or `officeLayout.ts` beyond the repo-wide pre-existing `TS2835` (missing `.js` extension) noise that every test file in the workspace already carries.
- **Committed in:** `f995bed`

**3. [Rule 1 - Bug] Three test fixtures asserted the wrong winning candidate**

- **Found during:** Task 1 (GREEN)
- **Issue:** My own fixtures, not the implementation. The "least desk area" case expected `200` where the desk rect only intersects the 9 px-tall box for 9 rows (`180`), and the two "desk/furniture outranks soft" cases expected `above` to win while `right` and `left` also scored zero on everything and beat it on index.
- **Fix:** Corrected the arithmetic, and added a `SIDES_OUT` floor that puts the side candidates out of bounds so those two cases pit `below` against `above` alone — which is the property they exist to prove.
- **Files modified:** `packages/pixel-office/src/engine/renderer.test.ts`
- **Verification:** The corrected cases now assert `candidates.map((c) => c.valid)` is `[true, true, false, false]`, so the isolation is itself pinned rather than assumed.
- **Committed in:** `f995bed`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug — all in test scaffolding, none in shipped behaviour)
**Impact on plan:** None on scope or behaviour. Deviation 1 moves a commit boundary; 2 and 3 are corrections to fixtures written in this plan.

## TDD Gate Compliance

| Task | Gate | Commit | Status |
|------|------|--------|--------|
| 1 (tracer) | RED | `fdd8403` `test(05-33)` | Pass — 12 named target tests failed, 161 unrelated green |
| 1 (tracer) | GREEN | `f995bed` `feat(05-33)` | Pass — 173/173 |
| 1 (tracer) | REFACTOR | — | Not needed; no commit made |
| 2 | n/a | `fdd8403` (tests) / `f995bed` (green) | Test-only task, not behaviour-adding — no source files in `<files>`, so no RED/GREEN gate of its own (see Deviation 1) |
| 3 | n/a | `3028b78` `test(05-33)` | `type="auto"`, not a TDD task |

**Manual RED evidence, Task 1** (target tests failing on assertions about the planned behaviour, ruling out syntax, discovery and fixture failures — `gsd check tdd-red-evidence` cannot certify RED on this Vitest repo, see Issues):

```
tracer: the accepted line of a seated agent clears its desk ...
  — box {"x":43,"y":74,"w":90,"h":9} covers furniture {"x":17,"y":66,"w":46,"h":30}
    (the G-05-P1 defect itself: the accepted line on the row-5 desk)
requested line, clear office ...
  — box {"x":44,"y":74,"w":72,"h":9} covers furniture {"x":17,"y":66,"w":46,"h":30}
every home, full office ...              — lastDialoguePlacements is not a function
with no obstacles it hangs below ...     — expected {x:NaN,y:NaN,w:NaN,h:NaN} to equal
                                           {x:126,y:74,w:66,h:9}
a desk under 'below' moves it above ...  — expected NaN to be 18
+ 7 more scoring cases reading .candidates off the old positional return
Tests  12 failed | 161 passed (173)
```

The two scene tests are the strongest RED evidence: they fail on a real geometric assertion against the shipped renderer, naming the exact desk rect the bubble sat on. The pure cases fail because the candidate shape does not exist yet — reached through `await import(...)` (05-10 precedent) so they surface as assertion/undefined-property failures rather than an ESM link crash.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter pixel-office test` | **173/173 passed** (8 files) — up from 165, net +8 after retiring the band guard |
| `pnpm --filter web test -- --run` | 23/23 passed (3 files) — nothing downstream moved |
| `pnpm -r --no-bail --filter '!orchestration-adapter' test -- --run` | all green except the known-flaky `apps/worker/src/poll-loop.test.ts`, which passes 21/21 in isolation |
| `npx tsc --noEmit -p packages/pixel-office` | clean for every file this plan touched |
| `grep -n "GLYPH_ROWS =.*BUBBLE_SPRITES" .../renderer.ts` | line 245, match |
| `grep -n "every home, full office" .../renderer.test.ts` | line 534, match |
| `node --check scripts/verify-pixel-office-live.mjs` | clean |
| `node scripts/verify-pixel-office-live.mjs` | **LIVE PROOF: PASS** — all eight truths |
| `grep -n "05-33" .../05-UI-SPEC.md` | 2 matches (Spacing 102, Typography 117) |

Live TRUTH 5 output:

```
TRUTH 5 (during) PASS — requested: 6791 bubble px + 1357 text px,
  box x 42.75..117.5, y 20..29; speaker tile (4,4) sprite x 64..80, y 40..72
TRUTH 5 (accepted) PASS — accepted: 8175 bubble px + 1821 text px,
  box x 98..189.25, y 52..61; speaker tile (5,4) sprite x 80..96, y 40..72
TRUTH 6 PASS — furnished office: 8 desks, 0 bare-floor px
TRUTH 7 PASS — 59.7 fps with 9 agents on the floor
```

Both bubbles passed the four new assertions: inside the floor interior, text present, **0 state-glyph px inside the box**, and **no `FURNITURE_RECTS` intersection**. The requested line took the "above" candidate (11 px above the standing sender's sprite top); the accepted line took "right" (2 px off the seated receiver's sprite edge) — the same shape the design predicted, arrived at from the frame rather than from a rule about seat rows. T-05-33-02's per-frame cost is unchanged in practice: TRUTH 7 still reports 59.7 fps.

**Screenshot review** (`PIXEL_OFFICE_SHOTS` to a scratch directory outside the repo; `handoff.png` inspected):

- `handoff.png` — **the G-05-P1 proof in one frame.** The requested bubble sits in clear floor in the open rows above the pod, its vertical tail dropping cleanly to the sender's head, with the sender's own handoff-task glyph painted over the tail (pass 3, as designed). Every desk, monitor and glyph on the row below is unobscured, and the box is nowhere near the canvas edge. Before this plan the same line was drawn across the desk and its two monitors.

## Issues Encountered

- `gsd check tdd-red-evidence` cannot certify RED on this Vitest repo (its record parser targets `node --test` TAP summary lines and camelCase keys, so a genuinely red run returns `INVALID_RED (zero_tests_discovered)`). This is the standing tooling gap already recorded for 01-03, 03-02 (twice), 05-31 and 05-32; the orchestrator's dispatch note pre-authorised manual verification, recorded above.
- `pnpm turbo test` still bails on `packages/orchestration-adapter`'s empty suite, and `apps/worker/src/poll-loop.test.ts` is flaky under parallel workspace load — both flagged by the orchestrator as known repo conditions, not this plan's to fix. Whole-workspace signal was taken with `--no-bail` and the worker suite re-run in isolation (21/21).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **G-05-P1 is closed** and proven three ways: unit cases over the scorer, a 40-scene sweep through the real handoff flow with the shipped furniture, and the live composited canvas.
- **05-34 (G-05-P2, interaction slots) is unblocked and needs no test edits here.** Every scene test derives its speaker from `bubbleText`/`bubbleTextPartnerId` rather than a tile, and the scorer reads the frame's actual characters, glyphs and furniture — so moving handoff senders to fixed aisle slots changes which candidate wins, not whether the properties hold. The 40-scene sweep will re-prove them at the new positions automatically.
- **One thing worth knowing when planning 05-34:** with senders on aisle rows 6/7 rather than seat rows, the "below" candidate becomes viable again for many scenes (row 6 has no desk under it when row 8 is clear), so the mix of chosen candidates will shift. The sweep's non-vacuity counters will catch it if the desk-avoidance branch ever stops being exercised.
- Nothing in the event path, the FSM, `STATUS_MAP`, the dialogue templates/caps or the pass order was touched. Colours, font, box height and padding are unchanged, so every 05-13/05-28/05-29 guard still measures what it measured.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-23*

## Self-Check: PASSED

All five modified files exist on disk; all three task commits (`fdd8403`, `f995bed`, `3028b78`) are present in git history. Measured commit count from the plan ledger (`fbd21fc..HEAD`) is 3, matching the `actuals.commits` frontmatter. No stubs, TODOs, skipped tests or unrun `<verify>` commands were introduced — both plan-level verification commands were run and both passed.

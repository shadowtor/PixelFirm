---
phase: 05-pixel-office-renderer
plan: 35
subsystem: ui
tags: [canvas, handoff, dialogue, accessor, vitest, hit-testing]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer
    provides: "05-33's per-frame dialogue placement record (lastDialoguePlacements) — the single source of the rect the renderer actually drew"
  - phase: 05-pixel-office-renderer
    provides: "05-34's fixed aisle interaction slots, which is the sender position the new tests render at"
  - phase: 05-pixel-office-renderer
    provides: "05-04's handoff record map / title registry (registerTaskTitle / getTaskTitle) and 05-29's 12-code-point title cap"
provides:
  - "getActiveHandoffs(): for every live handoff — taskId, the UNTRUNCATED title, fromAgentId, toAgentId, phase, the id of the agent whose bubble currently shows the line (or null), and that bubble's rect in canvas backing-store px from the last rendered frame (or null)"
  - "getDialogueBox(agentId): a copy of the bubble fill rect the renderer drew for that agent last frame, read off 05-33's existing placement record rather than a second map"
  - "Both re-exported from the pixel-office package index, with the ActiveHandoff type"
  - "A read-only guarantee proven by test: mutating a returned entry changes neither the next call nor the FSM"
affects: [ceo-dashboard, stream-overlay, handoff-hover-ui]

actuals:
  tokens: 4824
  tasks: 2
  commits: 3
plan_head_before: 5a48fbfd2514bf4c72faed60c639790bb5031a14

tech-stack:
  added: []
  patterns:
    - "Host read path as a poll-once accessor: no event subscription, no per-bubble id scheme, no UI — the smallest surface that answers 'which task is this bubble, and where is it'"
    - "A geometric accessor reads the renderer's own per-frame record, never a parallel copy — so a host can never hit-test a rect the renderer did not draw"
    - "Read-only by construction: fresh plain objects per call, with the immutability asserted by a tamper test rather than promised in a doc comment"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "getDialogueBox reads 05-33's framePlacements instead of adding the plan's second module-level box map (plan-checker advisory) — one source for the drawn rect, so a host's hit-test target is by construction the rect the renderer filled"
  - "speakerId is derived from a live bubbleText === requestedText/acceptedText comparison, not from the phase alone — a line the FSM already cleared or a newer record overwrote correctly has no speaker and no box"
  - "The sender branch also applies 05-19's senderIsCurrent identity rule, so a re-seated sender's stale Character object can never be reported as the speaker"
  - "No hover, click, event subscription or per-bubble id scheme was added — G-05-P4 asks for a read path, and a host polling once per interaction is enough for the hit-test"

patterns-established:
  - "Accessor-over-record: expose a copy of an existing per-frame record rather than instrumenting the draw pass a second time"
  - "Tamper test as the immutability proof: mutate every field of a returned entry, then assert both the next call and the FSM are unchanged"

requirements-completed: [HANDOFF-02]

coverage:
  - id: D1
    description: "getActiveHandoffs() returns the untruncated 30-code-point title for a live handoff whose bubble shows the 12-code-point cut label, together with taskId, both agent ids, phase ICON_VISIBLE, speakerId 'agent-a' and a box deep-equal to the DIALOGUE_BOX_COLOR fill rect a real rendered frame recorded"
    requirement: "HANDOFF-02"
    verification:
      - kind: integration
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#returns the full title while the bubble shows the cut one, with the drawn box rect"
        status: pass
    human_judgment: false
  - id: D2
    description: "The entry follows the FSM sequence: after the completion event plus one rendered frame the phase is RETURNING_TO_DESK with speakerId 'agent-b' and the accepted bubble's fill rect; once the sender is home the handoff is absent"
    requirement: "HANDOFF-02"
    verification:
      - kind: integration
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#follows the sequence: the receiver becomes the speaker, then the record is gone"
        status: pass
    human_judgment: false
  - id: D3
    description: "While the sender is still walking (before arrival) the entry reports phase WALKING_TO_RECEIVER with speakerId null and box null — no bubble is on screen, so no rect is claimed"
    requirement: "HANDOFF-02"
    verification:
      - kind: integration
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#while the sender is still walking there is no speaker and no box"
        status: pass
    human_judgment: false
  - id: D4
    description: "fullTitle falls back to the taskId when no title has been registered — the same value the bubble interpolates"
    requirement: "HANDOFF-02"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#falls back to the taskId when no title was registered"
        status: pass
    human_judgment: false
  - id: D5
    description: "The accessor is read-only (T-05-35-02): mutating a returned entry's phase, fullTitle, speakerId and box.x leaves the next call's result and the handoff FSM (the sender still waiting with its own line) unchanged"
    requirement: "HANDOFF-02"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#is read-only: mutating a returned entry changes neither the next call nor the FSM"
        status: pass
    human_judgment: false
  - id: D6
    description: "The bubble is unchanged: MAX_DIALOGUE_TITLE_CHARS is still 12, the templates and the bubble geometry are untouched, and handoff-choreography.ts still carries zero network/LLM call surface (HANDOFF-02's mechanical grep)"
    requirement: "HANDOFF-02"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/dialogue-templates.test.ts#handoff-choreography.ts contains none of the forbidden substrings"
        status: pass
      - kind: integration
        ref: "pnpm --filter pixel-office test — 183/183 including 05-29's cap tests and 05-33's 40-scene placement sweep"
        status: pass
    human_judgment: false
  - id: D7
    description: "The new exports compile through the host unchanged (App.tsx not modified), and 05-UI-SPEC.md records in both the Copywriting length-rule row and the UI Considerations long-text row that the cap is on the label rather than the data, and that hover/click/dashboard surfacing is deferred past Phase 5"
    verification:
      - kind: other
        ref: "pnpm --filter web typecheck (exit 0)"
        status: pass
      - kind: other
        ref: "grep -n \"05-35\" .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md (2 matches: length rule 150, long-text 173)"
        status: pass
    human_judgment: false

# Metrics
duration: 10 min
completed: 2026-09-23
status: complete
---

# Phase 05 Plan 35: Host Read Path for Live Handoffs Summary

**`getActiveHandoffs()` now hands a host the untruncated task title, both agents, the phase and the on-canvas rect of the bubble the renderer actually drew last frame — so the 12-character label stays short without the full title being lost, and a later hover, click or dashboard has something to hit-test against.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-23T10:33:00Z
- **Completed:** 2026-09-23T10:43:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- **G-05-P4 closed with a read path, not a UI.** The full title was never actually discarded — `registerTaskTitle`/`getTaskTitle` have held it since 05-04, and `dialogue-templates.ts` only cuts it at interpolation time. What was missing was any way for a host to learn *which* task and agents an on-screen bubble belongs to. `getActiveHandoffs()` answers exactly that, for every live handoff, and nothing more: no hover, no click handler, no event subscription, no per-bubble id scheme. A host polls it once per interaction.
- **The rect is the box the renderer filled, not a recomputed one.** The plan asked for a new module-level `Map` of dialogue boxes in `renderer.ts`; the plan-checker advisory correctly pointed out that 05-33 already records every frame's placements in `framePlacements` (exposed as `lastDialoguePlacements()`). `getDialogueBox(agentId)` is a five-line lookup and copy off that record. One source means a host's hit-test target is by construction the rect that was painted — the same class of bug 05-33's `glyphPlacement()` unification removed for the scorer.
- **`speakerId` is observed, not inferred from the phase.** A record in `ICON_VISIBLE` names its sender as speaker only while that sender's `bubbleText` still equals the record's own `requestedText`; a `RETURNING_TO_DESK` record names the receiver only while its `bubbleText` still equals `acceptedText`. So a line the FSM already cleared, or one a newer record overwrote, reports `speakerId: null` and `box: null` rather than a rect for a bubble nobody is showing. The sender branch also applies 05-19's `senderIsCurrent` identity rule, so a re-seated sender's stale `Character` is never reported.
- **The read-only guarantee (T-05-35-02) is asserted, not promised.** The tamper test mutates `phase`, `fullTitle`, `speakerId` and `box.x` on a returned entry, then asserts the next call returns the original values *and* that the FSM is untouched (`isWaitingHandoffSender` still true, the sender's line unchanged).
- **The bubble is provably unchanged.** `MAX_DIALOGUE_TITLE_CHARS` is still 12, the templates and every geometry constant are untouched, and the tests pin the cut label positively: the sender's `bubbleText` contains the 12-code-point `"Refactor th…"` and does **not** contain the 30-code-point full title the accessor returns. 05-29's cap tests, 05-33's 40-scene placement sweep and HANDOFF-02's forbidden-substring grep over `handoff-choreography.ts` are all still green.

## Task Commits

1. **Task 1 (RED): failing tests for the host read path** — `38f628f` (test)
2. **Task 1 (GREEN): `getDialogueBox`, `ActiveHandoff`, `getActiveHandoffs` and the index re-exports** — `5103b4d` (feat)
3. **Task 2: the UI-SPEC copy note** — `7911d92` (docs)

_No REFACTOR commit: the GREEN diff is a single `find`-and-copy in the renderer and one loop in the choreography, with the type already named — nothing was left to clean up. Per `tdd.md`, REFACTOR commits only on change._

## Files Created/Modified

- `packages/pixel-office/src/engine/renderer.ts` — `getDialogueBox(agentId)`, a copy of the matching entry in 05-33's `framePlacements`
- `packages/pixel-office/src/handoff/handoff-choreography.ts` — the `ActiveHandoff` type and `getActiveHandoffs()`, plus the `getDialogueBox` import (the renderer does not import this file, so no cycle is added)
- `packages/pixel-office/src/index.ts` — `getActiveHandoffs` and the `ActiveHandoff` type re-exported beside the existing handoff re-exports
- `packages/pixel-office/src/handoff/handoff-choreography.test.ts` — the `host read path (05-35, G-05-P4)` describe: six cases driven through the real FSM and a real `renderScene` frame
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — the Copywriting length-rule row and the UI Considerations long-text row both record that the cap is on the label, where the full title lives, and that its UI is deferred

## Decisions Made

- **The advisory won over the plan's literal instruction.** The plan's `<action>` says "a module-level `Map<string, {x,y,w,h}>` of the dialogue boxes drawn in the latest frame, cleared at the start of renderScene's dialogue pass and set in drawDialogue" — which is a verbatim description of `framePlacements`, added by 05-33 three plans earlier. Building it again would have created two records of the same thing that could drift; the accessor reads the existing one instead. No behaviour differs, and the plan's own `<behavior>` (box deep-equal to the recorded fill rect) is what the test asserts either way.
- **`DIALOGUE_BOX_COLOR` is the test's handle on the drawn rect.** The recording ctx keeps only `fillRect` calls made while `fillStyle` is that colour. 05-13 chose the dialogue colours to be achromatic and absent from every sprite, glyph, floor and wall palette, and `renderer.test.ts` guards that — so each captured rect is exactly one bubble's box fill. The test therefore compares the accessor against the *painted* geometry rather than against `resolveDialogueBox`'s return value, which is what "the box the renderer drew" has to mean for a hit-test.
- **Comments were written around HANDOFF-02's grep.** `dialogue-templates.test.ts` greps `handoff-choreography.ts` for `fetch(`, `anthropic`, `openai`, `claude-agent-sdk` and `http` case-insensitively. The new doc comments describe a host read path and canvas hit-testing without any of those substrings — notably no URL-shaped examples, which is the easy way to break that test with prose alone.
- **The information-disclosure disposition (T-05-35-01) was left as `accept`, unchanged.** The accessor exposes to the page a title that page already receives in full through the snapshot and `task.created` events. Stream-safe filtering of titles is Phase 7 (SAFE-01/02) and must land server-side; this accessor neither helps nor hinders that, and no public overlay consumes it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's second box map would have duplicated 05-33's placement record**

- **Found during:** Task 1 (before RED)
- **Issue:** The plan's `<action>` directs a new module-level `Map` of drawn dialogue boxes in `renderer.ts`. `framePlacements` — added by 05-33 and read by its 40-scene sweep through `lastDialoguePlacements()` — already is that record, keyed by `speakerId` and reset at the start of the same dialogue pass. Two independent records of one frame's geometry can disagree, and the one a host hit-tests against would be the one no existing test asserts equals the drawn fill.
- **Fix:** `getDialogueBox(agentId)` returns a copy of the matching `framePlacements` entry. No second map, no new write site in `drawDialogue`. The plan-checker's iteration-2 INFO advisory called for exactly this.
- **Files modified:** `packages/pixel-office/src/engine/renderer.ts`
- **Verification:** The test asserts `box` deep-equals the `DIALOGUE_BOX_COLOR` fill rect the ctx recorded for that frame, so the accessor's rect is pinned to the painted one rather than to either record. 183/183 green, including 05-33's own sweep, which asserts the recorded box equals the drawn fill.
- **Committed in:** `5103b4d`

---

**Total deviations:** 1 auto-fixed (1 bug, avoided in implementation rather than repaired after)
**Impact on plan:** None on scope, behaviour or the plan's `<behavior>` assertions — the accessor's contract is identical, sourced from one record instead of two. Strictly less code than the plan specified.

## TDD Gate Compliance

| Task | Gate | Commit | Status |
|------|------|--------|--------|
| 1 (tracer) | RED | `38f628f` `test(05-35)` | Pass — 6 named target tests failed, 177 unrelated green |
| 1 (tracer) | GREEN | `5103b4d` `feat(05-35)` | Pass — 183/183 |
| 1 (tracer) | REFACTOR | — | Not needed; no commit made |
| 2 | n/a | `7911d92` `docs(05-35)` | `type="auto"`, not a TDD task |

**Manual RED evidence, Task 1** (target tests failing on assertions about the planned behaviour, ruling out syntax, discovery and fixture failures — `gsd check tdd-red-evidence` cannot certify RED on this Vitest repo, see Issues):

```
host read path (05-35, G-05-P4) > exports getActiveHandoffs
  — handoff-choreography must export getActiveHandoffs: expected 'undefined' to be 'function'
host read path > returns the full title while the bubble shows the cut one, with the drawn box rect
  — expected [] to deeply equal [ { taskId: 'task-1', … } ]
host read path > follows the sequence: the receiver becomes the speaker, then the record is gone
  — expected [] to deeply equal [ { taskId: 'task-1', … } ]
host read path > while the sender is still walking there is no speaker and no box
  — expected [] to deeply equal [ { box: null, phase: 'WALKING_TO_RECEIVER', speakerId: null, … } ]
host read path > falls back to the taskId when no title was registered
  — expected undefined to be 'task-1'
host read path > is read-only: mutating a returned entry changes neither the next call nor the FSM
  — Cannot set properties of undefined (setting 'phase')
Tests  6 failed | 177 passed (183)
```

The RED run is strong evidence rather than a mere nonzero exit: every failure is an assertion (or a property access on the empty result) inside the six named target tests, all 177 unrelated tests stayed green, and the accessor was reached through `await import(...)` (the 05-34/05-33/05-10 precedent) so its absence surfaced as `expected 'undefined' to be 'function'` rather than an ESM link crash. The walking case's diff is the clearest: the expected object was printed in full while the received value was `[]` — the FSM and the render harness both ran, only the read path was missing.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter pixel-office test` (plan verification 1) | **183/183 passed** (8 files) — up from 177, net +6 |
| `pnpm --filter web typecheck` (plan verification 2) | **exit 0** |
| `pnpm turbo test` (whole workspace) | **10/10 tasks successful** |
| `pnpm --filter web test -- --run` | 23/23 passed (3 files) — nothing downstream moved |
| `npx tsc --noEmit -p packages/pixel-office` | no error in any file this plan touched (only the pre-existing repo-wide `TS2835` noise and two pre-existing `TS18046`s in `status-mapping.test.ts`) |
| `grep -n "getActiveHandoffs" packages/pixel-office/src/index.ts` (Task 1 criterion) | line 41, match |
| `grep -n "05-35" .../05-UI-SPEC.md` (Task 2 criterion) | 2 matches (length rule 150, long-text 173) |
| HANDOFF-02 no-network-surface grep over `handoff-choreography.ts` | pass — the new comments contain none of the five forbidden substrings |
| Post-commit deletion check on all three commits | no deletions |

Task 1's own acceptance criteria both hold: the new describe failed before the change (6/6) and passes after it, the full suite is green including the HANDOFF-02 surface test and 05-29's cap tests, and the index grep matches. Task 2's both hold: `pnpm --filter web typecheck` exits 0 with `App.tsx` unchanged, and the UI-SPEC grep finds the note in both rows.

**Tracer feedback gate (Task 1, `type="tracer"`):** the task carries no `gate="blocking-human"`, the run is interactive, `workflow.human_verify_mode` is `end-of-phase`, and the tracer's `<verify>` carries only `<automated>` — so per `checkpoints.md`'s precedence chain row 3 the verify was re-run end to end (183/183) and expansion continued without synthesizing a checkpoint.

## Issues Encountered

- `gsd check tdd-red-evidence` cannot certify RED on this Vitest repo (its record parser wants camelCase keys and `node --test` TAP summary lines Vitest never emits). This is the standing tooling gap already recorded for 01-03, 03-02 (twice), 05-31, 05-32 and 05-33; the orchestrator's dispatch note pre-authorised manual verification, recorded above.
- The two pre-existing `TS18046` errors in `packages/pixel-office/src/status/status-mapping.test.ts` and the repo-wide `TS2835` (`moduleResolution: nodenext` wants explicit `.js` extensions in `packages/event-schema` and `packages/company-core`) are untouched and out of scope per the orchestrator's dispatch note. No new type error was introduced by this plan — confirmed by filtering `tsc --noEmit` output to this plan's files.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **G-05-P4 is closed.** The 12-code-point label is intact and the full title, both participants, the phase and the drawn bubble's canvas rect are all reachable from one read-only accessor, proven through the real FSM and a real rendered frame.
- **Phase 6's CEO dashboard is the natural first consumer.** It needs precisely this shape — which bubble belongs to which task — and `box` is in backing-store px, which equals the CSS box (05-21), so a `pointerdown` offset hit-tests against it with no scaling maths. Nothing in this plan presumes how that UI is built.
- **One thing worth knowing.** `box` reflects the LAST rendered frame, so a host must poll after a frame has been drawn (the tests render explicitly before reading). A handoff read before any `renderScene` call reports `box: null` even at `ICON_VISIBLE` — correct, since no bubble has been painted yet, but it is the trap a future hover implementation will hit if it polls on mouse-move without a frame having run.
- Nothing in the event path, the FSM, `STATUS_MAP`, the dialogue templates/caps, the bubble geometry or the render pass order was touched. Every 05-13/05-28/05-29/05-33/05-34 guard still measures what it measured.
- This is the last plan of Phase 5; the phase's regression gate and verifier run next.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-23*

## Self-Check: PASSED

All five modified files exist on disk. All three task commits (`38f628f`, `5103b4d`, `7911d92`) are present in git history. Measured commit count from the plan ledger (`5a48fbf..HEAD`) is 3, matching the `actuals.commits` frontmatter; `plan_head_before` records the base so `/gsd-verify-work` can re-measure on the same instrument. No stubs, TODOs, FIXMEs, skipped tests or unrun `<verify>` commands were introduced — both plan-level verification commands were run and both passed, plus `pnpm turbo test` (10/10) as the whole-workspace signal.

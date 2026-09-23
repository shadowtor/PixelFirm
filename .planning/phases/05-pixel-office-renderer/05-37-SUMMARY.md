---
phase: 05-pixel-office-renderer
plan: 37
subsystem: ui
tags: [pixel-office, handoff, fsm, typescript, vitest, tdd, gap-closure]

# Dependency graph
requires:
  - phase: 05-34
    provides: fixed aisle interaction slots (interactionSlotsFor) and the Chebyshev-1 occupancy rule this plan widens
  - phase: 05-35
    provides: getActiveHandoffs()/ActiveHandoff — the host read path whose speaker attribution this plan corrects
  - phase: 05-19
    provides: senderIsCurrent identity rule and retireHandoff as the single record exit
provides:
  - "Character.bubbleTextTaskId — the identity stamp naming which handoff record's line bubbleText currently holds"
  - "showsLineOf — the single definition of dialogue-line ownership, used by the read path and all three clear paths"
  - "clearLine — nulls text, partner id and stamp together so a stamp never outlives its text"
  - "A handoff's aisle slot reserved for the record's whole lifetime, departure included, released only at retireHandoff"
affects: [06-ceo-dashboard, phase-6-handoff-consumers]

actuals:
  tokens: 31135
  tasks: 2
  commits: 4
  plan_head_before: cd4e20f34101af9da142b1310d4f7556b46ec44e

tech-stack:
  added: []
  patterns:
    - "Identity stamps over string equality: a writer records WHICH record a piece of derived UI state belongs to, so a byte-identical value written by a different record can never be mistaken for it"
    - "One predicate, every consumer: the read path and the clear paths route through the same ownership function so they cannot drift"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/types.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "interactionTileFor reserves a handoff target for the record's whole lifetime, RETURNING_TO_DESK included — the record flips phase and the character to WALK on the same tick, so a phase-exempted target is a tile still physically occupied on screen (WR-08)"
  - "Character.bubbleTextTaskId stamps line ownership; showsLineOf is the single identity predicate for both the read path and all three clear paths, so colliding capped titles can never make two records claim one bubble (WR-07)"
  - "speakerText and the getDialogueBox(speakerId, speakerText) lookup are left exactly as they were — that comparison is CR-01's frame-freshness guard, a different property from speaker identity"
  - "The 05-13 'newer line' test was updated rather than worked around: it wrote bubbleText alone and leaned on the string differing, which is precisely the contract WR-07 says is unsound"

patterns-established:
  - "Collision fixtures assert the collision: the two titles are proven byte-identical through resolveHandoffDialogue inside the test, so a change to MAX_DIALOGUE_TITLE_CHARS cannot silently stop the case testing the property"
  - "Reservations are bounded by their owning record, never by a phase — every widened reservation ships with a boundedness case proving the resource returns"

requirements-completed: [HANDOFF-01, HANDOFF-02]

coverage:
  - id: D1
    description: "A handoff's interaction slot stays reserved for the whole record, departure included — a second request arriving while the first sender walks home is never handed the tile that sender is standing on (WR-08 / HANDOFF-01)"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#a departing sender keeps its aisle slot reserved until it is home"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reservation is bounded by the record, not permanent — once retireHandoff removes the record the slot is available to the next sender again"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#the slot is free again once the record retires"
        status: pass
    human_judgment: false
  - id: D3
    description: "getActiveHandoffs identifies its speaker by record identity — two live handoffs whose lines cap to the same text resolve at most one speaker; the overwritten record reports speakerId null and box null (WR-07 / HANDOFF-02)"
    requirement: "HANDOFF-02"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#only the record whose line the receiver is actually showing reports a speaker and a box"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#a sender's colliding re-request leaves exactly one record claiming that sender's bubble"
        status: pass
    human_judgment: false
  - id: D4
    description: "The same identity rule governs the clear paths — retiring or completing a handoff clears a line only when that line belongs to that record, so a newer identical-looking line survives"
    requirement: "HANDOFF-02"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#retiring a record clears a line only when that line is its own"
        status: pass
    human_judgment: false
  - id: D5
    description: "Nothing 05-33 / 05-34 / 05-35 proved regresses: MAX_DIALOGUE_TITLE_CHARS is still 12, getActiveHandoffs still returns fresh read-only plain objects, the fixed aisle slot preference order and Chebyshev-1 spacing are unchanged, the four-candidate bubble scorer is untouched"
    verification:
      - kind: unit
        ref: "pnpm --filter pixel-office test (196 passed, 8 files — includes all 7 of 05-35's getActiveHandoffs cases and the 4 named 05-34 slot cases)"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#stays read-only with the stamp in play: mutating a returned entry changes neither the stamps nor the next call"
        status: pass
      - kind: other
        ref: "pnpm --filter web typecheck (clean — the new optional field breaks no consumer)"
        status: pass
    human_judgment: false

duration: 18 min
completed: 2026-09-23
status: complete
---

# Phase 05 Plan 37: WR-07 / WR-08 Gap Closure Summary

**Speaker attribution is now an identity check against a `bubbleTextTaskId` stamp instead of a dialogue-text comparison, and a handoff's aisle slot stays reserved until its sender is actually home.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-23T03:52:00Z
- **Completed:** 2026-09-23T04:10:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- **WR-08 closed.** `interactionTileFor`'s `taken` construction no longer exempts `RETURNING_TO_DESK` records. A completion flips the record's phase and the character to `WALK` on the same tick, so the old exemption freed a tile the sender was still standing on — a concurrent request could be handed the occupied slot, reproducing exactly the "two agents stacked 16 px apart" reading G-05-P2 was raised to eliminate. The reservation now ends at `retireHandoff` and nowhere else, and a second test proves the slot comes back so the widened reservation cannot strand aisle slots.
- **WR-07 closed at the root, not just at the reported symptom.** The reviewer flagged `getActiveHandoffs`, but the same string-equality identity governed `retireHandoff`'s two clears and the completion branch's sender clear — so a record could also *wipe* another record's identical-looking line. One new optional `Character` field (`bubbleTextTaskId`), one predicate (`showsLineOf`) and one clear helper (`clearLine`) replace four string comparisons and three three-field clears. Read path and clear paths now share a single definition and cannot drift.
- **The collision is asserted, never assumed.** Both new fixtures compute their two lines through `resolveHandoffDialogue` and assert byte-identity inside the test, so raising `MAX_DIALOGUE_TITLE_CHARS` cannot silently turn these cases into no-ops.
- **Suite grew 190 → 196 with nothing weakened.** All seven of 05-35's `getActiveHandoffs` cases and all four named 05-34 slot cases still run and pass; `pnpm --filter web typecheck` and `pnpm --filter web test` are clean.

## Task Commits

1. **Task 1: Reserve a handoff's aisle slot for the whole record (WR-08)** — `f983373` (test, RED) → `d5d205a` (feat, GREEN)
2. **Task 2: Identify the speaker by record identity (WR-07)** — `be74d92` (test, RED) → `06b462b` (feat, GREEN)

No REFACTOR commit for either task: both GREEN implementations are already the minimal shape (one deleted boolean clause; one field plus two helpers), so there was nothing to clean up.

## Files Created/Modified

- `packages/pixel-office/src/types.ts` — adds `Character.bubbleTextTaskId`, documented as written only alongside `bubbleText` and existing so a record can recognise its own line.
- `packages/pixel-office/src/handoff/handoff-choreography.ts` — deletes the `RETURNING_TO_DESK` exemption from `interactionTileFor`'s reservation set and corrects its docstring; adds `showsLineOf` and `clearLine`; routes both `getActiveHandoffs` branches and all three clear sites through them; stamps both write sites.
- `packages/pixel-office/src/handoff/handoff-choreography.test.ts` — two WR-08 cases in the `interaction tile` describe, a four-case `colliding dialogue lines (review WR-07)` describe in the host-read-path block, and one updated 05-13 case.
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — the 05-34 slot rule gains a `**Corrected 05-37 (WR-08):**` clause stating that a live target includes a record whose sender is walking home.

## Decisions Made

- **Kept `speakerText` and the `getDialogueBox(speakerId, speakerText)` lookup untouched.** It is tempting to read the remaining text comparison as a leftover of the defect. It is not: that comparison is CR-01's frame-freshness guard against serving a rect from a frame that painted a different line. Identity answers *whose bubble this is*; freshness answers *whether the last frame drew it*. Collapsing them would silently re-open CR-01.
- **Kept the `record.requestedText !== null` / `record.acceptedText !== null` guards.** Redundant against the stamp, but `speakerText` feeds the box lookup and the plan pinned them.
- **The sender-side collision is structurally unreachable, and the test says so.** A character can be in only one walk, so a new request from a sender retires that sender's previous record *before* the new one can write a line — one sender can never hold two live records. The case is kept as a regression guard with the reasoning in-source rather than faked into a red test that could not honestly exist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated the 05-13 case that encoded the string-equality contract**

- **Found during:** Task 2 (GREEN)
- **Issue:** `leaves the receiver's line alone if it was replaced by a different string before the sequence ended` set `toChar.bubbleText = "a newer line"` directly and relied on that string differing from `task-1`'s accepted line. Under identity the stale stamp still named `task-1`, so the retiring record cleared it and the case went red. The test encoded the very contract WR-07 says is unsound — "a different string" is not "a different record", and a colliding title defeats it.
- **Fix:** the newer line is now written the way the only writer writes one — text, partner id and stamp together — and the case additionally asserts the stamp survives. Its name changed from "a different string" to "a different record" to say what it actually proves.
- **Files modified:** `packages/pixel-office/src/handoff/handoff-choreography.test.ts`
- **Verification:** `pnpm --filter pixel-office test` — 196 passed; the case is stronger than before (it now pins the stamp too).
- **Committed in:** `06b462b` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug — a test encoding the defect under repair).
**Impact on plan:** None on scope. The plan anticipated this shape for Task 1 ("if an existing case relied on the freed slot, it encoded the defect — update it"); the same reasoning applied to Task 2's clear path. No Task 1 case needed updating.

## Issues Encountered

- **Pre-existing, out of scope:** the plan's pure-consumer grep reports two matches in `packages/pixel-office/src` — `index.ts:89-90` (a comment asserting the absence of `Math.random`/`Date.now`) and `dialogue-templates.test.ts:79` (the forbidden-substring array belonging to the prohibition test itself). Both are the guard, not a violation; neither is a comment line, so a literal reading of `fails_when` flags them. Untouched by this plan, present before it, and not auto-fixed per the scope boundary.

## Verification Results

| Check | Result |
|---|---|
| `pnpm --filter pixel-office test` | 8 files, **196 passed** (baseline 190 + 6 new) |
| `pnpm --filter pixel-office test -- handoff-choreography` | 196 passed, name filter matched |
| `pnpm --filter web typecheck` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter web test` | 3 files, **24 passed** — 05-36's assertions unaffected |
| Four named 05-34 slot cases | all present in the verbose run and passing |
| Seven 05-35 `getActiveHandoffs` cases | all present in the verbose run and passing |
| `grep -n 'RETURNING_TO_DESK' handoff-choreography.ts` | phase union, phase-transition, `checkHandoffArrivals` arm, `getActiveHandoffs` branch, one docstring line — **none inside `interactionTileFor`'s `taken` construction** |
| `grep -n MAX_DIALOGUE_TITLE_CHARS dialogue-templates.ts` | still bound to `12` |
| `office-layout.json` / `officeLayout.ts` | byte-identical (`git status --short packages/pixel-office/src/layout/` empty) |

**Live harness deliberately not re-run.** Per the plan's own verification section, `scripts/verify-pixel-office-live.mjs` drives one handoff at a time and cannot observe a two-record collision or a same-tick slot contest. Both properties are proven by the real-update-loop unit tests, which is the surface that can actually reach them.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change at a trust boundary. `T-05-37-01` (spoofed speaker attribution) and `T-05-37-02` (cross-record line tampering) are the two `mitigate` rows this plan exists to close and are closed by D3/D4 above; `T-05-37-04` (slot exhaustion via the widened reservation) is mitigated by D2's boundedness case; `T-05-37-05` (pure-consumer) verified by grep; `T-05-37-SC` — no package-manager install occurred and no new import was added.

## Known Stubs

None. No hardcoded empty value, placeholder string, TODO or unwired data source was introduced.

## User Setup Required

None — no external service configuration required (`user_setup: []`).

## Next Phase Readiness

- Both review advisories that `05-VERIFICATION.md` recommended closing "before Phase 6 puts a real consumer on `getActiveHandoffs()`" are closed. Phase 6's CEO dashboard can hit-test `ActiveHandoff.box` without the risk of a rect attributed to the wrong task.
- `HANDOFF-01` and `HANDOFF-02` are marked complete in `REQUIREMENTS.md` (both ready — no sibling plan in this phase still declares them).
- Carried forward unchanged, from `05-VERIFICATION.md` / `05-REVIEW.md`: `IN-01`…`IN-08` remain info-level and unplanned. `IN-07` (`ActiveHandoff.phase` referencing the non-exported `HandoffPhase`) becomes real the first time a `.d.ts` is emitted; `IN-08` (`--passWithNoTests`) the first time `orchestration-adapter` gains runtime logic.
- Still outstanding for the phase, untouched here: the live proof (`scripts/verify-pixel-office-live.mjs`) has never been run end to end — human-verification item 1.

## Self-Check: PASSED

- `packages/pixel-office/src/types.ts` — FOUND
- `packages/pixel-office/src/handoff/handoff-choreography.ts` — FOUND
- `packages/pixel-office/src/handoff/handoff-choreography.test.ts` — FOUND
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — FOUND
- Commit `f983373` — FOUND
- Commit `d5d205a` — FOUND
- Commit `be74d92` — FOUND
- Commit `06b462b` — FOUND
- `git rev-list --count cd4e20f..HEAD` = 4, matching `commits: 4`

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-23*

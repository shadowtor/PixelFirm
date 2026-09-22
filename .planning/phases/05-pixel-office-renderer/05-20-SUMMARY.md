---
phase: 05-pixel-office-renderer
plan: 20
subsystem: pixel-office
status: complete
gap_closure: true
tags: [pixel-office, handoff, status-glyph, CR-01, WR-01, tdd]
requires: ["05-19"]
provides:
  - Character.statusBubble (stored status glyph)
  - applyBubble (single bubbleType writer)
  - senderIsCurrent (sender identity in every handoff phase)
affects: [apps/web office canvas]
tech-stack:
  added: []
  patterns: ["store the primary, derive the display (mirrors 05-19 restPose)"]
key-files:
  created: []
  modified:
    - packages/pixel-office/src/types.ts
    - packages/pixel-office/src/engine/characters.ts
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
key-decisions:
  - "Glyph precedence (A1): frozen status glyph wins, then handoff-task icon while waiting at a receiver, then the status glyph; applyBubble is the only bubbleType writer"
  - "A completion whose record's sender is gone or re-seated retires the record with no TYPE and no accepted line (A2, WR-01)"
requirements-completed: [OFFICE-01, OFFICE-03, HANDOFF-01]
duration: 15 min
completed: 2026-09-22
commits: 4
plan_head_before: a38fb20ebe5a5410a13a9f568494182195fd3ce8
actuals:
  tokens: 4100
  tasks: 2
  commits: 4
coverage:
  - deliverable: "Status glyph survives a handoff (TESTING/BLOCKED/WAITING_FOR_CEO, retire, order)"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#status glyph survives a handoff (05-20, review CR-01)"
        status: pass
  - deliverable: "Sender identity enforced in every handoff phase (WR-01 tick, same frame)"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#sender identity in every phase (05-20, review WR-01)"
        status: pass
      - kind: command
        ref: "node scripts/verify-pixel-office-live.mjs"
        status: pass
---

# Phase 5 Plan 20: Status glyph survives a handoff Summary

A handoff no longer erases the sender's status glyph: `Character.statusBubble` stores it, `applyBubble` derives the displayed bubble (frozen glyph > task icon while waiting > status glyph), and every handoff phase retires a record whose sender is no longer the character that started it.

## Accomplishments

- `types.ts`: new required `statusBubble: BubbleType | null`; `bubbleType` documented as derived, written only by `applyBubble`.
- `characters.ts`: `createCharacter` initialises `statusBubble: null`.
- `index.ts`: `upsertCharacterFromAgent` writes `statusBubble`, then `frozen`, then calls `applyBubble(ch)`; imports `applyBubble` in place of `isWaitingHandoffSender`.
- `handoff-choreography.ts`:
  - exported `applyBubble`, the only `bubbleType` writer; arrival, completion and retire call it;
  - `retireHandoff` deletes its record first and acts on `record.fromChar` only while `senderIsCurrent`;
  - completion moves phase to RETURNING_TO_DESK before restoring the glyph, and retires plus returns (no TYPE, no accepted line) when the sender is not current;
  - `checkHandoffArrivals` applies `senderIsCurrent` once at the loop top for all three phases, ICON_VISIBLE included.
- 7 new real-loop tests (5 CR-01, 2 WR-01), all driven through `stepOffice`, `upsertCharacterFromAgent` and `handleHandoffEvent`. No existing test edited (only line 8's import extended).

## Task Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1 | RED | 1c7a7dd | test(05-20): add failing CR-01 status-glyph handoff tests |
| 1 | GREEN | e0c9941 | feat(05-20): store status glyph, derive bubble through applyBubble (CR-01) |
| 2 | RED | 1a82fdf | test(05-20): add failing WR-01 sender-identity tests |
| 2 | GREEN | 02f39c3 | fix(05-20): apply sender identity in every handoff phase (WR-01) |

## TDD Gate Compliance

- Task 1 RED: `Tests 5 failed | 103 passed (108)`, failing exactly as predicted:
  - TESTING row: expected null to be 'testing'
  - BLOCKED row: expected 'handoff-task' to be 'blocked'
  - WAITING_FOR_CEO row: expected 'handoff-task' to be 'permission'
  - CR-01 retire: expected null to be 'testing'
  - CR-01 order: expected 'testing' to be 'handoff-task'
- Task 1 GREEN: `Tests 108 passed (108)`.
- Task 2 RED: `Tests 2 failed | 108 passed (110)`: WR-01 tick "expected true to be false", WR-01 same frame "expected 'type' not to be 'type'".
- Task 2 GREEN: `Tests 110 passed (110)`.
- Tracer gate (Task 1): verify re-run in auto mode passed; expanded to Task 2.

## Verification

- `npx vitest run --root packages/pixel-office`: 110 passed (110).
- `pnpm --filter web test`: 18 passed (18).
- `pnpm --filter web typecheck`: exit 0.
- Grep gates: `statusBubble: BubbleType | null` 1; `statusBubble: null` 1; `export function applyBubble` 1; `applyBubble(` in FSM 4; non-comment `bubbleType =` writes in FSM 1, in index.ts 0; `applyBubble(ch)` in index.ts 1; `statusBubble =` in index.ts 1, in FSM 0; `handoffs.delete` 1; `function senderIsCurrent` 1; `senderIsCurrent(` 4; `getCharacter(record.fromAgentId)` 1; `export function isWaitingHandoffSender` 1; `finishWalk` from the 05-17 block to EOF 0.
- `git diff --numstat ba5d203 -- ...test.ts`: after Task 1 `64 0`; after Task 2 `101 1` (the one removed line is line 8's import, which Task 2 extends by design).
- Live proof, verbatim:
  - `[live-proof] TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion`
  - `[live-proof] TRUTH 5 PASS — 2647 dialogue-box px + 971 text px at x 0..282, y 0..12, above the speaker's sprite (top 24), cleared after the sequence`
  - `LIVE PROOF: PASS`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Next Phase Readiness

Gap truth 11 (review CR-01) and advisory WR-01 are closed. Phase 5 is ready for re-verification.

## Self-Check: PASSED

- All five modified files exist; commits 1c7a7dd, e0c9941, 1a82fdf, 02f39c3 present in `git log`.

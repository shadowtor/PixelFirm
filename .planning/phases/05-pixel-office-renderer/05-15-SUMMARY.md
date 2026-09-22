---
phase: 05-pixel-office-renderer
plan: 15
subsystem: claude-adapter
tags: [runtime, concurrency, ownership-token, gap-closure, vitest]
status: complete

requires:
  - phase: 05-11
    provides: "record.inFlight supersede branch (CR-03) in runQuery"
  - phase: 05-12
    provides: "wave ordering (depends_on)"
provides:
  - "TaskRecord.currentRun ownership token + closure-local isCurrent() in runQuery"
  - "Guards at finally, message loop, watchdog (x2), role-poll tick, canUseTool, Notification hook"
  - "Multi-invocation test block (Tests A-E) with abort-respecting and chatty stream doubles"
  - "requestHandoff comment points at deferred-items.md instead of Phase 6"
affects: [05-16, verify-phase-05, phase-06-planning]

actuals:
  tokens: 4200
  tasks: 2
  commits: 4
plan_head_before: 5a016860179ad061922c9d84524835433b63e960

tech-stack:
  added: []
  patterns:
    - "Per-invocation ownership token: per-invocation code writes shared record state only when record.currentRun === its own token"

key-files:
  created: []
  modified:
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts

key-decisions:
  - "Ownership guard lives in runQuery's per-invocation callbacks, never inside the public requestReview (it has no invocation identity)"
  - "A superseded invocation's canUseTool denies every tool, classified or not, so an orphan cannot keep acting in the worktree"

patterns-established:
  - "isCurrent() guard: any async per-invocation writer checks ownership first, and again after any await that can outlast a supersede"

requirements-completed: [OFFICE-01]

coverage:
  - id: D1
    description: "At most one un-aborted, unfinished query() per task across three successive runQuery calls against non-graceful streams"
    requirement: OFFICE-01
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test A: three successive runQuery calls against non-graceful streams never overlap two live query() streams"
        status: pass
    human_judgment: false
  - id: D2
    description: "Superseded watchdog, late result, role poll and query() callbacks leave the successor's status/session/events alone"
    requirement: OFFICE-01
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test B/C/D/E (superseded invocations describe)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Single-invocation behaviour unchanged"
    verification:
      - kind: unit
        ref: "pnpm --filter claude-adapter test (32 passed, 3 skipped integration)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-22
---

# Phase 05 Plan 15: Superseded-Invocation Ownership Guard Summary

**runQuery now tags each invocation with a fresh `currentRun` token; the finally block, message loop, watchdog, role poll, canUseTool and Notification hook of a superseded invocation can no longer clear the successor's in-flight flag, fabricate a status, request CEO approval or keep polling (closes 05-VERIFICATION gap 4 / review CR-02).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-22T02:02Z
- **Completed:** 2026-09-22T02:06Z
- **Tasks:** 2 (both TDD, RED then GREEN)
- **Files modified:** 2

## Accomplishments

- `TaskRecord.currentRun` ownership token + `isCurrent()`; `inFlight = false` only runs for the owner, so a third sendMessage/resumeTask always stops the live successor before calling `query()` again.
- The same guard at the five sibling writers: loop `continue`, watchdog early return (before and after the graceful-stop wait), self-clearing role poll, `canUseTool` deny, Notification hook no-op.
- requestHandoff comment corrected: no ROADMAP phase owns a real handoff trigger, pointer to `deferred-items.md`.

## Task Commits

1. **Task 1 RED: Test A** - `9315fcd` (test) - failed with received `[0, 0, 1]` vs expected `[0, 0, 0]`, 27 other tests passing
2. **Task 1 GREEN: ownership token** - `bf13033` (fix)
3. **Task 2 RED: Tests B-E** - `47ae6fe` (test) - B: status `blocked`; C: posted `failed`; D: 6 `observeGsdState` calls; E: status `waiting_for_review`; Test A + 27 pre-existing passing
4. **Task 2 GREEN: guards at five more sites + comment** - `0eb8d2a` (fix)

## TDD Gate Compliance

RED commits (`9315fcd`, `47ae6fe`) precede their GREEN commits (`bf13033`, `0eb8d2a`); each RED failed on its own assertion, not a load error.

## Files Created/Modified

- `packages/claude-adapter/src/claude-code-runtime.ts` - currentRun token, isCurrent() at 7 sites, requestHandoff comment
- `packages/claude-adapter/src/claude-code-runtime.test.ts` - new "superseded invocations" describe: abortableQuery, recordingQuery, chattyQuery helpers, Tests A-E

## Acceptance Checks

- `grep -c 'isCurrent()'` = 7; `record.status = "waiting_for_review"` still one unguarded write in requestReview
- `orchestration territory` count 0; `deferred-items.md` count 1
- env filter `key !== "ANTHROPIC_API_KEY"` untouched (WR-02 out of scope)
- typecheck: no errors besides pre-existing TS2835

## Deviations from Plan

None - plan executed exactly as written. (Test E's first failing assertion is the `getStatus` = `waiting_for_review` check; the posted `ceo.approval_requested` events are asserted after it.)

## Issues Encountered

A `block-no-verify` PreToolUse hook false-positived on a chained `git commit ... && grep -n` command; split into separate calls. No `--no-verify` was used.

## Next Phase Readiness

Ready for 05-16. WR-02 (env filter strips only one auth variable) remains routed to `/gsd-code-review 05 --fix`.

## Self-Check: PASSED

- Both modified files exist; commits 9315fcd, bf13033, 47ae6fe, 0eb8d2a present in `git log`.
- `pnpm --filter claude-adapter test`: 32 passed, 3 skipped, 0 failed.

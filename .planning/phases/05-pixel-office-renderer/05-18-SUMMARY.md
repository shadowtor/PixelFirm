---
phase: 05-pixel-office-renderer
plan: 18
subsystem: claude-adapter
status: complete
gap_closure: true
tags: [claude-adapter, runtime, concurrency, pause, cancel, CR-01]
requires: ["05-16"]
provides:
  - "runQuery claims its ownership token before the preemption await and re-checks it after (last caller wins)"
  - "pauseTask/cancelTask claim a fresh token before their graceful stop"
affects: [claude-adapter runtime, Phase 6 callers of sendMessage/resumeTask/pauseTask/cancelTask]
tech-stack:
  added: []
  patterns: ["claim-before-await ownership token with post-await re-check"]
key-files:
  created: []
  modified:
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
decisions:
  - "runQuery claims record.currentRun before awaiting a prior invocation's graceful stop; a superseded waiter returns without calling query() (last caller wins)"
  - "pauseTask/cancelTask assign record.currentRun = {} before attemptGracefulStop so a pending preemption can never undo a human stop"
metrics:
  duration: 5min
  completed: 2026-09-22
  tasks: 2
  files: 2
actuals:
  tokens: 2450
  tasks: 2
  commits: 4
plan_head_before: 3a7f4e7842fea60f7d2bfbe8f63130f93e605b12
commits: 4
---

# Phase 5 Plan 18: Overlapping runQuery / pause / cancel ownership race (CR-01) Summary

The token is now claimed before the preemption wait and checked again after it. Two sendMessage calls in the same tick now start exactly one new query(), using the last caller's prompt. A pause or cancel that lands during a pending preemption now holds.

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Two overlapping sendMessage calls start exactly one new query() | 23048dc (RED), 4b762e4 (GREEN) | claude-code-runtime.ts, claude-code-runtime.test.ts |
| 2 | Pause/cancel during a pending preemption stays paused/cancelled | c196117 (RED), 1fe95de (GREEN) | claude-code-runtime.ts, claude-code-runtime.test.ts |

## TDD Gate Compliance

- Test F RED (23048dc): `liveAtStart` was `[0, 0, 1]` against the expected `[0, 0, 0]`. That is 3 query() calls, the same as the verifier's reproduction. The other 32 tests passed in the same run.
- Test F GREEN (4b762e4): 33 passed, 3 skipped.
- Test G RED (c196117): both cases (pauseTask and cancelTask) failed with "expected to be called 1 times, but got 2 times". The other 33 tests passed.
- Test G GREEN (1fe95de): 35 passed, 3 skipped.

## Verification

- `pnpm --filter claude-adapter test -- claude-code-runtime`: 35 passed, 3 skipped (integration).
- In runQuery, `record.currentRun = invocation` (line 148) comes before `await attemptGracefulStop(record)`. `if (!isCurrent()) return;` sits between that await and `new AbortController()`.
- `grep -c "record.currentRun = {}"` returns 2. One is in pauseTask and one in cancelTask, each before that method's graceful stop.
- The diff has no line touching `env:` (WR-05 is not addressed here).
- `pnpm --filter claude-adapter typecheck` exits non-zero. The cause is the known pre-existing TS2835 blocker in `../event-schema` and `../company-core` (it has been in STATE.md since 05-01). The claude-adapter files themselves have 0 type errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test isolation] Role-poll Test 6 depended on a leftover mock value**
- **Found during:** Task 2 GREEN
- **Issue:** `vi.clearAllMocks()` does not drop queued `mockResolvedValueOnce` values. Role-poll Test 5 leaves one "QA" value queued. Before this change, cancel's 5 s grace period let one more poll tick run, which used up that value. Now cancel claims a fresh token, so that tick clears itself, which is the intended behaviour: no polling after a stop. As a result the leftover value leaked into Test 6. Run on its own, Test 6 passed.
- **Fix:** The role-poll describe's `beforeEach` now calls `observeGsdState.mockReset()`.
- **Files modified:** packages/claude-adapter/src/claude-code-runtime.test.ts
- **Commit:** 1fe95de

## Known Stubs

None.

## Self-Check: PASSED

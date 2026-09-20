---
phase: 04-agentruntime-claudecoderuntime
plan: 02
subsystem: orchestration
tags: [agent-runtime, claude-agent-sdk, watchdog, session-resume, tdd, vitest]

# Dependency graph
requires:
  - phase: 04-agentruntime-claudecoderuntime
    provides: "Plan 04-01's ClaudeCodeRuntime scaffold (startTask/getStatus, tasks Map, event-emitter) that this plan's runQuery refactor extracts and extends"
provides:
  - "runQuery shared internal helper (private, claude-code-runtime.ts) — the single for-await message loop startTask/resumeTask/sendMessage all call"
  - "pauseTask/resumeTask/sendMessage — real, non-stub implementations via session capture and query() resume"
  - "cancelTask — graceful-interrupt-then-hard-kill (D-03) using the same attemptGracefulStop mechanism pauseTask uses, terminal status cancelled instead of paused"
  - "createWatchdog(timeoutMs, onTimeout) + DEFAULT_WATCHDOG_TIMEOUT_MS (packages/claude-adapter/src/watchdog.ts) — D-04's bounded-silence hang detector, zero SDK dependency"
  - "watchdog wired into runQuery: reset on every message of any type, cleared on every loop exit path, fires the blocked transition (distinct from an explicit cancel) on genuine silence"
affects: [04-03, 04-04, "any future AgentRuntime implementation (RUNTIME-05)"]

# Actuals (#2632)
actuals:
  tokens: 5600
  tasks: 2
  commits: 4
plan_head_before: 5c457dda7470bfe001a1462c7b6bf4efa0e24682

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory function (not class) for createWatchdog, matching claude-code-runtime.ts/poll-loop.ts's function-first style"
    - "Single shared runQuery(taskId, prompt, resumeSessionId?) helper replacing per-method duplicated for-await loops — startTask/resumeTask/sendMessage all funnel through it; pauseTask/cancelTask act on the stored controller/handle instead"
    - "attemptGracefulStop(record) — one shared graceful-then-timeout-race helper used identically by pauseTask, cancelTask, and the watchdog's onTimeout callback, differing only in the terminal status each caller sets afterward (paused / cancelled / blocked)"

key-files:
  created:
    - packages/claude-adapter/src/watchdog.ts
    - packages/claude-adapter/src/watchdog.test.ts
  modified:
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts

key-decisions:
  - "Query.interrupt() (sdk.d.ts line 2685, interface Query extends AsyncGenerator<SDKMessage, void>) is the SDK's graceful-interrupt mechanism, resolving Assumption A2/Open Question #2 — but sdk.d.ts documents every Query control method, interrupt() included, as 'only supported when streaming input/output is used.' This codebase's runQuery calls query({ prompt: string, ... }) with a plain string prompt (not an AsyncIterable), so interrupt() is called best-effort (wrapped in try/catch) but is not guaranteed to have any effect for this call shape — the actual termination guarantee is the Promise.race(runPromise, sleep(GRACEFUL_TIMEOUT_MS)) grace period + AbortController.abort() hard-kill fallback, not the interrupt() call itself."
  - "pauseTask and cancelTask share one attemptGracefulStop(record) helper (interrupt-then-race-against-grace-period), differing only in the terminal status set afterward (paused vs cancelled) — matches the plan's key_link that pause and cancel are the same mechanism with a different terminal status."
  - "runQuery sets in-memory status to 'running' when the init system message is captured (previously unused AgentTaskStatus member) — needed so pauseTask/sendMessage's 'mid-stream'/'running' preconditions are literally observable via getStatus(), not just implied. No event is emitted for this transition (only 'starting' and the final terminal status emit task.status_changed), preserving Plan 04-01's original 'exactly two status_changed events per startTask run' test."
  - "GRACEFUL_TIMEOUT_MS (5000ms) is defined once in claude-code-runtime.ts during Task 1 (pauseTask needs it) and reused as-is by Task 2's cancelTask and the watchdog's onTimeout callback — not redefined per call site."

patterns-established:
  - "attemptGracefulStop as the one shared 'ask nicely, then guarantee termination within a bounded window' primitive — any future terminal-status transition that needs to stop an in-flight query() (a hypothetical future requestHandoff-triggered stop, for example) should reuse it rather than re-implementing the race."

requirements-completed: [RUNTIME-02]

coverage:
  - id: D1
    description: "pauseTask ends the in-flight query() turn via the discovered graceful mechanism (or the abort fallback), captures session_id, sets status paused"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 1: pauseTask on a mid-stream task ends the turn gracefully and sets status to paused"
        status: pass
    human_judgment: false
  - id: D2
    description: "resumeTask starts a new query() with options.resume set to the captured session_id and the fixed continuation prompt, reusing runQuery"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 2: resumeTask after pause calls query() again with resume set to the captured session_id; success completes the task"
        status: pass
    human_judgment: false
  - id: D3
    description: "sendMessage sends the caller's exact message as the new turn's prompt via runQuery, resuming the session; never leaves status stuck on paused"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 3: sendMessage on a running task sends the caller's exact message as the new prompt, resuming the session"
        status: pass
    human_judgment: false
  - id: D4
    description: "resumeTask/sendMessage reject rather than silently starting a fresh unrelated session when no session_id has been captured"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 4: resumeTask/sendMessage reject when no session has been captured, rather than starting a fresh unrelated session"
        status: pass
    human_judgment: false
  - id: D5
    description: "cancelTask attempts graceful stop first; hard-aborts via AbortController if the grace period elapses; status becomes cancelled either way"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 4: cancelTask hard-kills a hung task within the grace period, resulting in status cancelled"
        status: pass
    human_judgment: false
  - id: D6
    description: "watchdog resets on every message of any type and fires exactly once on genuine bounded silence, transitioning status to blocked (distinct from an explicit cancel)"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/watchdog.test.ts (3 boundary-timing cases, all pass)"
        status: pass
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 5: a genuinely silent query() stream triggers the watchdog, transitioning status to blocked (not cancelled)"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-09-20
status: complete
---

# Phase 04 Plan 02: pauseTask/resumeTask/sendMessage/cancelTask + Watchdog Summary

**All six real (non-stub) `AgentRuntime` control methods now live on `ClaudeCodeRuntime`: `pauseTask`/`resumeTask`/`sendMessage` via a shared `runQuery` message loop and session-capture resume, `cancelTask`'s graceful-interrupt-then-hard-kill, and a `createWatchdog` bounded-silence timer that surfaces a genuinely hung task as `blocked` within 100 seconds.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-09-20
- **Tasks:** 2/2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `runQuery(taskId, prompt, resumeSessionId?)` — the single shared for-await message loop `startTask`/`resumeTask`/`sendMessage` all call; Plan 04-01's original `startTask`/`getStatus` tests still pass unchanged after the extraction
- `pauseTask`/`resumeTask`/`sendMessage` — real implementations: `pauseTask` ends the in-flight turn via `attemptGracefulStop` and captures `session_id`; `resumeTask` starts a new `query()` with `options.resume` and the exact continuation prompt from 04-RESEARCH.md's Pattern 2; `sendMessage` does the same with the caller's own message as the prompt
- `cancelTask` — graceful stop first via the same `attemptGracefulStop` helper `pauseTask` uses, `AbortController.abort()` hard-kill if the grace period elapses, status `cancelled` either way
- `packages/claude-adapter/src/watchdog.ts` — `createWatchdog(timeoutMs, onTimeout)` factory + `DEFAULT_WATCHDOG_TIMEOUT_MS = 100_000`, zero dependency on `@anthropic-ai/claude-agent-sdk`; wired into `runQuery` so a silent stream is surfaced as `blocked` (never left showing "running" forever) — this plan's own PITFALLS.md-named verification requirement
- Resolved Assumption A2 (04-RESEARCH.md Open Question #2): `Query.interrupt()` exists (`sdk.d.ts` line 2685) but is documented as streaming-input-only — see Key Decisions below for the practical implication on this codebase's string-prompt call shape

## Task Commits

Each task followed RED→GREEN TDD discipline (2 commits per task, 4 total):

1. **Task 1: pauseTask/resumeTask/sendMessage via shared runQuery helper**
   - `68f16d7` — `test(04-02): add failing tests for ClaudeCodeRuntime pause/resume/sendMessage` (RED — 3 genuine failures, 1 trivial pass via pre-existing stub)
   - `fe107fe` — `feat(04-02): implement ClaudeCodeRuntime.pauseTask/resumeTask/sendMessage via shared runQuery helper` (GREEN — 8/8 passing)
2. **Task 2: cancelTask + watchdog.ts bounded-silence timer**
   - `84a76a9` — `test(04-02): add failing tests for watchdog and cancelTask hard-kill` (RED — both suites fail to import, watchdog.ts didn't exist yet)
   - `d10458e` — `feat(04-02): implement watchdog bounded-silence timer and cancelTask graceful-then-hard-kill` (GREEN — 13/13 passing)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `packages/claude-adapter/src/watchdog.ts` — `createWatchdog`/`DEFAULT_WATCHDOG_TIMEOUT_MS`, generic timer utility
- `packages/claude-adapter/src/watchdog.test.ts` — 3 boundary-timing cases using vitest fake timers (never-fires-while-reset, fires-exactly-once-at-boundary, clear-prevents-firing)
- `packages/claude-adapter/src/claude-code-runtime.ts` — `runQuery` extraction, `attemptGracefulStop`, real `pauseTask`/`resumeTask`/`sendMessage`/`cancelTask`, watchdog wiring
- `packages/claude-adapter/src/claude-code-runtime.test.ts` — 6 new Behavior cases (4 from Task 1, 2 from Task 2) plus 3 new mock-generator helpers (`pausableQuery`, `hangingQuery`, `silentQuery`) simulating graceful-vs-ungraceful `interrupt()` response and genuine silence

## Decisions Made

See `key-decisions` in frontmatter above (Query.interrupt() streaming-only caveat, shared attemptGracefulStop helper, "running" status addition, GRACEFUL_TIMEOUT_MS single-definition location).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a "running" AgentTaskStatus transition on init-message capture**
- **Found during:** Task 1 (writing sendMessage's "on a running task" Behavior test)
- **Issue:** `AgentTaskStatus` already defines `"running"` (orchestration-adapter/src/types.ts) but Plan 04-01's code never set it — a task sat at `"starting"` from the moment `startTask` was called until the terminal result, with no way to distinguish "not yet begun" from "actively mid-turn." Task 1's own Behavior text describes pauseTask/sendMessage acting "on a running task" / "mid-stream," which has no literal observable status without this.
- **Fix:** `runQuery` now sets `record.status = "running"` when the init system message is captured (in-memory only, no event emitted, preserving Plan 04-01's "exactly two status_changed events per startTask run" test).
- **Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`
- **Verification:** `claude-code-runtime.test.ts`'s original Test 2 (exactly two status_changed events) still passes; new Test 3 explicitly asserts `getStatus()` returns `"running"` mid-stream.
- **Committed in:** `fe107fe` (Task 1 GREEN commit)

**2. [Rule 2 - Missing Critical] pauseTask hard-aborts on grace-period timeout, not just cancelTask**
- **Found during:** Task 1 (implementing pauseTask)
- **Issue:** The plan's Task 1 action text for pauseTask says "await the task's runPromise (or a short timeout, whichever comes first)" without explicitly stating a hard-abort fallback (that language appears only in Task 2's cancelTask spec) — but if pauseTask marks a task "paused" while the underlying query() is still actually running, the loop could still yield a later result message and silently flip status back to completed/failed after the caller believes the task is paused, violating the Core Value's "never fabricate state."
- **Fix:** `pauseTask` shares the same `attemptGracefulStop` helper as `cancelTask` — if the grace period elapses without a clean exit, `pauseTask` also calls `controller.abort()` before setting status `paused`, guaranteeing the underlying stream actually stops.
- **Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`
- **Verification:** Test 1 (pause mid-stream) exercises the graceful path; the shared helper's grace-period-then-abort behavior is separately proven by Task 2's cancelTask Test 4.
- **Committed in:** `fe107fe` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical functionality)
**Impact on plan:** Both additions are lifecycle-correctness fixes implied by the plan's own must-haves (D-03's "graceful stop" pattern, the "mid-stream"/"running" language in Behavior tests) rather than scope creep — no new files, no new public API surface beyond what the plan specified.

## Issues Encountered

- `sdk.d.ts` documents `Query.interrupt()` (and every other Query control method) as "only supported when streaming input/output is used" — this codebase's `query({ prompt: string, ... })` call shape uses a plain string prompt, not an `AsyncIterable`, so `interrupt()` is not guaranteed to have any real effect against the actual SDK in production. This does not block RUNTIME-02 (the `attemptGracefulStop` → grace-period-race → hard-abort fallback is the real termination guarantee, and `interrupt()` is called best-effort, wrapped in try/catch, with no assumption it succeeds) but is worth flagging: a future plan wanting a *reliably* clean graceful stop (not just "eventually forced to stop") would need to switch `runQuery` to the SDK's streaming-input mode (`prompt: AsyncIterable<SDKUserMessage>`) to make `interrupt()` actually supported. Not attempted here — out of this plan's scope (D-01 explicitly restricts CLI-subprocess/alternate-mode changes to "a specific, identified SDK gap," and the current fallback already satisfies D-03's bounded-termination requirement).
- `npx turbo run test` surfaced two pre-existing, out-of-scope failures unrelated to this plan's files: `orchestration-adapter#test` ("No test files found" — the package is a pure-type contract with no vitest files by design) and `api#test` (local test Postgres not running/reachable, matching STATE.md's already-tracked migration-race blocker). Logged to `.planning/phases/04-agentruntime-claudecoderuntime/deferred-items.md` per the deviation rules' scope boundary — not fixed, not caused by this plan.

## Next Phase Readiness

- All six of `ClaudeCodeRuntime`'s previously-stubbed methods (`pauseTask`/`resumeTask`/`cancelTask`/`sendMessage`) are now real; only `requestReview`/`requestHandoff` remain stubs, explicitly deferred to Plan 04-03 per Plan 04-01's original scope split.
- `attemptGracefulStop` and the watchdog's `createWatchdog` factory are both generic enough for Plan 04-03's `requestReview`/`requestHandoff` wiring to reuse if a future stop-on-signal need arises.
- No blockers for Plan 04-03.

---
*Phase: 04-agentruntime-claudecoderuntime*
*Completed: 2026-09-20*

## Self-Check: PASSED

All 6 claimed files (2 new, 4 modified/referenced) verified present on disk. All 4 commits
(`68f16d7` RED, `fe107fe` GREEN, `84a76a9` RED, `d10458e` GREEN) verified present in git log.

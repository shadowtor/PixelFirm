---
phase: 06-ceo-dashboard-approval-workflow
plan: 01
subsystem: approval-runtime
status: complete
tags: [ceo, canUseTool, event-schema, websocket, tdd, tracer]
requires: []
provides:
  - "WorkerDownlinkSchema / WorkerUplinkSchema / DecisionActionSchema wire contract"
  - "ceo.decision_made, ceo.decision_applied, ceo.approval_expired, ceo.task_resume_requested events"
  - "optional Phase 6 fields on ceo.approval_requested"
  - "createClaudeCodeRuntime option awaitDecision (parked canUseTool, D-01)"
  - "toPermissionResult, validateAnswers, CEO_PREFIX, CEO_PROTOCOL_APPEND"
  - "createDecisionBroker (bootId, awaitDecision, handleDownlink, pendingCount)"
affects: [06-02, 06-03, 06-04, 06-06, 06-13]
tech-stack:
  added: []
  patterns:
    - "Parked promise inside canUseTool, resolved by a host-injected decision source"
    - "Approve returns parked.input by reference; wire decisions carry only action/note/answers"
    - "Namespace imports in RED tests so missing exports fail on assertions, not ESM linking"
key-files:
  created:
    - packages/event-schema/src/downlink.ts
    - packages/claude-adapter/src/decision-mapping.ts
    - packages/claude-adapter/src/decision-mapping.test.ts
    - apps/worker/src/decisions.ts
    - apps/worker/src/decisions.test.ts
  modified:
    - packages/event-schema/src/payloads/index.ts
    - packages/event-schema/src/payloads/index.test.ts
    - packages/event-schema/src/index.ts
    - packages/event-schema/package.json
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
    - packages/claude-adapter/src/index.ts
key-decisions:
  - "The size check (16000 chars of JSON input) runs before anything is posted: an oversized call emits no waiting_for_review and no ceo.approval_requested, it is denied unparked"
  - "AskUserQuestion approve with missing or mismatched answers is a system deny without a [CEO:...] prefix"
  - "The broker resolves with only the keys present on the parsed frame (no undefined note/answers keys)"
requirements-completed: [CEO-03, CEO-04, CEO-05]
duration: 14 min
completed: 2026-09-24
plan_head_before: c344021f9b7e87e09a5ac2ab13f698a5d764bf51
actuals:
  tokens: 12450
  tasks: 2
  commits: 4
coverage:
  - deliverable: "Wire contract and additive ceo.* event contract"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/event-schema/src/payloads/index.test.ts#Phase 6 payloads / Phase 6 wire contract"
        status: pass
  - deliverable: "Parked canUseTool: PRIVATE request, allow by reference, typed deny, decision_applied, oversized deny, Phase 4 fallback"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#parked canUseTool (D-01)"
        status: pass
  - deliverable: "Worker decision broker resolving parked calls from WorkerDownlinkSchema frames"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/worker/src/decisions.test.ts#createDecisionBroker"
        status: pass
  - deliverable: "All five CEO actions mapped with notes, validated answers and CEO_PROTOCOL_APPEND"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/claude-adapter/src/decision-mapping.test.ts"
        status: pass
      - kind: test
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#CEO protocol system prompt (D-05/D-06)"
        status: pass
---

# Phase 6 Plan 01: Parked CEO Decision Round Trip Summary

**A classified tool call now parks inside `canUseTool` behind a PRIVATE `ceo.approval_requested` with a uuid `decisionId`. A `WorkerDownlinkSchema` decision frame on the worker's WebSocket resolves it exactly once through `createDecisionBroker`. Approve returns the parked input by reference. The other four actions deny with the locked `[CEO:...]` prefix plus the trimmed note, and every applied decision posts a PRIVATE `ceo.decision_applied`.**

## Performance

- Duration: 14 min (start 2026-09-24T01:52Z, end 2026-09-24T02:06Z)
- Tasks: 2 (a tracer and one expansion task), 4 commits
- Files: 5 created, 7 modified

## Accomplishments

- **Event contract (D-04):** `ceo.approval_requested` gained 16 optional fields, so stored Phase 4 `{ taskId, reason }` rows still parse. Four new members were appended after `agent.handoff_completed`, taking the union from 17 to 21.
- **Wire contract (SEC-03):** `downlink.ts` accepts only `decision` and `task.resume` messages. No message has a prompt, command or tool-input field, and extra keys such as `updatedInput` are stripped.
- **Runtime (D-01):** `awaitDecision` is an optional host hook. The order is: status `waiting_for_review`, then PRIVATE request, then park, then `toPermissionResult`, then status `running`, then PRIVATE `decision_applied` with `outcome`. Inputs over 16000 characters are denied without parking. If the await throws, the call is denied. A superseded invocation is denied after the await. Without `awaitDecision` the Phase 4 path is byte-for-byte the same, and its legacy `ceo.approval_requested` is now PRIVATE too.
- **Mapping (D-05/D-07):** `toPermissionResult` and `validateAnswers` are pure functions. `CEO_PROTOCOL_APPEND` goes on the `claude_code` preset system prompt only when `awaitDecision` is injected.
- **Worker broker:** `createDecisionBroker` resolves each decision once. It ignores unknown ids, malformed JSON, `task.resume` and unknown message types, and an abort rejects the parked call and removes it.

## Task Commits

| Task | Step | Commit | Message |
|------|------|--------|---------|
| 1 (tracer) | RED | a331609 | test(06-01): add failing tests for the parked CEO decision round trip |
| 1 (tracer) | GREEN | 9a86b1f | feat(06-01): park classified tool calls on a CEO decision from the worker WebSocket |
| 2 | RED | a8d2383 | test(06-01): add failing tests for CEO notes, question answers and the protocol prompt |
| 2 | GREEN | 2c0c83f | feat(06-01): map all five CEO actions with notes, validated answers and the protocol prompt |

No refactor commits were needed.

## TDD Gate Compliance

Every RED record was generated from vitest `--reporter=tap-flat` output. The `# tests/# pass/# fail` counters were derived from that same run's own `ok`/`not ok` lines (none invented), and each record returned **`RED_EVIDENCE_OK` (target_test_failed)** from `gsd_run check tdd-red-evidence`. The record needs camelCase `exitCode`/`targetTest`; that is why earlier plans got `invalid_record`.

| Run | Tests | Pass | Fail | Target failure |
|-----|-------|------|------|----------------|
| Task 1 event-schema `payloads` | 25 | 12 | 13 | `parses ceo.decision_made`: `expected false to be true` |
| Task 1 claude-adapter `claude-code-runtime` | 39 | 32 | 7 | approve test: `expected "vi.fn()" to be called 1 times, but got 0 times` |
| Task 1 worker `decisions` | 8 | 0 | 8 | `createDecisionBroker is not a function` (a new module: missing-export shape, loaded cleanly) |
| Task 2 claude-adapter `decision-mapping claude-code-runtime` | 60 | 52 | 8 | `request_changes` note: deny message mismatch |

Two RED-phase greens were expected, not a sign of weak RED:
- Some tests passed on the RED run as regression guards. These were the Phase 4 row still parsing, the non-email and unknown-outcome rejections, the no-`awaitDecision` system prompt check, and the `validateAnswers` throw cases (calling an undefined function throws). All of them assert real behaviour after GREEN.
- Task 1's RED commit included empty `downlink.ts`/`decisions.ts` stubs (`export {}`). Without them the new test files hit an ESM load failure, which counts as INVALID_RED.

## Verification

- `pnpm --filter event-schema test -- payloads`: 53 passed
- `pnpm --filter claude-adapter test -- claude-code-runtime` / `-- decision-mapping claude-code-runtime`: 63 passed, 3 skipped (the live integration file, which is skipped by design). The existing "Test 4" is unchanged and passes.
- `pnpm --filter worker test -- decisions`: 29 passed
- `pnpm --filter event-schema|worker|claude-adapter typecheck`: 0 errors. `api` and `web` typecheck: 0 errors.
- Plan-level: `event-schema` 53, `company-core` 46 and `web` 24 all pass, so replay of stored rows still parses.
- Acceptance greps: `"ceo.task_resume_requested"` count is 1. The four literals sit at lines 179-184, after `agent.handoff_completed` at l.176. `WorkerDownlinkSchema.safeParse` is in `decisions.ts` and `toPermissionResult(` is in the runtime.

## Deviations from Plan

**1. [Rule 3 - Blocking] Added a `typecheck` script to `packages/event-schema/package.json`**
- **Found during:** Task 1 verify
- **Issue:** The plan's verify runs `pnpm --filter event-schema typecheck`, but the package had no such script.
- **Fix:** Added `"typecheck": "tsc --noEmit"`, the same script the other packages use. It passes clean.
- **Commit:** 9a86b1f

**2. [Rule 2 - Correctness] The size check runs before any event is posted**
- **Found during:** Task 1
- **Issue:** The action text lists the post before the size check. Posting a request whose `toolInput` is over 16000 characters would fail the schema server-side and leave the task showing `waiting_for_review` for a call that never parks.
- **Fix:** Oversized input is denied before the status change or the request event. The test asserts that no `ceo.approval_requested` is posted.
- **Commit:** 9a86b1f

**3. [Test harness] The runtime test's `buildEnvelope` mock now forwards `visibility`**
- It was dropped before, so the PRIVATE assertions the plan requires could not be expressed. No existing assertion depended on it being absent.

**Total deviations:** 2 auto-fixed (1 blocking, 1 correctness) plus 1 test-harness adjustment. **Impact:** none on scope. The contracts match the plan's artifact list exactly.

## Issues Encountered

- `pnpm --filter api test` cannot run in this session: `ECONNREFUSED ::1:5434` (no local Postgres). This is environmental. api is not in this plan's verification, and `api typecheck` is clean against the grown union.

## Known Stubs

None that block this plan's goal. `createDecisionBroker().handleDownlink` is not yet connected to the ws-client message handler, and `task.resume` is parsed but ignored. The plan hands both to 06-04 on purpose.

## Threat Flags

None. All new surface was already in the plan's threat model: T-06-01-01, -06, -09 and -10 are mitigated with tests, and T-06-01-07 is accepted until 06-06.

## Next Phase Readiness

Ready for 06-02 (PreToolUse "ask" hook, watchdog suspension, abort/expiry events) and 06-13 (the control-plane half that sends `WorkerDownlinkSchema` frames). Interim note carried from the plan: until 06-06 lands, `broadcastToBrowsers` still relays PRIVATE `ceo.*` events to `/ws/browser`. Nothing deploys before 06-12.

## Self-Check: PASSED

- FOUND: packages/event-schema/src/downlink.ts, packages/claude-adapter/src/decision-mapping.ts, packages/claude-adapter/src/decision-mapping.test.ts, apps/worker/src/decisions.ts, apps/worker/src/decisions.test.ts
- FOUND commits: a331609, 9a86b1f, a8d2383, 2c0c83f

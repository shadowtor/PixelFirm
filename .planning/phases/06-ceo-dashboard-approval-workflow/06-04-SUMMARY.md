---
phase: 06-ceo-dashboard-approval-workflow
plan: 04
subsystem: worker, control-plane-api
status: complete
tags: [ceo, worker, websocket, reconcile, resume, d-02, sec-03, tdd]
requires: ["06-03", "06-05", "06-06"]
provides:
  - "apps/worker hosts createClaudeCodeRuntime with awaitDecision = broker.awaitDecision and workerBootId = broker.bootId"
  - "Worker env: WORKER_TASK_PROMPT, WORKER_AGENT_ID (required with a prompt), WORKER_TASK_ID (default randomUUID), WORKER_TASK_TITLE; WorkerEnv.task"
  - "decisions.ts: broker.helloMessage(), broker.onResume(handler), handleResume(msg, deps), ResumeMessage, ResumeDeps"
  - "apps/api/src/ws/worker-reconcile.ts: reconcileWorker(workerId, bootId, log)"
  - "/ws: accepts a WorkerUplinkSchema hello and ignores every other frame"
  - "POST /ceo/api/tasks/:taskId/resume (requireCsrf + requireCeo, 20/min): 202 | 404 unknown task | 409 not blocked / already resumed / not resumable | 503 worker offline"
affects: ["06-09", "06-10", "06-12", "06-14"]
tech-stack:
  added: ["claude-adapter (workspace link in apps/worker)"]
  patterns:
    - "Expire-then-block: task.status_changed blocked is inserted only by the hello whose ceo.approval_expired insert won the 0004 unique index, so repeat and concurrent hellos add nothing"
    - "Resume path check: path.resolve on both sides, lowercased on win32, against listWorktrees(repoPath)"
key-files:
  created:
    - apps/api/src/ws/worker-reconcile.ts
    - apps/api/src/routes/ceo-reconcile.test.ts
  modified:
    - apps/worker/package.json
    - pnpm-lock.yaml
    - apps/worker/src/env.ts
    - apps/worker/src/env.test.ts
    - apps/worker/src/index.ts
    - apps/worker/src/index.integration.test.ts
    - apps/worker/src/decisions.ts
    - apps/worker/src/decisions.test.ts
    - apps/api/src/routes/ws.ts
    - apps/api/src/routes/ceo.ts
key-decisions:
  - "A request with no workerBootId counts as a different boot and expires on any hello (the plan's 'or is absent')"
  - "Resume eligibility keys on the task's latest request that has a decisionId, by occurredAt; 'already resumed' means a ceo.task_resume_requested for the task after that request's expiry"
  - "handleResume passes the message's own worktreePath to restoreTask (the plan's 'message's values') once it has matched a listed worktree"
  - "pnpm install also deduped an unrelated transitive jose (6.2.12 -> 6.2.10); reverted so the lockfile change is the 3-line workspace link only, verified with --frozen-lockfile"
requirements-completed: [CEO-03, CEO-05, CEO-01]
duration: 18 min
completed: 2026-09-24
plan_head_before: c5d539c726fc6ef5429120b8f514097de5f85cb8
actuals:
  tokens: 12022
  tasks: 3
  commits: 6
coverage:
  - id: D1
    description: "Worker hosts ClaudeCodeRuntime with the broker, launches a task only from its env, and sends hello on connect"
    requirement: CEO-03
    verification:
      - kind: unit
        ref: "apps/worker/src/env.test.ts#env-launched task (06-04, SEC-03: env only, never argv)"
        status: pass
      - kind: unit
        ref: "apps/worker/src/decisions.test.ts#helloMessage() is a WorkerUplinkSchema hello carrying this broker's bootId"
        status: pass
      - kind: integration
        ref: "apps/worker/src/index.integration.test.ts#startWorker() emits schema-valid ... (first WS frame is a hello)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hello reconcile: a restarted worker's open requests expire (never approve), their tasks go blocked for the requesting agent, repeat hellos add nothing, a reconnect redelivers an unapplied decision"
    requirement: CEO-05
    verification:
      - kind: integration
        ref: "apps/api/src/routes/ceo-reconcile.test.ts#hello reconcile (D-02, 06-04) (6 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "CEO resume of an expired task: guarded route, audit row, task.resume with stored ids; worker resumes only a worktree of its own repo"
    requirement: CEO-01
    verification:
      - kind: integration
        ref: "apps/api/src/routes/ceo-reconcile.test.ts#POST /ceo/api/tasks/:taskId/resume (D-02, 06-04) (5 tests)"
        status: pass
      - kind: unit
        ref: "apps/worker/src/decisions.test.ts#handleResume (T-06-04-02: only a worktree of this worker's repo)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A real Claude Code session run by the worker parks a gated call, the CEO decides on the dashboard, and a worker restart mid-park ends in expiry and a resumable blocked task"
    verification: []
    human_judgment: true
    rationale: "Needs a live `claude` login and the deployed dashboard; the tests drive the broker, the reconcile and the resume route with a fake worker. Covered by the 06-14 e2e / live check."
---

# Phase 6 Plan 04: Worker-hosted gated runtime, restart reconcile and CEO resume Summary

**The worker now runs ClaudeCodeRuntime with the 06-01 broker as its decision source and says hello with its bootId on every connect. On a new bootId the control plane expires that worker's open requests (PRIVATE `ceo.approval_expired` worker_restarted) and blocks their tasks for the requesting agent, and it never approves anything. On the same bootId it resends any decision that was recorded but never applied. The CEO can resume an expired task with `POST /ceo/api/tasks/:taskId/resume`, and the worker resumes it only inside a worktree attached to its own repo.**

## Performance

- Duration: 18 min (start 2026-09-24T05:21:55Z, end 2026-09-24T05:39:58Z)
- Tasks: 3 (TDD, each RED then GREEN). Commits: 6
- Files: 2 created, 10 modified

## Accomplishments

- **Task 1, worker composition.** `startWorker` builds `createDecisionBroker()` and `createClaudeCodeRuntime({ ..., awaitDecision: broker.awaitDecision, workerBootId: broker.bootId })`. The `onOpen` callback sends `broker.helloMessage()` and routes each downlink frame to `broker.handleDownlink`. When the env names a task, the worker calls `runtime.startTask` with `worktreePath = repoPath` and does not await it; a failure is logged and the worker keeps running. The heartbeat and the poll loop are unchanged. The env keys are read from `process.env` only, never from argv. A prompt without `WORKER_AGENT_ID` fails at boot with a message that names that key.
- **Task 2, reconcile (D-02).** `reconcileWorker` selects the `ceo.approval_requested` rows stamped with the authenticated `workerId` that carry a `decisionId`, together with their made, applied and expired rows. It skips any request that is applied or expired. If the bootId differs or is absent, it inserts the expiry with a bare `onConflictDoNothing().returning()`. Only when that insert wins does it add `task.status_changed` blocked (INTERNAL, with the request's `sourceAgentId`), and it broadcasts both events. The office feed gets the blocked status and the CEO feed gets the expiry. If the bootId matches and a decision exists, it resends the decision frame. `/ws` safeParses each frame as a `WorkerUplinkSchema` hello and ignores everything else. The socket stays open.
- **Task 3, resume.** The route checks CSRF, then the CEO. It finds the task's latest request that has a decisionId (404 if there is none) and requires that request's expiry (409 not blocked). It rejects the call if a resume was already recorded after that expiry (409 already resumed). It needs a stored sessionId, worktreePath and sourceAgentId (409 not resumable) and a connected owner worker (503). It then inserts a PRIVATE `ceo.task_resume_requested { taskId, decidedBy }`, sends `task.resume { taskId, sessionId, worktreePath, agentId }` and broadcasts. On the worker, `broker.onResume` receives validated `task.resume` frames. `handleResume` compares normalised paths with `listWorktrees(repoPath)`. If there is a match it calls `restoreTask` and then `resumeTask`. It refuses the request and logs a line if the path is foreign, if listing fails, or if the task is still running.

## Task Commits

| Task | Gate | Commit | Message |
|------|------|--------|---------|
| 1 | RED | 04a4fa4 | test(06-04): add failing tests for the env-launched task, hello message and hello on connect |
| 1 | GREEN | 33f0bac | feat(06-04): the worker hosts ClaudeCodeRuntime with the decision broker and says hello |
| 2 | RED | 77859af | test(06-04): add failing tests for hello reconcile (expire on restart, redeliver on reconnect) |
| 2 | GREEN | 2405229 | feat(06-04): reconcile on hello, a restarted worker's requests expire and never approve (D-02) |
| 3 | RED | 20a3aaa | test(06-04): add failing tests for resuming an expired task and the worker's validated resume |
| 3 | GREEN | c7759b0 | feat(06-04): resume a blocked task from the dashboard, validated on the worker |

No refactor commits.

## TDD Gate Compliance

Each RED record came from `npx vitest run ... --reporter=tap-flat`. The `# tests/# pass/# fail` counters were counted from that same run's `ok`/`not ok` lines, and the record uses camelCase `exitCode`/`targetTest`. All four records returned **`RED_EVIDENCE_OK` (target_test_failed)**.

| Run | Tests | Pass | Fail | Target failure |
|-----|-------|------|------|----------------|
| Task 1 (apps/worker, all) | 34 | 29 | 5 | prompt without agent id: `promise resolved ... instead of rejecting` |
| Task 2 (ceo-reconcile) | 6 | 1 | 5 | `timed out waiting for ceo.approval_expired` |
| Task 3 API (ceo-reconcile) | 11 | 7 | 4 | resume after expiry: `expected 404 to be 202` (route not registered) |
| Task 3 worker (decisions) | 14 | 9 | 5 | foreign path: `handleResume is not a function` |

Some tests already passed during RED, and each stays as a regression guard: Task 2's "leaves a request with decision_applied alone" (nothing touched anything yet), and Task 3's "404 unknown task" (an unregistered route also answers 404).

## Verification

- `apps/worker`: `npx vitest run`, 5 files, 39 tests, pass. `npx tsc --noEmit` exit 0.
- `apps/api`: `npx vitest run` (full suite, Postgres on 5434) passed 122/122 on three runs in a row. `npx tsc --noEmit` exit 0. The first full run had one flaky failure in a 06-06 test (see Issues).
- `ceo-reconcile ceo-decisions` together: 2 files, 50 tests, pass.
- `pnpm install --frozen-lockfile` accepts the 3-line lockfile change.
- Acceptance greps: `"claude-adapter": "workspace:*"` is in apps/worker/package.json. env.test.ts asserts `toThrow("WORKER_AGENT_ID")`. The integration test parses the first WS frame with `WorkerUplinkSchema` and checks type `hello`. ceo-reconcile.test.ts asserts the expiry payload `{ decisionId, taskId, reason: "worker_restarted" }`, blocked `sourceAgentId` = AGENT_ID, expiry count 1 after repeat hellos, the redelivered frame `WorkerDownlinkSchema.parse(...)` equal to the original, the task.resume frame equal to the stored ids, and `decidedBy: DEV_CEO`. decisions.test.ts asserts restoreTask and resumeTask are called 0 times for a foreign path and once each for the other-slash, lower-case-drive path. `reconcileWorker(` is in routes/ws.ts and `task.resume` is in ceo.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lockfile kept to the workspace link**
- **Found during:** Task 1 GREEN
- **Issue:** `pnpm install` also deduped the MCP SDK's transitive `jose` from 6.2.12 to 6.2.10. The plan says the change is lockfile-only for the workspace link.
- **Fix:** Restored the lockfile, hand-added the 3-line `claude-adapter: link:../../packages/claude-adapter` importer entry and checked it with `pnpm install --frozen-lockfile`.
- **Commit:** 33f0bac

**2. [Rule 1 - Bug] Resume test helper was missing the JSON content-type**
- **Found during:** Task 3 GREEN
- **Issue:** `requireCsrf` requires `content-type: application/json`, and my RED helper didn't send it, so the route answered 403 for every call.
- **Fix:** The helper now sends the full D-12 header set and a `{}` body. The dashboard's fetch has to do the same.
- **Commit:** c7759b0

**Total deviations:** 2 auto-fixed (1 blocking, 1 test bug). **Impact:** no scope change.

## Issues Encountered

- `ws-browser.test.ts > GET /ceo/ws > first message is the decisions snapshot` (06-06) failed once in 4 full api runs and passed alone and in the next 3 full runs. Its row-count bracket retries while other files write `ceo.*` rows in parallel, and ceo-reconcile.test.ts adds more of those writes. Logged in `deferred-items.md`.
- A PreToolUse hook reads `grep -n` in the same command as `git commit` as a `--no-verify` bypass, so greps and commits ran as separate commands. Hooks were never bypassed.

## Known Stubs

None.

## Threat Flags

None. Every new surface is in the plan's threat model: T-06-04-01 (env-only start, closed downlink), T-06-04-02 (listWorktrees check, foreign-path test), T-06-04-03 (expire and block, never approve), T-06-04-04 (unique index plus single-resolve broker), T-06-04-05 (identity from the credential, other-worker test), T-06-04-06 (CSRF + requireCeo, 403 test).

## Next Phase Readiness

- 06-09/06-10 (dashboard History): the Resume button should POST `/ceo/api/tasks/:taskId/resume` with Origin, `X-PixelFirm-CSRF: 1`, `content-type: application/json` and a `{}` body. Expect 202, 409 `not blocked` / `already resumed` / `not resumable`, 503 `worker offline` or 404. The resulting `ceo.task_resume_requested` arrives on `/ceo/ws`, and `isResumable` (06-06) turns false from it.
- 06-12 (deploy): to run a gated task, start the worker with `WORKER_TASK_PROMPT` and `WORKER_AGENT_ID` (and optionally `WORKER_TASK_ID` and `WORKER_TASK_TITLE`). The worker needs a logged-in `claude` CLI on its host.
- A worker still does not persist tasks across restarts. After a restart, only a CEO resume brings a task back.

## Self-Check: PASSED

- FOUND: apps/api/src/ws/worker-reconcile.ts, apps/api/src/routes/ceo-reconcile.test.ts
- FOUND commits: 04a4fa4, 33f0bac, 77859af, 2405229, 20a3aaa, c7759b0. `git rev-list --count c5d539c..HEAD` = 6.

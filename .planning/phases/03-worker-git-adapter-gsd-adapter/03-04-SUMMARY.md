---
phase: 03-worker-git-adapter-gsd-adapter
plan: 04
subsystem: worker
tags: [ws, execa, gray-matter, fetch, vitest, tdd]

requires:
  - phase: 03-worker-git-adapter-gsd-adapter
    provides: "CompanyEventSchema's worker.heartbeat/git.worktree_observed/gsd.phase_observed payloads + apps/api's live connection-status derivation (03-01), packages/git-adapter's listWorktrees/isGitWorktree/isAnyClaudeProcessAlive (03-02), packages/gsd-adapter's observeGsdState (03-03) — this plan assembles all three into a real runnable process"
provides:
  - "apps/worker — a runnable Node process (pnpm --filter worker start) that validates a --repo/WORKER_REPO_PATH target, connects outbound-only to CONTROL_PLANE_URL, sends heartbeats, and runs a poll-diff loop emitting real git/GSD delta events"
  - "loadEnv(), computeBackoffDelay/connectWorker/startHeartbeat/startReconnectingConnection, buildEnvelope/postEvent, startPollLoop, startWorker — the phase's full public surface (see artifacts_produced in 03-04-PLAN.md)"
affects: []

actuals:
  tokens: 9200
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Poll-diff loop (D-01): closure-scoped last-seen state (Map<worktreePath, snapshot> + gsd snapshot), diffed tick-over-tick, emitting only genuine deltas — never on every tick regardless of change"
    - "stop() correctness for async loops: clearInterval() only stops FUTURE ticks — a `stopped` flag checked immediately before every postEvent call is required so an already in-flight tick (e.g. blocked on isAnyClaudeProcessAlive's slow subprocess call) can't still emit after stop() returns"
    - "isFirstTick baseline guard: the very first poll tick can never report `active: true` purely from freshly-discovered state (there is no 'previous tick' to have changed since) — otherwise tick 2 (genuinely unchanged) flips active false, violating 'a second identical tick emits zero events'"

key-files:
  created:
    - apps/worker/package.json
    - apps/worker/tsconfig.json
    - apps/worker/src/env.ts
    - apps/worker/src/env.test.ts
    - apps/worker/src/ws-client.ts
    - apps/worker/src/ws-client.test.ts
    - apps/worker/src/index.ts
    - apps/worker/src/event-emitter.ts
    - apps/worker/src/poll-loop.ts
    - apps/worker/src/poll-loop.test.ts
    - apps/worker/src/index.integration.test.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "startHeartbeat(controlPlaneUrl, token, companyId) carries a companyId param the plan's literal Task 1 signature omitted — a worker.heartbeat envelope's companyId is mandatory on event-schema's BaseEnvelope, so the 2-arg signature could never build a schema-valid envelope (Rule 3 fix)"
  - "Added apps/worker/src/env.test.ts, not in PLAN.md Task 1's file list — the plan's own acceptance_criteria require direct unit tests of --repo/WORKER_REPO_PATH precedence and worktree-rejection, which had no other home (Rule 2 fix)"
  - "poll-loop.ts's stop() sets a `stopped` flag checked before every postEvent call (not just clearInterval) — found via this plan's own integration test, which caught a genuine event-after-stop() bug (Rule 1 fix, see Deviations)"

requirements-completed: [RUNTIME-03, RUNTIME-04, WORKTREE-01, GSD-01]

coverage:
  - id: D1
    description: "apps/worker refuses to start when WORKER_REPO_PATH/--repo does not resolve to a real git worktree, naming the path in the error"
    requirement: "RUNTIME-03"
    verification:
      - kind: unit
        ref: "apps/worker/src/env.test.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "--repo takes precedence over WORKER_REPO_PATH when both are supplied; WORKER_TOKEN is read only from process.env, never accepted as a CLI arg"
    requirement: "RUNTIME-03"
    verification:
      - kind: unit
        ref: "apps/worker/src/env.test.ts (\"prefers --repo over WORKER_REPO_PATH\")"
        status: pass
    human_judgment: false
  - id: D3
    description: "Worker connects using the exact {workerId}.{secret} Bearer scheme against the derived ws(s)://.../ws URL; backoff delay is 1s-initial/doubling/30s-cap/20-50%-jitter and monotonically non-decreasing; the WS client reconnects after a forced socket close"
    requirement: "RUNTIME-04"
    verification:
      - kind: unit
        ref: "apps/worker/src/ws-client.test.ts (20 tests, including a real local ws-server reconnect-after-close test)"
        status: pass
    human_judgment: false
  - id: D4
    description: "One poll tick against a fixture repo + fixture .planning/STATE.md emits exactly one git.worktree_observed and one gsd.phase_observed event; a second identical tick emits zero new events; a third tick after HEAD advances emits exactly one new git.worktree_observed keyed by worktreePath; active is never true from process-liveness alone"
    requirement: "WORKTREE-01, GSD-01"
    verification:
      - kind: unit
        ref: "apps/worker/src/poll-loop.test.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real startWorker() process, run end-to-end against a stub control plane, emits schema-valid (CompanyEventSchema.safeParse) events carrying only structural payload keys, and stop() genuinely halts all timers with no further events"
    requirement: "RUNTIME-03, RUNTIME-04, WORKTREE-01, GSD-01"
    verification:
      - kind: integration
        ref: "apps/worker/src/index.integration.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live SyncSmith demo: a real worker pointed at F:/Sidegigs/syncsmith, connected to a deployed/local control plane with a freshly-issued WORKER_TOKEN, showing real git.worktree_observed/gsd.phase_observed events land and GET /admin/workers reports online"
    verification: []
    human_judgment: true
    rationale: "Requires a real credential issued via POST /admin/workers against a running control plane (this plan's user_setup step, gated by the task's own <precondition>) and a real /gsd-plan-phase invocation in a separate, live sibling project — genuine human-in-the-loop territory per this plan's own precondition, not something the executor should trigger unilaterally on another project's real planning state. Deferred to end-of-phase UAT consolidation per workflow.human_verify_mode=end-of-phase (config default)."

duration: ~35min
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 4: Worker Process Summary

**`apps/worker`: a runnable Node process combining packages/git-adapter and packages/gsd-adapter into a real poll-diff loop that emits schema-valid, delta-only CompanyEvents over the Phase 2 WS/POST-events pipeline, proven end-to-end against a stub control plane.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-20 (immediately following 03-03's completion)
- **Completed:** 2026-09-20
- **Tasks:** 3
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments
- `env.ts`: `loadEnv()` validates `CONTROL_PLANE_URL`/`WORKER_TOKEN`/`WORKER_COMPANY_ID` via Zod fail-fast, resolves `--repo`/`WORKER_REPO_PATH` (`--repo` wins per D-04), and validates the resolved path via git-adapter's `isGitWorktree` before proceeding — `WORKER_TOKEN` is read only from `process.env`, never argv (T-03-10)
- `ws-client.ts`: `computeBackoffDelay` implements D-03's exact 1s-initial/doubling/30s-cap/20-50%-jitter algorithm; `connectWorker` mirrors `apps/api/src/routes/ws-auth.test.ts`'s real client pattern (`Bearer {workerId}.{secret}` against the derived `ws(s)://.../ws` URL); `startHeartbeat` sends every 10s (matches `apps/api/src/ws/connection-status.ts`'s `HEARTBEAT_INTERVAL_MS`); `startReconnectingConnection` reconnects on close/error with backoff, proven against a real local `ws` server forcing a close
- `event-emitter.ts`: `buildEnvelope`/`postEvent` shared by both the heartbeat sender and poll loop, reusing `apps/api`'s already-tested `POST /events` path — a failed emit is logged, never thrown, so it can't crash either loop
- `poll-loop.ts`: `startPollLoop` maintains closure-scoped last-seen state (worktree `Map` keyed by path, never array index, plus a gsd snapshot), diffing tick-over-tick and emitting only genuine deltas; `active` is computed here (never inside `packages/gsd-adapter`, which stays a pure observer) as `processAlive && recentFileActivity`, never true from process-liveness alone (D-02, Pitfall 1)
- `index.ts`: `startWorker()` wires env + WS connection + heartbeat + poll loop into one importable/self-starting entrypoint (mirrors `apps/api/src/server.ts`'s `pathToFileURL` guard)
- Full-pipeline integration test (`index.integration.test.ts`): a real `startWorker()` run against a local stub HTTP+WS server proves schema-valid emission and clean `stop()` teardown, with zero real DB/apps/api dependency
- Found and fixed a real bug during that integration test: `stop()` didn't actually halt an already in-flight poll tick (blocked on the slow `isAnyClaudeProcessAlive` subprocess call), so an event could still arrive ~1s after `stop()` returned — fixed with a `stopped` flag checked immediately before every `postEvent` call

## Task Commits

Each task was committed atomically:

1. **Task 1: apps/worker scaffold — env validation (D-04), WS client with heartbeat + reconnect/backoff (D-03)** - `da7c4fb` (feat)
2. **Task 2: poll-loop.ts + event-emitter.ts — diff-and-emit loop combining git-adapter + gsd-adapter (D-01, D-02)** - `9dc28b8` (feat)
3. **Task 3: full-pipeline integration test + live SyncSmith demo (automated portion)** - `ad0575b` (test), `52dffbc` (test — reconnect backstop coverage)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/worker/package.json` - workspace package manifest (event-schema/git-adapter/gsd-adapter/ws/zod deps, execa devDep for test fixtures)
- `apps/worker/tsconfig.json` - mirrors apps/api's shape exactly
- `apps/worker/src/env.ts` - `loadEnv()`: Zod validation + async D-04 repo-path/worktree check
- `apps/worker/src/env.test.ts` - precedence + worktree-rejection unit tests
- `apps/worker/src/ws-client.ts` - `computeBackoffDelay`, `connectWorker`, `startHeartbeat`, `startReconnectingConnection`
- `apps/worker/src/ws-client.test.ts` - backoff bounds/monotonicity, connect header/URL, reconnect-after-forced-close
- `apps/worker/src/event-emitter.ts` - `buildEnvelope`, `postEvent`
- `apps/worker/src/poll-loop.ts` - `startPollLoop`: diff-and-emit loop, D-02's dual-signal `active`
- `apps/worker/src/poll-loop.test.ts` - tick-by-tick emission/no-op/delta behavior against a real temp-git fixture
- `apps/worker/src/index.ts` - `startWorker()` entrypoint wiring all four modules
- `apps/worker/src/index.integration.test.ts` - full-pipeline test against a local stub control plane
- `pnpm-lock.yaml` - `ws`, `zod`, `execa` (worker devDep) resolved/linked for apps/worker

## Decisions Made
- `startHeartbeat` carries a required `companyId` param beyond the plan's literal 2-arg signature — a `worker.heartbeat` envelope's `companyId` is mandatory on `event-schema`'s `BaseEnvelope`; the plan's signature could never build a schema-valid envelope without it
- Added `env.test.ts` (not in PLAN.md Task 1's `<files>`) to satisfy the plan's own acceptance criteria requiring direct precedence/rejection unit tests
- `poll-loop.ts`'s `isFirstTick` guard: the first-ever tick never reports `active: true` from baseline discovery alone — otherwise the second (genuinely unchanged) tick would compute `active: false`, flipping the payload and violating the plan's own "second identical tick emits zero events" requirement
- `stop()` on both `poll-loop.ts` and `ws-client.ts`'s heartbeat now checks a `stopped` flag immediately before `postEvent`, not just `clearInterval()` — required because an already-in-flight tick's slow subprocess call (`isAnyClaudeProcessAlive`) can otherwise still complete and emit after `stop()` returns

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a required companyId parameter to startHeartbeat**
- **Found during:** Task 1 (implementing the inline heartbeat envelope builder)
- **Issue:** The plan's literal signature is `startHeartbeat(controlPlaneUrl: string, token: string)`, but `event-schema`'s `BaseEnvelope.companyId` is a required (non-optional) field — a 2-arg signature could never construct a schema-valid `worker.heartbeat` envelope.
- **Fix:** Added `companyId: string` as a third required parameter; `index.ts` passes it from `loadEnv()`'s result.
- **Files modified:** `apps/worker/src/ws-client.ts`, `apps/worker/src/index.ts`
- **Verification:** `index.integration.test.ts` confirms every emitted `worker.heartbeat` event passes `CompanyEventSchema.safeParse`.
- **Committed in:** `da7c4fb` (Task 1), refactored in `9dc28b8` (Task 2)

**2. [Rule 2 - Missing Critical] Added apps/worker/src/env.test.ts**
- **Found during:** Task 1 (reviewing acceptance_criteria against the plan's file list)
- **Issue:** PLAN.md Task 1's `<files>` lists only `ws-client.test.ts`, but the task's own `acceptance_criteria` explicitly require "a direct unit test of the precedence logic" (--repo vs WORKER_REPO_PATH) and a worktree-rejection test — neither had a home in the listed files.
- **Fix:** Added `env.test.ts` covering both requirements plus the missing-repo-path case.
- **Files modified:** `apps/worker/src/env.test.ts` (new)
- **Verification:** 4/4 tests pass, all four acceptance_criteria bullets independently verified.
- **Committed in:** `da7c4fb`

**3. [Rule 1 - Bug] Fixed stop() not halting an already in-flight poll tick**
- **Found during:** Task 3 (writing the integration test's "no event arrives after stop()" assertion — it failed with a stray `gsd.phase_observed` arriving ~1s after `stop()`)
- **Issue:** `poll-loop.ts`'s `stop()` only called `clearInterval()`, which stops FUTURE ticks but does nothing for a tick already awaiting `isAnyClaudeProcessAlive()`'s subprocess call (slow relative to the rest of the tick's async work) — that in-flight tick still completed and posted an event after `stop()` returned, violating the task's own acceptance criterion ("no event arrives at the stub server after stop() is called").
- **Fix:** Added a `stopped` flag checked immediately before every `postEvent` call in `poll-loop.ts`'s `tick()`; applied the same defensive guard to `ws-client.ts`'s `startHeartbeat` for symmetry (lower risk there, since heartbeat has no slow await before its `postEvent` call, but cheap to make consistent).
- **Files modified:** `apps/worker/src/poll-loop.ts`, `apps/worker/src/ws-client.ts`
- **Verification:** `index.integration.test.ts`'s stop()-then-wait assertion passes; full `pnpm --filter worker test` (20/20) still green after the fix.
- **Committed in:** `ad0575b`

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 missing critical, 1 bug)
**Impact on plan:** All three fixes were necessary for correctness — the companyId fix makes heartbeat events schema-valid at all, the env.test.ts addition proves acceptance criteria the plan itself required, and the stop() fix closes a genuine "orphaned async work after stop()" bug the plan's own acceptance criteria specifically guards against. No scope creep — all three stayed within apps/worker's files.

## Issues Encountered

- Windows path-separator mismatch: `git worktree list --porcelain` always emits forward-slash paths (verified in 03-RESEARCH.md Pattern 3), while `os.tmpdir()`/`mkdtemp` return backslash paths on Windows — `poll-loop.test.ts`'s `sessionId` assertion normalizes the expected value (`repoPath.replace(/\\/g, "/")`) before comparing. Not a worker bug, a test-fixture-comparison detail.
- Transient Windows `EBUSY` on `fs.rm()` of a temp git-repo fixture immediately after `loop.stop()` — an in-flight tick's `execa`/`fs` calls can still be releasing OS file handles right when the next test's cleanup runs. Fixed with a short settle delay plus `fs.rm`'s own `maxRetries`/`retryDelay` in `poll-loop.test.ts`'s `afterEach`. Same class of issue as the `stop()` bug above, but purely a test-cleanup-timing concern, not a production code bug (the production `stop()` fix does not need to wait for in-flight OS handles to release — it only needs to prevent new network POSTs).
- `apps/api`'s DB-dependent tests (`events.test.ts`, `ws-auth.test.ts`, `admin-workers.test.ts`, `connection-lifecycle.test.ts`, `append-only.test.ts`) fail with `ECONNREFUSED 127.0.0.1:5434` — no test Postgres container running on this machine (same pre-existing environment precondition documented in 03-02/03-03's SUMMARYs). `apps/worker` has zero dependency on `apps/api` or a database; confirmed out of scope, not introduced by this plan. `worker` (20/20), `git-adapter` (8/8), `gsd-adapter` (19/19), `event-schema` (31/31), and `company-core` (19/19) all pass fully via `npx turbo run test --filter=worker --filter=git-adapter --filter=gsd-adapter --filter=event-schema --filter=company-core`.

## User Setup Required

**External service requires manual configuration before Task 3's human-check step can complete.** Task 3's `<precondition>` names a worker credential that must be issued via `POST /admin/workers` (header `X-Bootstrap-Secret`) against a running control plane, then set as `WORKER_TOKEN`. This is genuinely deferred, not skipped: `workflow.human_verify_mode` is `end-of-phase` (this project's config default), so the plan's own `<verify><human-check>` block for the live SyncSmith demo is harvested by the phase-level verifier into a consolidated UAT step, not executed mid-flight by this task. Obtaining `WORKER_TOKEN` and running the live demo (a real worker pointed at `F:/Sidegigs/syncsmith` via `--repo`, triggering a real `.planning/` change there and confirming events land in `GET /admin/workers`) is the remaining action before phase-level UAT can close this out.

## Next Phase Readiness

- `apps/worker` is feature-complete for this phase: runnable via `pnpm --filter worker start`, importable via `startWorker()` for tests, all four artifacts (`env.ts`, `ws-client.ts`, `event-emitter.ts`, `poll-loop.ts`) built and tested per the plan's `artifacts_produced` list
- Phase 3's full requirement set (RUNTIME-03, RUNTIME-04, WORKTREE-01, WORKTREE-02, GSD-01) is now implemented and automated-tested end-to-end against a stub control plane; the one remaining phase-close item is the live SyncSmith demo human-check (see User Setup Required above), deferred to end-of-phase UAT
- No blockers or concerns beyond the deferred human-check demo

---
*Phase: 03-worker-git-adapter-gsd-adapter*
*Completed: 2026-09-20*

## Self-Check: PASSED

All 11 created/modified files verified present on disk; all 4 task commits (`da7c4fb`, `9dc28b8`, `ad0575b`, `52dffbc`) verified present in git log; `pnpm --filter worker test` passes 20/20; `npx turbo run test --filter=worker --filter=git-adapter --filter=gsd-adapter --filter=event-schema --filter=company-core` confirms no regression across all five non-DB-dependent packages.

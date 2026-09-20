---
phase: 04-agentruntime-claudecoderuntime
plan: 03
subsystem: orchestration
tags: [agent-runtime, claude-agent-sdk, canUseTool, ceo-approval, gsd-adapter, tdd, vitest]

# Dependency graph
requires:
  - phase: 04-agentruntime-claudecoderuntime
    provides: "Plan 04-01's ClaudeCodeRuntime scaffold (tasks Map, event-emitter, requestReview/requestHandoff stubs) and Plan 04-02's runQuery shared message loop + watchdog lifecycle pattern this plan's role-poll interval mirrors"
  - phase: 03-worker-git-gsd-adapters
    provides: "gsd-adapter's observeGsdState() (Phase 3), reused directly rather than reimplemented"
provides:
  - "classifySignal(toolName, input) pure classifier (packages/claude-adapter/src/signal-detection.ts) — AskUserQuestion -> clarifying_question, CEO-gated Bash (force-push/rm -rf/DROP TABLE-DATABASE/npm publish-deploy) -> ceo_gated_tool"
  - "canUseTool + Notification hook wiring inside runQuery's query() options — real, deny-only requestReview firing on live SDK signals"
  - "requestReview implemented: waiting_for_review status + ceo.approval_requested event"
  - "requestHandoff implemented: gsd-adapter's reused observeGsdState polled every 5000ms inside runQuery, role-change detection posts agent.handoff_requested (observation-only, no AgentTaskStatus change)"
  - "ClaudeCodeRuntime — complete, non-stub, eight-method AgentRuntime (RUNTIME-02 fully realized)"
affects: ["Phase 5 (pixel office renderer)", "Phase 6 (CEO dashboard — first real consumer of ceo.approval_requested/agent.handoff_requested)", "any future AgentRuntime implementation (RUNTIME-05)"]

# Actuals (#2632)
actuals:
  tokens: 5300
  tasks: 2
  commits: 4
plan_head_before: b63bc19594f481590ba339a2eb270425228731be

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "classifySignal as a pure, I/O-free dispatch function mirroring gsd-adapter/src/role-mapping.ts's shape — canUseTool/the Notification hook call it and act on the result, never inline the classification logic themselves"
    - "Role-change poll (setInterval, one per runQuery invocation) mirrors the watchdog's own per-invocation lifecycle: created alongside it, cleared in the same finally block, using the same isFirstTick-style baseline guard apps/worker/src/poll-loop.ts established"

key-files:
  created:
    - packages/claude-adapter/src/signal-detection.ts
    - packages/claude-adapter/src/signal-detection.test.ts
  modified:
    - packages/claude-adapter/package.json
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
    - pnpm-lock.yaml

key-decisions:
  - "canUseTool always returns behavior: 'deny' for any classified signal, never 'allow' — Phase 4 guarantees the signal fires and is surfaced via ceo.approval_requested; the actual human-approval UI is Phase 6's job (ARCHITECTURE.md Anti-Pattern 2, kept prohibition T-04-07)."
  - "classifySignal's Bash CEO-gated pattern list is explicitly documented as a first-pass heuristic allowlist (force-push/rm -rf/DROP TABLE-DATABASE/npm publish-deploy), not exhaustive coverage — T-04-08's accepted disposition, with the watchdog remaining the last line of defense against anything this misses."
  - "requestHandoff is deliberately observation-only: posts agent.handoff_requested but never touches the task's own AgentTaskStatus, since no second agent exists yet in Phase 4 to actually receive control (CONTEXT.md domain boundary)."
  - "Role-change poll interval is 5000ms (plan-specified literal value) even though apps/worker/src/poll-loop.ts's own DEFAULT_INTERVAL_MS is 2500ms — the plan's action text names 5000ms explicitly while calling it 'matching the interval convention' in the general pattern sense, not the identical value; implemented as specified."
  - "gsd-adapter added as a workspace:* dependency (pnpm install run) — no new registry package, no package-legitimacy checkpoint needed."

patterns-established:
  - "Two independent D-08 signal sources (live SDK canUseTool/Notification hook, and reused gsd-adapter poll) both funnel through the same requestReview/requestHandoff functions and the same buildEnvelope/postEvent path every other event in this phase uses — no second event-emission mechanism introduced."

requirements-completed: [RUNTIME-02]

coverage:
  - id: D1
    description: "classifySignal correctly distinguishes AskUserQuestion (clarifying_question), CEO-gated Bash commands (ceo_gated_tool), and everything else (null)"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/signal-detection.test.ts (3 Behavior cases, all pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "canUseTool fires requestReview for AskUserQuestion/CEO-gated Bash, sets waiting_for_review, posts ceo.approval_requested, and always denies (never auto-approves)"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 4: canUseTool invoked with AskUserQuestion triggers requestReview..."
        status: pass
    human_judgment: false
  - id: D3
    description: "The wired Notification hook independently fires requestReview with a permission_prompt reason"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 5: the wired Notification hook calls requestReview with a reason containing permission_prompt"
        status: pass
    human_judgment: false
  - id: D4
    description: "requestHandoff fires on a real role-change signal detected via gsd-adapter's reused observeGsdState poll (5000ms), never on an unchanged role, never alters AgentTaskStatus, and stops polling once the task reaches a terminal status"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#ClaudeCodeRuntime.requestHandoff / gsd role-change poll (4 Behavior cases, all pass)"
        status: pass
    human_judgment: false
  - id: D5
    description: "No permissionMode: 'bypassPermissions' assignment anywhere in claude-code-runtime.ts"
    requirement: "RUNTIME-02"
    verification:
      - kind: other
        ref: "grep -Ern 'permissionMode:\\s*.bypass' packages/claude-adapter/src/claude-code-runtime.ts (0 matches)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-20
status: complete
---

# Phase 04 Plan 03: requestReview/requestHandoff Signal Wiring Summary

**`ClaudeCodeRuntime.requestReview`/`requestHandoff` now fire on real, live signals — a pure `classifySignal` classifier driving `canUseTool`'s deny-only CEO-gate detection and the `Notification` hook's `permission_prompt` secondary signal, plus a 5000ms role-change poll reusing `gsd-adapter`'s `observeGsdState` — completing the eight-method `AgentRuntime` with zero remaining stubs.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-20
- **Tasks:** 2/2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `classifySignal(toolName, input)` (`packages/claude-adapter/src/signal-detection.ts`) — pure, I/O-free classifier: `AskUserQuestion` always classifies as `clarifying_question`; `Bash` commands matching an explicit, documented first-pass CEO-gated regex allowlist (force-push, `rm -rf`, `DROP TABLE/DATABASE`, `npm publish`/`deploy`) classify as `ceo_gated_tool`; everything else returns `null`
- `runQuery`'s `query()` options now wire `canUseTool` (calls `requestReview` and always returns `behavior: "deny"` for a classified signal — never auto-approve) and a `Notification` hook (independent secondary `permission_prompt` signal, directly unit-tested by invoking the hook function)
- `requestReview(taskId, reason)` implemented: sets `waiting_for_review`, posts `task.status_changed` then `ceo.approval_requested` (Phase 1's existing discriminated-union member, its first real producer)
- `requestHandoff(taskId, toAgentId)` implemented: a 5000ms `setInterval` inside `runQuery` (same per-invocation lifecycle as Plan 04-02's watchdog) polls `gsd-adapter`'s reused `observeGsdState(worktreePath/.planning, undefined, false)`, records a baseline role on the first tick (never treated as a change), and posts `agent.handoff_requested` only on an actual role change — deliberately never touching the task's own `AgentTaskStatus`
- `ClaudeCodeRuntime` now implements the complete eight-method `AgentRuntime` interface with zero remaining `"not implemented"` stubs — `RUNTIME-02` is fully realized

## Task Commits

Each task followed RED→GREEN TDD discipline (2 commits per task, 4 total):

1. **Task 1: signal-detection.ts classifier + canUseTool/Notification hook wiring -> requestReview**
   - `481765f` — `test(04-03): add failing tests for signal-detection classifier and canUseTool/Notification requestReview wiring` (RED — signal-detection.test.ts fails to import a non-existent module; claude-code-runtime.test.ts's 2 new Tests fail on `canUseTool`/`hooks` not existing)
   - `f3c0e69` — `feat(04-03): implement signal-detection classifier + canUseTool/Notification wiring for requestReview` (GREEN — 18/18 passing)
2. **Task 2: requestHandoff wired to gsd-adapter's reused observeGsdState role-change polling**
   - `3c9d96d` — `test(04-03): add failing tests for requestHandoff via gsd-adapter role-change poll` (RED — 2 genuine failures (Test 1, Test 3); Test 2/Test 4 trivially pass with 0 calls both before and after, mirroring Plan 04-02's documented trivial-pass precedent)
   - `da6df2b` — `feat(04-03): implement requestHandoff via gsd-adapter role-change poll` (GREEN — 22/22 passing)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `packages/claude-adapter/src/signal-detection.ts` — `classifySignal` pure classifier, `ClassifiedSignal` type
- `packages/claude-adapter/src/signal-detection.test.ts` — 3 Behavior-block test cases
- `packages/claude-adapter/src/claude-code-runtime.ts` — `canUseTool`/`Notification` hook wiring, real `requestReview`/`requestHandoff`, role-change `setInterval` + `ROLE_POLL_INTERVAL_MS`, `lastRole` field on `TaskRecord`
- `packages/claude-adapter/src/claude-code-runtime.test.ts` — 6 new Behavior cases (2 from Task 1, 4 from Task 2) plus a `gsd-adapter` module mock
- `packages/claude-adapter/package.json` — `gsd-adapter: workspace:*` dependency added
- `pnpm-lock.yaml` — workspace link resolved (no new registry package)

## Decisions Made

See `key-decisions` in frontmatter above (deny-only canUseTool, Bash allowlist as documented first-pass heuristic, observation-only requestHandoff, 5000ms poll interval as literally specified by the plan, gsd-adapter as a no-checkpoint-needed workspace dependency).

## Deviations from Plan

None — plan executed exactly as written. One test-authoring correction made during Task 2's RED→GREEN cycle (not a deviation from the plan's *implementation* — the plan's action text was implemented as written): the initial draft of Task 2's Behavior Test 4 used `hangingQuery` (a mock that never respects `interrupt()`/`abort()`), which meant `runQuery`'s `finally` block — where the role-poll interval is actually cleared — never executed in that specific mock scenario, since the generator body never resolves. Switched the test to `pausableQuery` (whose mocked `interrupt()` releases its gate, letting `cancelTask`'s graceful path complete the loop normally) so the test genuinely exercises the interval-clearing code path rather than passing for the wrong reason. No production code was affected — this was purely a test-double fix, confirmed via a second RED-style run showing the assertion previously failed for the correct reason (5 calls firing instead of the expected 2) before the mock swap.

## Issues Encountered

None new this plan. `npx turbo run test` continues to surface the same two pre-existing, out-of-scope failures already logged in `.planning/phases/04-agentruntime-claudecoderuntime/deferred-items.md` from Plan 04-02 (`orchestration-adapter#test` — "No test files found" by design; `api#test` — local test Postgres not running/reachable) — neither touches any file this plan modified. `pnpm --filter claude-adapter test` (the plan's own required full-suite verification command) is green: 22/22 passing, plus a clean `pnpm --filter claude-adapter typecheck`.

## Next Phase Readiness

- `ClaudeCodeRuntime` is now a complete, non-stub `AgentRuntime` implementation — `startTask`/`pauseTask`/`resumeTask`/`cancelTask`/`getStatus`/`sendMessage`/`requestReview`/`requestHandoff` all real.
- D-05/D-06/D-07's live disposable-worktree demo against SyncSmith (the phase's actual completion proof per 04-RESEARCH.md's Sampling Rate) has not yet been run in this session — it is the remaining verification step for this phase as a whole, not scoped to any single plan's `<verify>` blocks.
- No blockers for the next plan in this phase.

---
*Phase: 04-agentruntime-claudecoderuntime*
*Completed: 2026-09-20*

## Self-Check: PASSED

All 7 claimed files (2 new, 5 modified/referenced) verified present on disk. All 4 commits
(`481765f` RED, `f3c0e69` GREEN, `3c9d96d` RED, `da6df2b` GREEN) verified present in git log.

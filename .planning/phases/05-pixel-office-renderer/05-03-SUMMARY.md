---
phase: 05-pixel-office-renderer
plan: 03
subsystem: event-schema, orchestration-adapter, claude-adapter, company-core
tags: [event-schema, agent-status-derivation, reducer, handoff, tdd]

requires:
  - phase: 05-pixel-office-renderer
    plan: 01
    provides: "AgentStatus contract (event-schema), Broadcast Hub, packages/pixel-office skeleton"
  - phase: 04-agentruntime-claudecoderuntime
    provides: "ClaudeCodeRuntime.requestHandoff (observation-only, no fromAgentId/agentId threading yet) that this plan extends"
provides:
  - "agent.handoff_completed — CompanyEventSchema's 17th discriminated-union member"
  - "AgentHandoffRequestedPayload.fromAgentId — both handoff participants now identifiable"
  - "StartTaskInput.agentId (required) threaded through TaskRecord/emitStatus's sourceAgentId/requestHandoff's fromAgentId/completeHandoff"
  - "deriveAgentStatus(input) — packages/company-core's pure priority-ordered AgentStatus rule table"
  - "reducer.ts: task.status_changed/gsd.phase_observed/agent.handoff_completed all derive and upsert real per-agent AgentStatus"
affects: [05-04-handoff-choreography]

actuals:
  tokens: 8100
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "TaskRecord.agentId set once in startTask, read by emitStatus (sourceAgentId) and requestHandoff (fromAgentId) — never fabricated, throws if unknown (Core Value)"
    - "buildEnvelope's 6th optional sourceAgentId param is omitted from the envelope entirely when undefined, never serialized as sourceAgentId: undefined"
    - "deriveAgentStatus is a pure, dependency-free function (AgentTaskStatus + gsdCategory -> AgentStatus) — reducer.ts calls it, never inlines status logic itself"
    - "AgentState.currentTaskId/rawTaskStatus are internal reducer bookkeeping fields, invisible to the renderer (which only ever reads .status) — enable gsd.phase_observed to re-derive every active agent's status on a company-wide category shift"

key-files:
  created:
    - packages/company-core/src/agent-status-derivation.ts
    - packages/company-core/src/agent-status-derivation.test.ts
  modified:
    - packages/event-schema/src/payloads/index.ts
    - packages/event-schema/src/payloads/index.test.ts
    - packages/event-schema/src/envelope.test.ts
    - packages/orchestration-adapter/src/types.ts
    - packages/claude-adapter/src/event-emitter.ts
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
    - packages/claude-adapter/src/claude-code-runtime.integration.test.ts
    - packages/company-core/src/fixtures/stub-events.ts
    - packages/company-core/src/projections.ts
    - packages/company-core/src/reducer.ts
    - packages/company-core/src/reducer.test.ts
    - packages/company-core/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Fixed 2 pre-existing test fixtures outside Task 1's <files> list that would have broken once fromAgentId became required: packages/event-schema/src/envelope.test.ts's agent.handoff_requested case (its 'accepts a well-formed event' assertion would fail with fromAgentId missing) and packages/company-core/src/fixtures/stub-events.ts's event-07 (typed as CompanyEvent[], and semantically incomplete without it — agent-1 is the real sender per its own sourceAgentId). Both were Rule 1/3 fixes required for the schema change to be honest and non-breaking."
  - "Added a dedicated 'rejects agent.handoff_requested missing fromAgentId' test to envelope.test.ts, since the plan's acceptance criterion ('every agent.handoff_requested fixture in payloads/index.test.ts includes fromAgentId') assumed fixtures existed in that specific file — grepping payloads/index.test.ts found none (only Phase 3 gsd/worktree/heartbeat coverage lives there). Closed the coverage gap at envelope.test.ts instead, the file that actually holds the agent.handoff_requested round-trip cases."
  - "Widened the mocked buildEnvelope in claude-code-runtime.test.ts to forward the new optional 6th sourceAgentId param into the returned test envelope (previously a 4-arg stub) so the acceptance criterion 'emitStatus's posted envelope includes sourceAgentId matching the task's agentId' is actually exercised, not just true by construction of the real (unmocked) event-emitter.ts."
  - "company-core added orchestration-adapter as a real dependency (package.json + pnpm-lock.yaml) to import AgentTaskStatus for deriveAgentStatus's input type — not previously a dependency of this package."

patterns-established: []

requirements-completed: [OFFICE-01, HANDOFF-01]

coverage:
  - id: D1
    description: "agent.handoff_requested's payload carries a real fromAgentId; agent.handoff_completed exists as the 17th CompanyEventSchema union member and round-trips via safeParse"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/event-schema/src/payloads/index.test.ts#Phase 5 payload — agent.handoff_completed"
        status: pass
      - kind: unit
        ref: "packages/event-schema/src/envelope.test.ts#CompanyEventSchema — agent.handoff_requested fromAgentId (Phase 5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "StartTaskInput requires a real agentId; every task.status_changed event ClaudeCodeRuntime emits for that task carries sourceAgentId; requestHandoff throws (never fabricates) when a task's agentId is unknown"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 2 (sourceAgentId on both status_changed events), Test 2b (requestHandoff throws)"
        status: pass
    human_judgment: false
  - id: D3
    description: "deriveAgentStatus implements the exact priority-ordered rule table from the plan's behavior list, and never returns OFFLINE or READING for any point in AgentTaskStatus x gsdCategory's input space"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/company-core/src/agent-status-derivation.test.ts (20 cases, including the exhaustive OFFLINE/READING-unreachable sweep)"
        status: pass
    human_judgment: false
  - id: D4
    description: "task.status_changed with sourceAgentId upserts a real derived AgentStatus on state.agents; the same event type without sourceAgentId leaves state.agents untouched; gsd.phase_observed re-derives every starting/running agent's status on a category shift; agent.handoff_completed upserts the receiver to CODING"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#task.status_changed, gsd.phase_observed re-derives active agents' AgentStatus, agent.handoff_completed (all Phase 5, 05-03)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-21
status: complete
---

# Phase 5 Plan 3: Real Per-Agent AgentStatus Derivation Summary

**`agent.handoff_completed` and `fromAgentId` close RESEARCH.md's two schema gaps; `StartTaskInput.agentId` threads real agent identity through every `task.status_changed`/`agent.handoff_requested` event; `deriveAgentStatus` replaces 05-01's hardcoded status strings with a real, testable, priority-ordered rule table the reducer now calls on every relevant event.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-21T03:25:55Z
- **Tasks:** 2 (Task 1 `type="auto"`, Task 2 `type="auto" tdd="true"` — full RED/GREEN cycle, no REFACTOR needed)
- **Commits:** 3 (measured: `git rev-list --count 897e158..HEAD`)

## Accomplishments

- `packages/event-schema/src/payloads/index.ts` — `AgentHandoffRequestedPayload.fromAgentId` (new required field), `AgentHandoffCompletedPayload` (new), `agent.handoff_completed` as the 17th `CompanyEventSchema` union member
- `packages/orchestration-adapter/src/types.ts` — `StartTaskInput.agentId: string` (required)
- `packages/claude-adapter/src/event-emitter.ts` — `buildEnvelope`'s new optional 6th `sourceAgentId` param, omitted from the envelope entirely when not provided
- `packages/claude-adapter/src/claude-code-runtime.ts` — `TaskRecord.agentId`; `emitStatus` now sets `sourceAgentId`; `requestHandoff` now sets `fromAgentId` and throws (never fabricates) when a task's `agentId` is unknown; new `completeHandoff(taskId, toAgentId)` fired back-to-back with `requestHandoff` in the role-change poll (single-session simulation, T-05-08)
- `packages/company-core/src/agent-status-derivation.ts` — `deriveAgentStatus(input)`, the pure priority-ordered `AgentStatus` rule table
- `packages/company-core/src/reducer.ts` — `task.status_changed` (sourceAgentId-gated agent upsert), `gsd.phase_observed` (re-derives every active agent on a category shift), new `agent.handoff_completed` handler

## Task Commits

1. **Task 1: Event schema handoff additions + agentId threading** — `8bf5ae5` (feat)
2. **Task 2 RED: failing tests for real per-agent AgentStatus derivation** — `3737f4d` (test)
2. **Task 2 GREEN: real per-agent AgentStatus derivation in the reducer** — `e994359` (feat)

No REFACTOR commit — the GREEN implementation needed no cleanup (verified: all 46 `company-core` tests plus `apps/api` (36) and `pixel-office` (21) still pass unmodified).

## Files Created/Modified

- `packages/event-schema/src/payloads/index.ts` — `fromAgentId`, `AgentHandoffCompletedPayload`, 17th union member
- `packages/event-schema/src/payloads/index.test.ts` — `agent.handoff_completed` round-trip + missing-`toAgentId` rejection
- `packages/event-schema/src/envelope.test.ts` — `agent.handoff_requested` fixture updated with `fromAgentId`; new dedicated `fromAgentId`-required rejection test
- `packages/orchestration-adapter/src/types.ts` — `StartTaskInput.agentId`
- `packages/claude-adapter/src/event-emitter.ts` — `buildEnvelope`'s 6th `sourceAgentId` param
- `packages/claude-adapter/src/claude-code-runtime.ts` — `TaskRecord.agentId`, `emitStatus`/`requestHandoff` threading, new `completeHandoff`, role-poll wiring
- `packages/claude-adapter/src/claude-code-runtime.test.ts` — shared `startInput.agentId`, `buildEnvelope` mock widened to forward `sourceAgentId`, updated handoff-payload assertion, new `sourceAgentId`-on-envelope and `requestHandoff`-throws tests
- `packages/claude-adapter/src/claude-code-runtime.integration.test.ts` — `agentId` added to all 3 `startTask` call sites
- `packages/company-core/src/fixtures/stub-events.ts` — event-07's `agent.handoff_requested` payload gains `fromAgentId: "agent-1"`
- `packages/company-core/src/agent-status-derivation.ts` — `deriveAgentStatus`
- `packages/company-core/src/agent-status-derivation.test.ts` — 20 cases covering every `<behavior>` row + the OFFLINE/READING-unreachable exhaustive sweep
- `packages/company-core/src/projections.ts` — `AgentState.currentTaskId`/`rawTaskStatus`
- `packages/company-core/src/reducer.ts` — `task.status_changed`, `gsd.phase_observed`, `agent.handoff_completed` handlers
- `packages/company-core/src/reducer.test.ts` — 4 new cases (sourceAgentId-present upsert, sourceAgentId-absent no-op, gsd.phase_observed re-derivation, agent.handoff_completed upsert)
- `packages/company-core/package.json`, `pnpm-lock.yaml` — added `orchestration-adapter` workspace dependency

## Decisions Made

- **Fixed 2 pre-existing fixtures outside Task 1's `<files>` list** (`envelope.test.ts`, `stub-events.ts`) that would have broken once `fromAgentId` became required on `AgentHandoffRequestedPayload` — Rule 1/3, necessary for the schema change to be honest and non-breaking rather than silently leaving a stale fixture around.
- **Closed a gap in the plan's own acceptance-criteria wording**: "every `agent.handoff_requested` fixture in `payloads/index.test.ts` includes `fromAgentId`" assumed fixtures existed in that file; none did (grepped — only Phase 3 coverage lives there). Added the missing-`fromAgentId`-rejection coverage to `envelope.test.ts` instead, the file that actually holds the `agent.handoff_requested` round-trip cases.
- **Widened the mocked `buildEnvelope` in `claude-code-runtime.test.ts`** to forward `sourceAgentId` so the acceptance criterion about `emitStatus`'s envelope carrying `sourceAgentId` is exercised by an assertion, not just true-by-construction of the unmocked real implementation.
- **company-core now depends on `orchestration-adapter`** (new workspace dependency) to import `AgentTaskStatus` for `deriveAgentStatus`'s input type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `envelope.test.ts`'s `agent.handoff_requested` case would fail once `fromAgentId` became required**
- **Found during:** Task 1, running `pnpm --filter event-schema test -- payloads` (which runs the whole package's suite, including `envelope.test.ts`)
- **Issue:** `envelope.test.ts`'s generic `cases` table's `agent.handoff_requested` payload had no `fromAgentId` — its "accepts a well-formed event" assertion would now fail `safeParse`.
- **Fix:** Added `fromAgentId: "agent-1"` to the case's payload; added a dedicated new test asserting `fromAgentId` is required.
- **Files modified:** `packages/event-schema/src/envelope.test.ts`
- **Verification:** `pnpm --filter event-schema test` — 36/36 passing
- **Committed in:** `8bf5ae5` (Task 1 commit)

**2. [Rule 1 - Bug] `stub-events.ts`'s event-07 fixture missing `fromAgentId`**
- **Found during:** Task 1, reviewing every `agent.handoff_requested` usage repo-wide before touching the schema
- **Issue:** `stub-events.ts` is typed `CompanyEvent[]` (the zod-inferred type); event-07's payload lacked the now-required `fromAgentId`, and semantically the event already carries `sourceAgentId: "agent-1"` on its envelope — the same agent should be the payload's `fromAgentId`.
- **Fix:** Added `fromAgentId: "agent-1"` to event-07's payload.
- **Files modified:** `packages/company-core/src/fixtures/stub-events.ts`
- **Verification:** `pnpm --filter company-core test` — 46/46 passing
- **Committed in:** `8bf5ae5` (Task 1 commit)

**Total deviations:** 2 auto-fixed (both Rule 1/bug, both necessary for the schema change to be non-breaking). No architectural (Rule 4) deviations.
**Impact on plan:** Neither expanded scope beyond what Task 1 already touched (the schema change itself) — both were direct, unavoidable consequences of making `fromAgentId` required.

## Known Stubs

None introduced by this plan. Carried-over stubs from 05-01/05-02 (bubble-icon JSON rendering not yet wired into `engine/renderer.ts`, `spriteData.ts`'s transparent placeholder frames) are unaffected — this plan touched only the event-schema/runtime/reducer layers, never `packages/pixel-office`.

## Threat Flags

None new. `T-05-07` (reducer trusting `event.sourceAgentId`) and `T-05-08` (`requestHandoff`/`completeHandoff` back-to-back emission) are both already registered in this plan's own `<threat_model>` with dispositions `mitigate`/`accept` — implemented exactly as specified (server-side-only `sourceAgentId`, documented single-session simulation comment on `completeHandoff`).

## Issues Encountered

None blocking. `pnpm --filter claude-adapter typecheck` still fails on the same pre-existing repo-wide TS module-resolution gap documented in `STATE.md`/`deferred-items.md` since 05-01 (`event-schema/src/index.ts` re-exports without explicit `.js` extensions under `moduleResolution: NodeNext`) — confirmed unrelated to this plan's changes (the failure is entirely inside `event-schema/src/index.ts`, a file this plan never touched) and not one of this plan's 5 required `<verify>` commands.

## Next Phase Readiness

- 05-04 (handoff choreography) now has everything it needs: `agent.handoff_requested.fromAgentId` and a real `agent.handoff_completed` event to drive both ends of the walk-to-desk sequence, plus `deriveAgentStatus`'s already-exhaustive `AgentStatus` output flowing through the reducer for every agent the renderer will animate.
- No known gaps block 05-04's own scoped work.

## Self-Check: PASSED

All 16 claimed created/modified files verified present on disk; commits `8bf5ae5`, `3737f4d`, `e994359` verified present in `git log`.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*

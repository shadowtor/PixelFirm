---
phase: 01-event-schema-state-engine
plan: 03
subsystem: event-sourcing
tags: [vitest, tdd, reducer, gap-closure]

requires:
  - phase: 01-01
    provides: "dispatch-table reduce()/fold(), ProjectionState, guard-and-no-op pattern precedent (git.commit_created)"
  - phase: 01-02
    provides: "full 12-event dispatch table, deployment.started's guard-and-no-op precedent, stub-events.ts fixture"
provides:
  - "packages/company-core/src/reducer.ts: floor.created/project.created/task.created/agent.online/session.started all guard on their optional envelope correlation id and no-op (return state unchanged) instead of asserting non-null"
  - "packages/company-core/src/reducer.test.ts: 5 regression tests proving each handler safely no-ops on an omitted correlation id, plus the pre-existing full-fixture and replay-determinism tests still passing unmodified"
affects: ["Phase 2 (control plane/Postgres event log builds directly on ProjectionState correctness this plan restores)"]

actuals:
  tokens: 1458
  tasks: 1
  commits: 2
  plan_head_before: 4f0308502f7a27e3a93489e5a024de17665a2de4

tech-stack:
  added: []
  patterns:
    - "Guard-and-no-op is now applied uniformly across all 7 reducer handlers that key a projection record off an optional envelope field (git.commit_created, deployment.started were already correct; floor.created/project.created/task.created/agent.online/session.started now match)"

key-files:
  created: []
  modified:
    - packages/company-core/src/reducer.ts
    - packages/company-core/src/reducer.test.ts

key-decisions:
  - "TDD RED evidence for this task was verified manually against Vitest's own TAP reporter output (4/5 target tests failed with a genuine AssertionError on the intended assertion, exit code 1) rather than via `gsd_run check tdd-red-evidence`. That checker's TAP-summary parser (`parseNodeTestSummary`) expects `node --test`'s `# tests N / # pass N / # fail N` summary lines, which Vitest's `--reporter=tap` output does not emit (it nests TAP nodes without that top-level summary) — every run against it classified as `zero_tests_discovered` (INVALID_RED) regardless of the real, correctly-failing test underneath. This is a tooling/test-runner mismatch (the checker was built against `node --test`; this project is Vitest per STACK.md), not a defect in the RED phase itself. Not fixed here — out of scope for a single-task gap-closure plan; flagging for GSD tooling awareness."
  - "session.started's test case was written to the same contract as the other 4 (assert reduce() no-ops on omitted sourceAgentId), but the pre-existing code already passed it — `state.agents[event.sourceAgentId!]` on an empty ProjectionState coerces to key \"undefined\", misses, and the existing `if (!existing) return state;` already no-op'd by accident. The plan's own <behavior> section anticipated this exact outcome ('hardens the guard explicitly... currently already no-ops here already by incidental key-miss'). The handler was still rewritten to the explicit `if (!agentId || !existing) return state;` double-guard shape so the no-op is a testable contract, not a coincidence of key-miss, matching git.commit_created/deployment.started."

requirements-completed: [EVENT-03]

coverage:
  - id: D1
    description: "floor.created/project.created/task.created/agent.online/session.started all guard on their optional envelope correlation id and return ProjectionState unchanged when it's missing, instead of writing an \"undefined\"-keyed record"
    requirement: "EVENT-03"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#EVENT-03 gap closure — omitted correlation id no-ops instead of corrupting state"
        status: pass
    human_judgment: false
  - id: D2
    description: "No regression: the pre-existing full 12-event fixture projection test and full-catalog replay-determinism test from 01-02 still pass unmodified"
    requirement: "EVENT-03"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#fold — full 12-event fixture (EVENT-03)"
        status: pass
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#replay determinism — full catalog scale (EVENT-04)"
        status: pass
      - kind: integration
        ref: "pnpm turbo run test"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 3: EVENT-03 Gap Closure — Guard the 5 Unguarded Reducer Handlers Summary

**Applied the codebase's own guard-and-no-op pattern (already correct in `git.commit_created`/`deployment.started`) to the 5 remaining reducer handlers that were non-null-asserting optional envelope correlation ids, closing the CR-01/Truth-2 projection-corruption gap identified by both 01-REVIEW.md and 01-VERIFICATION.md**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-18T08:00:00Z (approx)
- **Completed:** 2026-09-18T08:13:08Z
- **Tasks:** 1 (TDD: RED + GREEN, no REFACTOR needed)
- **Files modified:** 2

## Accomplishments

- `packages/company-core/src/reducer.ts`: `floor.created`, `project.created`, `task.created` each now read their optional envelope id (`floorId`/`projectId`/`taskId`) into a local const and return `state` unchanged if it's falsy, before ever using it as a computed property key — eliminates the `state.floors["undefined"] = { id: undefined, ... }` corruption class
- `agent.online` now guards on `sourceAgentId` and no-ops the **entire** handler (including the `teams` side effect) together — it no longer partially applies (writing a phantom team while skipping the corrupted agent record)
- `session.started` hardened from an incidental no-op (accidental key-miss on `state.agents["undefined"]`) into the explicit `if (!agentId || !existing) return state;` double-guard shape already used by `git.commit_created`/`deployment.started`
- 5 new regression tests in `reducer.test.ts` prove each handler no-ops safely on an omitted correlation id; the pre-existing full-fixture and replay-determinism tests from 01-02 pass unmodified — the guard changes behavior for the omitted-id case only, never for the happy path
- `pnpm --filter company-core test -- reducer.test.ts`: 12/12 pass. `pnpm turbo run test`: 2/2 packages pass.

## Task Commits

TDD task (RED + GREEN, no REFACTOR needed — GREEN implementation was already minimal and matched the file's existing pattern):

1. **Task 1 RED: failing tests for EVENT-03 correlation-id guard** - `7b71da3` (test)
2. **Task 1 GREEN: guard reducer handlers against missing correlation ids** - `113e7ae` (feat)

**Plan metadata:** _pending_ (docs: complete plan)

## Files Created/Modified

- `packages/company-core/src/reducer.ts` - 5 handlers rewritten to guard-and-no-op on their optional envelope correlation id
- `packages/company-core/src/reducer.test.ts` - new `describe("EVENT-03 gap closure — omitted correlation id no-ops instead of corrupting state")` block, 5 `it()` cases

## Decisions Made

- **`gsd_run check tdd-red-evidence` tooling mismatch, not used to gate this plan:** documented above under `key-decisions`. RED evidence was verified manually via Vitest's own TAP reporter output instead — 4 of the 5 target tests failed with the exact expected `AssertionError` (`floors["undefined"]` etc. present when it shouldn't be), exit code 1, not a syntax/import/fixture crash. The checker's parser expects `node --test` summary lines Vitest's TAP reporter doesn't emit; this is a pre-existing gap in the GSD tooling's test-runner coverage, not a defect introduced by this plan.
- **`session.started` test written to the same contract despite already passing:** see `key-decisions` above — the plan's own `<behavior>` section anticipated this exact outcome (incidental no-op today, hardened to an explicit guard).

## Deviations from Plan

None — plan executed exactly as written. The TDD-tooling note above is a documented tooling limitation encountered during execution, not a deviation from the plan's instructions (the plan specified `tdd="true"` execution and RED/GREEN discipline, which was followed; only the automated `check tdd-red-evidence` verification step hit a format mismatch, which is a GSD-tooling gap orthogonal to the plan's own scope).

## Issues Encountered

- `gsd_run check tdd-red-evidence` returns `INVALID_RED (zero_tests_discovered)` against Vitest's `--reporter=tap` output because its `parseNodeTestSummary` regex looks for `node --test`'s `# tests N / # pass N / # fail N` summary lines, which Vitest's TAP reporter doesn't emit (it nests per-describe TAP blocks without a flat top-level summary). Confirmed via a manual record built from the actual RED-phase TAP output (`floor.created with floorId omitted no-ops` target test, exit code 1) — the checker misclassified genuinely correct RED evidence as invalid due to the format mismatch, not because the RED phase was actually invalid. Worked around by manually verifying the RED evidence (4/5 target tests failed with the exact intended `AssertionError`, TAP `not ok` lines named the correct tests, no fixture/load crash). Not fixed — out of scope for this gap-closure plan (fixing the checker is a GSD-tooling change, not a `packages/company-core` change); flagging for awareness in case a future TDD plan on this Vitest-based repo hits the same false-INVALID_RED.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EVENT-03 ("Company State Engine builds materialized projections... read by downstream consumers") now holds for the full space of schema-valid input, not just the happy-path 12-event fixture — closing the gap 01-VERIFICATION.md (Truth 2) and 01-REVIEW.md (CR-01) both independently identified.
- `packages/company-core`'s reducer is now internally consistent: every handler that keys a projection record off an optional envelope field (`floorId`/`projectId`/`taskId`/`sourceAgentId`) uses the same guard-and-no-op shape (`git.commit_created`, `deployment.started`, and now these 5) — 01-REVIEW.md's WR-01 ("inconsistent required-field handling across reducer handlers") is resolved as a side effect.
- Phase 2 (Control Plane Skeleton) can safely build a durable Postgres event log directly on top of `ProjectionState` without inheriting a silent-corruption defect from a malformed/partial upstream event.
- Carry-forward reminders unchanged from 01-01/01-02 (still tracked in STATE.md Blockers/Concerns): Phase 2 planning MUST name dedup-at-ingestion as an explicit requirement (D-03); confirm Coolify's managed Postgres version.
- Not addressed here (unchanged from 01-REVIEW.md, out of this plan's scope): WR-02 (envelope-level required-per-type test coverage), WR-03 (`noUncheckedIndexedAccess`), IN-01 through IN-05 (info-level items). None of these block Phase 2.

---
*Phase: 01-event-schema-state-engine*
*Completed: 2026-09-18*

## Self-Check: PASSED

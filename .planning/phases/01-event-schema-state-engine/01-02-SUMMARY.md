---
phase: 01-event-schema-state-engine
plan: 02
subsystem: event-sourcing
tags: [zod, vitest, discriminated-union, reducer, tdd]

requires: ["01-01 (pnpm workspace, CompanyEventSchema tracer, reduce()/fold() dispatch table)"]
provides:
  - "packages/event-schema: CompanyEventSchema extended to all 12 seeded discriminated-union members (company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer)"
  - "packages/company-core: full dispatch table populating agents/floors/teams/projects/tasks from the 12-event catalog"
  - "packages/company-core/src/fixtures/stub-events.ts: shared ordered 12-event fixture reused by projection and replay-determinism tests"
  - "Replay-determinism proven at full catalog scale (12 events, all 5 projection kinds touched)"
affects: ["Phase 2 (control plane imports both packages as shared domain contract, now covering the full seeded catalog)"]

actuals:
  tokens: 4365
  tasks: 2
  commits: 3
  plan_head_before: d3f03639609f9ef19dcab514786a190423a7489f

tech-stack:
  added: []
  patterns:
    - "agent.online populates both `agents` and `teams` from one event — no dedicated team category exists among the 12 seeded types, so team membership rides along with the agent coming online"
    - "Task status threads through created -> handoff_requested -> review -> awaiting_approval -> committed as fixture events fold in causal order"
    - "Handlers that reference an entity that may not yet exist (session.started, review.started, ceo.approval_requested, git.commit_created, deployment.started) check for the existing record and no-op if absent, rather than throwing"

key-files:
  created:
    - packages/company-core/src/fixtures/stub-events.ts
  modified:
    - packages/event-schema/src/payloads/index.ts
    - packages/event-schema/src/envelope.test.ts
    - packages/company-core/src/projections.ts
    - packages/company-core/src/reducer.ts
    - packages/company-core/src/reducer.test.ts

key-decisions:
  - "No `team` category exists among the 12 seeded event types (company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer) — RESEARCH.md's own seed table confirms this. To still populate ProjectionState's `teams` slot (EVENT-03 requires all five projection kinds end up populated by the fixture run), agent.online's payload carries a `teamId` and its handler creates the team record as a side effect of the agent joining it. This is additive and within CONTEXT.md's discretion grant on exact payload field choices."
  - "viewer.event intentionally has no reducer handler — it touches none of the five required projection kinds (no dedicated viewer-facing slot exists in ProjectionState). It no-ops via the existing 'unrecognized type' fallback, same mechanism Plan 01 already established."
  - "git.commit_created and deployment.started read their target task/project id from the envelope's own optional taskId/projectId scoping fields rather than duplicating those ids inside the payload — those fields exist on BaseEnvelope for exactly this purpose."

requirements-completed: [EVENT-01, EVENT-03, EVENT-04]

coverage:
  - id: D1
    description: "All 12 seeded event types pass .safeParse() when valid, and fail when malformed (missing required payload field or wrong discriminator literal)"
    requirement: "EVENT-01"
    verification:
      - kind: unit
        ref: "packages/event-schema/src/envelope.test.ts — 25 assertions (3 for company.started, 2 each for the remaining 11 types)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Feeding the ordered 12-event fixture into fold() produces a ProjectionState with a populated entry for every touched agent/floor/team/project/task"
    requirement: "EVENT-03"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#fold — full 12-event fixture (EVENT-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Folding the identical 12-event fixture array twice, both from a fresh empty state, produces deep-equal ProjectionState results"
    requirement: "EVENT-04"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#replay determinism — full catalog scale (EVENT-04)"
        status: pass
      - kind: static
        ref: "grep -Eiq 'memoiz|new Map\\(|new WeakMap\\(' packages/company-core/src/reducer.ts — no match"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full suite green across both packages via the Turborepo task graph"
    verification:
      - kind: integration
        ref: "pnpm turbo run test"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 2: Full 12-Event Catalog + Projection Coverage + Replay-Determinism Summary

**Expanded Plan 01's proven tracer to all 12 seeded event categories, wired a reducer handler for each, and proved full ProjectionState coverage plus replay-determinism at catalog scale with a shared causally-ordered fixture — zero new architectural patterns.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-18T15:35Z (approx)
- **Completed:** 2026-09-18T15:38Z (test/commit activity)
- **Tasks:** 2 (Task 2 executed as RED/GREEN TDD, no REFACTOR needed)
- **Files:** 1 created, 5 modified

## Accomplishments

- `CompanyEventSchema` discriminated union extended from 1 to 12 members: `company.started`, `floor.created`, `project.created`, `task.created`, `agent.online`, `session.started`, `agent.handoff_requested`, `review.started`, `ceo.approval_requested`, `git.commit_created`, `deployment.started`, `viewer.event` — all composed via spread, never chained `.extend()` (Pitfall 2)
- Every payload is a plain `z.object()` (never `z.looseObject()`) — the Tampering mitigation (T-01-01) applied uniformly across all 12 members
- `envelope.test.ts` covers a valid + malformed case for every one of the 12 types (25 total assertions)
- `packages/company-core/src/fixtures/stub-events.ts`: shared, hand-crafted, causally-ordered 12-event fixture with hardcoded ids/timestamps (no `crypto.randomUUID()`/`Date.now()` calls)
- Reducer dispatch table extended with 11 new handlers, each returning a new state object; task status threads realistically through `created -> handoff_requested -> review -> awaiting_approval -> committed`
- Full projection coverage proven: folding the fixture populates `companies`, `floors`, `projects`, `agents` (x2), `teams`, and `tasks`
- Replay-determinism proven at full catalog scale: folding the identical 12-event array twice from a fresh `emptyState()` produces deep-equal results
- Grep-verified: no `memoiz`/`new Map(`/`new WeakMap(` pattern anywhere in `reducer.ts` — the reducer is genuinely pure, not cached

## Task Commits

Task 2 is TDD (RED/GREEN, no REFACTOR needed — GREEN implementation was already minimal):

1. **Task 1: Seed the remaining 11 event categories (D-01)** - `8183914` (feat)
2. **Task 2 RED: failing tests for full-catalog projection + replay determinism** - `be9e6db` (test)
3. **Task 2 GREEN: implement full dispatch table for 12-event catalog** - `3b98bee` (feat)

## Files Created/Modified

- `packages/event-schema/src/payloads/index.ts` - 11 new payload schemas + discriminated union members
- `packages/event-schema/src/envelope.test.ts` - table-driven valid/malformed test per type (11 new + existing company.started block untouched)
- `packages/company-core/src/fixtures/stub-events.ts` - shared 12-event fixture, causally ordered
- `packages/company-core/src/projections.ts` - `AgentState.name?`, `FloorState.name`, `ProjectState.name`/`status?`, `TaskState.title?` added to carry payload-derived data
- `packages/company-core/src/reducer.ts` - 11 new dispatch-table handlers
- `packages/company-core/src/reducer.test.ts` - full-fixture projection coverage test + full-catalog replay-determinism test

## Decisions Made

- **No `team` seed category exists — agent.online carries `teamId` as a side channel:** RESEARCH.md's 12-category seed table has no "team" entry. EVENT-03's must-have requires all five projection kinds (agent/floor/team/project/task) end up populated by the fixture run. Rather than inventing a 13th event type outside D-01's locked 12-category scope, `agent.online`'s payload includes `teamId`, and its handler creates the team record as a side effect — additive, within CONTEXT.md's discretion grant on exact payload fields.
- **viewer.event has no reducer handler:** it touches none of the five required projection kinds (no viewer-facing ProjectionState slot exists). It falls through the existing "unrecognized type no-ops" path Plan 01 already established — no new code needed for a legitimate no-touch event.
- **git.commit_created / deployment.started read taskId/projectId from the envelope, not the payload:** those optional scoping fields already exist on `BaseEnvelope` for exactly this purpose; duplicating them inside the payload would be redundant.

## Deviations from Plan

None — plan executed exactly as written. The `teamId`-on-`agent.online` and viewer.event-no-handler choices above are both payload/handler-shape decisions explicitly left to Claude's discretion by 01-CONTEXT.md, not deviations from the plan's instructions.

## Issues Encountered

- `npx tsc --noEmit` against both packages reports `TS2835` (relative imports need explicit `.js` extensions under `NodeNext` module resolution) on every relative import in the codebase — including files created in Plan 01 that this plan did not touch. This is a pre-existing, repo-wide condition from Plan 01's bootstrap, not something introduced by this plan's changes, and it is out of scope per the Scope Boundary rule (fixing it would touch every existing file, not just this plan's). `vitest` resolves these imports fine via esbuild, and the plan's own `<verify>` block only specifies `pnpm --filter <pkg> test` / `pnpm turbo run test` — both green. Not fixed; flagging for awareness if a later phase adds a `tsc --noEmit` build gate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `packages/event-schema` and `packages/company-core` both fully implement Phase 1's three Success Criteria (EVENT-01 typed schema for all 12 categories, EVENT-03 full projection coverage, EVENT-04 replay-determinism at scale) against stubbed, in-memory events only — no real infrastructure yet, per phase boundary.
- Phase 2 (Control Plane Skeleton) can now import both packages as the shared domain contract, backing the same reducer with a durable Postgres event log.
- Carry-forward reminder (D-03, still tracked in STATE.md Blockers/Concerns): Phase 2 planning MUST name dedup-at-ingestion as an explicit requirement — this phase's reducer intentionally assumes ordered, exactly-once input.

---
*Phase: 01-event-schema-state-engine*
*Completed: 2026-09-18*

## Self-Check: PASSED

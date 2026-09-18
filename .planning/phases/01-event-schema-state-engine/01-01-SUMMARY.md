---
phase: 01-event-schema-state-engine
plan: 01
subsystem: event-sourcing
tags: [zod, vitest, turborepo, pnpm, typescript, discriminated-union, reducer]

requires: []
provides:
  - "pnpm workspace bootstrap (pnpm-workspace.yaml, turbo.json, root tsconfig.json)"
  - "packages/event-schema: CompanyEventSchema discriminated union, seeded with company.started"
  - "packages/company-core: ProjectionState + pure reduce()/fold() with company.started handler"
  - "Replay-determinism proof: folding the same event twice from a fresh state is deep-equal"
affects: ["01-02 (expands the union to the remaining 11 event categories against this same shape)", "Phase 2 (control plane imports both packages as shared domain contract)"]

actuals:
  tokens: 2942
  tasks: 3
  commits: 3

tech-stack:
  added: ["pnpm@12.4.2", "turbo@2.10.13", "typescript@5.9.3 (pinned ^5.7)", "vitest@5.0.1", "zod@4.6.5"]
  patterns:
    - "Discriminated union composed via spread ({ ...BaseEnvelope.shape, type: z.literal(...) }), never chained .extend()"
    - "Dispatch-table reducer keyed by event.type; unrecognized type no-ops instead of throwing"
    - "Every reducer handler returns a new object (spread), never mutates state in place"

key-files:
  created:
    - pnpm-workspace.yaml
    - turbo.json
    - tsconfig.json
    - package.json
    - .gitignore
    - packages/event-schema/package.json
    - packages/event-schema/tsconfig.json
    - packages/event-schema/src/envelope.ts
    - packages/event-schema/src/payloads/index.ts
    - packages/event-schema/src/index.ts
    - packages/event-schema/src/envelope.test.ts
    - packages/company-core/package.json
    - packages/company-core/tsconfig.json
    - packages/company-core/src/projections.ts
    - packages/company-core/src/reducer.ts
    - packages/company-core/src/index.ts
    - packages/company-core/src/reducer.test.ts
  modified: []

key-decisions:
  - "corepack was unavailable on this machine (Node 25 does not ship it on PATH) — fell back to `npm install -g pnpm`, which resolved pnpm@12.4.2, pinned as the root package.json packageManager field per RESEARCH.md Open Question 2's resolution mechanism."
  - "Added a `companies: Record<string, CompanyState>` slot to ProjectionState beyond the plan's literal agents/floors/teams/projects/tasks five — company.started needed somewhere to materialize a company-scoped record, and this is additive (does not remove or reshape the five required kinds Plan 02 depends on)."

patterns-established:
  - "Unscoped package names (event-schema, company-core) matching the mandated pnpm --filter verify commands"
  - "vitest run (never bare vitest) as every package's test script, avoiding watch-mode hangs in automated verification"

requirements-completed: [EVENT-01, EVENT-03, EVENT-04]

coverage:
  - id: D1
    description: "company.started event with all required envelope fields passes .safeParse(); missing visibility or an invalid type literal is rejected"
    requirement: "EVENT-01"
    verification:
      - kind: unit
        ref: "packages/event-schema/src/envelope.test.ts#CompanyEventSchema — company.started"
        status: pass
    human_judgment: false
  - id: D2
    description: "fold([]) returns emptyState() untouched; fold([event]) applies exactly the company.started handler; an unrecognized type no-ops instead of throwing"
    requirement: "EVENT-03"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#fold — empty and single-event application"
        status: pass
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#reduce — unknown event types"
        status: pass
    human_judgment: false
  - id: D3
    description: "Folding the same event twice, each from a fresh empty ProjectionState, produces deep-equal results (replay determinism)"
    requirement: "EVENT-04"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#replay determinism"
        status: pass
    human_judgment: false
  - id: D4
    description: "pnpm workspace bootstraps and both packages build/test independently via pnpm --filter <pkg> test, and pnpm turbo run test picks up both via the task graph"
    verification:
      - kind: unit
        ref: "pnpm --filter event-schema test -- envelope.test.ts && pnpm --filter company-core test -- reducer.test.ts"
        status: pass
      - kind: integration
        ref: "pnpm turbo run test"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-09-18
status: complete
---

# Phase 1 Plan 1: Event Schema & State Engine Tracer Summary

**Zod discriminated-union event envelope + pure dispatch-table reducer, proven end-to-end with `company.started` and replay-deterministic folding, on a freshly bootstrapped pnpm/Turborepo workspace**

## Performance

- **Duration:** 24 min (this session — Task 1's checkpoint wait excluded)
- **Started:** 2026-09-18T05:05:00Z (approx, continuation agent)
- **Completed:** 2026-09-18T05:29:56Z
- **Tasks:** 3 (Task 1 checkpoint approved by human prior to this session)
- **Files modified:** 17 created

## Accomplishments
- pnpm workspace bootstrapped with exactly D-02's scope: `pnpm-workspace.yaml`, `turbo.json`, root `tsconfig.json`, `packages/event-schema`, `packages/company-core` — no `apps/*` or extra `packages/*` stubs
- `CompanyEventSchema` discriminated union (Zod `^4.6`) seeded with one member, `company.started`, built via spread composition (never chained `.extend()`)
- `BaseEnvelope` with all EVENT-01 required fields (id/version/occurredAt/companyId/floorId/projectId/taskId/sourceAgentId/destinationAgentId/visibility) — `visibility` is a required literal, never optional/defaultable (EVENT-01 safety prohibition)
- `packages/company-core` reducer: dispatch-table `reduce()`/`fold()`, pure (no `Date.now()`/`crypto.randomUUID()`/module-mutable state), unrecognized types no-op rather than throw
- Replay-determinism proven directly: `fold([event])` called twice from fresh state produces deep-equal `ProjectionState`

## Task Commits

Each task was committed atomically (Task 3 is TDD — RED/GREEN commits):

1. **Task 2: Bootstrap pnpm workspace + package scaffolding (D-02)** - `0b4ece5` (feat)
2. **Task 3 RED: failing tests for company.started validation and reducer fold** - `9f3d6d0` (test)
3. **Task 3 GREEN: implement company.started event validation and reducer fold** - `c549c87` (feat)

_Task 1 (package-legitimacy checkpoint) required no commit — it is a human-verify gate with no code changes; approved prior to this session._

_No REFACTOR commit — the GREEN implementation was already minimal; no cleanup needed._

## Files Created/Modified
- `pnpm-workspace.yaml` - workspace glob (`packages/*`)
- `package.json` - root manifest, `packageManager` pinned to resolved `pnpm@12.4.2`
- `tsconfig.json` - shared base compiler options (ES2022, NodeNext, strict)
- `turbo.json` - Turborepo 2.x `tasks.test` pipeline entry
- `.gitignore` - excludes `node_modules/`, `dist/`, `.turbo/` (missing from repo, added per Rule 2)
- `packages/event-schema/src/envelope.ts` - `VisibilitySchema` + `BaseEnvelope`
- `packages/event-schema/src/payloads/index.ts` - `CompanyEventSchema` discriminated union
- `packages/event-schema/src/index.ts` - barrel export
- `packages/event-schema/src/envelope.test.ts` - safeParse accept/reject tests
- `packages/company-core/src/projections.ts` - `ProjectionState` (companies/agents/floors/teams/projects/tasks) + `emptyState()`
- `packages/company-core/src/reducer.ts` - dispatch table, `reduce()`/`fold()`
- `packages/company-core/src/index.ts` - barrel export
- `packages/company-core/src/reducer.test.ts` - fold/reduce/replay-determinism tests

## Decisions Made
- **corepack unavailable, fell back to `npm install -g pnpm`:** Node v25.9.0 on this machine does not expose `corepack` on `PATH`. Per the plan's own fallback instruction, ran `npm install -g pnpm`, which resolved `pnpm@12.4.2`. Pinned into root `package.json`'s `packageManager` field rather than forcing RESEARCH.md's placeholder `^9`, matching RESEARCH.md Open Question 2's resolution.
- **Added `companies` slot to `ProjectionState`:** the plan's artifact description names `agents/floors/teams/projects/tasks` as the five required projection kinds, but `company.started` needed somewhere to materialize a company-scoped record to make the "applies exactly the company.started handler" test assertion meaningful. Added `companies: Record<string, CompanyState>` as an additive sixth slot — does not alter or remove any of the five required kinds Plan 02 will extend.
- **Added `.gitignore`:** none existed in the repo; without it, `node_modules/` and `.turbo/` would have been committed. Rule 2 (missing critical functionality).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `.gitignore`**
- **Found during:** Task 2 (workspace bootstrap)
- **Issue:** No `.gitignore` existed anywhere in the repo; `pnpm install` would have left `node_modules/` untracked-but-committable, and a bare `git add` risk.
- **Fix:** Added `.gitignore` excluding `node_modules/`, `dist/`, `*.log`, `.turbo/`
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` after `pnpm install` and `pnpm turbo run test` shows no untracked build artifacts
- **Committed in:** `0b4ece5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for repo hygiene; no scope creep beyond the plan's D-02 bootstrap scope.

## Issues Encountered
- `corepack` was not present on `PATH` despite Node v25.9.0 (RESEARCH.md's Environment Availability section had already flagged this as a possibility) — resolved via the plan's documented fallback (`npm install -g pnpm`), no further investigation needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `packages/event-schema` and `packages/company-core` are both green and independently testable via `pnpm --filter <pkg> test`; `pnpm turbo run test` confirms the Turborepo task graph picks up both.
- Plan 02 can extend `CompanyEventSchema`'s discriminated union and the reducer's dispatch table with the remaining 11 seeded event categories against the same `ProjectionState` shape (plus the additive `companies` slot introduced here).
- Carry-forward reminder (D-03, tracked in STATE.md Blockers/Concerns): Phase 2 planning MUST name dedup-at-ingestion as an explicit requirement — this phase's reducer intentionally assumes ordered, exactly-once input.

---
*Phase: 01-event-schema-state-engine*
*Completed: 2026-09-18*

## Self-Check: PASSED

All 13 claimed files found on disk; all 3 claimed commit hashes (0b4ece5, 9f3d6d0, c549c87) found in git log.

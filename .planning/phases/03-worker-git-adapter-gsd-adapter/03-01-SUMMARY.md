---
phase: 03-worker-git-adapter-gsd-adapter
plan: 01
subsystem: api
tags: [zod, fastify, websocket, event-sourcing, drizzle, vitest]

requires:
  - phase: 02-control-plane-skeleton
    provides: authenticated WS gateway (GET /ws, authenticateWorker), POST /events ingestion path, worker credential issuance
provides:
  - CompanyEventSchema extended to 15 members (worker.heartbeat, git.worktree_observed, gsd.phase_observed)
  - Live-derived worker connection status (online/stale/offline) with zero new persisted columns
  - request.workerId available to all authenticated-worker route handlers
  - company-core reducer/projection slots ready for the git/gsd adapters (Plans 02-04)
affects: [03-02-git-adapter, 03-03-gsd-adapter, 03-04-worker-integration]

actuals:
  tokens: 7100
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Connection status derived live from an in-memory Map<workerId, {lastHeartbeatAt, socketOpen}>, never persisted as a DB column"
    - "Authenticated identity (request.workerId) set once in preValidation, read by downstream handlers instead of re-parsing headers or trusting client payload"

key-files:
  created:
    - apps/api/src/ws/connection-status.ts
    - apps/api/src/ws/connection-status.test.ts
    - apps/api/src/routes/connection-lifecycle.test.ts
    - packages/event-schema/src/payloads/index.test.ts
  modified:
    - packages/event-schema/src/payloads/index.ts
    - apps/api/src/auth/worker-auth.ts
    - apps/api/src/routes/ws.ts
    - apps/api/src/routes/events.ts
    - apps/api/src/routes/admin-workers.ts
    - packages/company-core/src/projections.ts
    - packages/company-core/src/reducer.ts
    - packages/company-core/src/reducer.test.ts

key-decisions:
  - "worker.heartbeat payload is an empty object — identity comes exclusively from the authenticated request.workerId, never a client-supplied field (T-03-01 Tampering mitigation)"
  - "Connection status is a derived read over heartbeat receipt time + socket-open state, not a second persisted source of truth (RESEARCH.md Pattern 5)"
  - "worker.heartbeat has no company-core reducer handler by design — connection status lives server-side only, never in ProjectionState"

patterns-established:
  - "Pattern: new discriminated-union members appended via spread, plain z.object() payloads, never .extend()/.looseObject() — same rule as the original 12"
  - "Pattern: reducer handlers for optional-taskId events no-op via `if (!taskId || !existing) return state`, mirroring git.commit_created exactly"

requirements-completed: [RUNTIME-04]

coverage:
  - id: D1
    description: "CompanyEventSchema validates worker.heartbeat, git.worktree_observed, and gsd.phase_observed (accept valid, reject missing required fields)"
    requirement: "RUNTIME-04"
    verification:
      - kind: unit
        ref: "packages/event-schema/src/payloads/index.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live online/stale/offline derivation from heartbeat timing + socket open/close state (connection-status.ts)"
    requirement: "RUNTIME-04"
    verification:
      - kind: unit
        ref: "apps/api/src/ws/connection-status.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A real WS connection + a real POST /events heartbeat makes GET /admin/workers report 'online'; closing the socket flips it to 'offline'"
    requirement: "RUNTIME-04"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/connection-lifecycle.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "company-core reducer/projection handlers for git.worktree_observed and gsd.phase_observed, with worker.heartbeat as an intentional no-op"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 1: Worker Connection Status Tracer Summary

**Live worker online/stale/offline status derived from heartbeat events + WS socket state, proven end-to-end through a real WS connection and POST /events call, with company-core reducer slots ready for the git/gsd adapters.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-20 (Phase 3 execution start)
- **Completed:** 2026-09-20T01:47:50Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Extended `CompanyEventSchema` from 12 to 15 discriminated-union members (`worker.heartbeat`, `git.worktree_observed`, `gsd.phase_observed`), following the existing spread-composition/plain-`z.object()` convention exactly
- Built `apps/api/src/ws/connection-status.ts`: an in-memory registry deriving `online`/`stale`/`offline` live from heartbeat receipt time + socket-open state, implementing D-03's exact thresholds (10s online window, 30s offline window) — zero new DB columns
- Wired the real data path end-to-end: `worker-auth.ts` sets `request.workerId` on successful auth → `ws.ts` tracks socket open/close/error → `events.ts` records heartbeats keyed by the *authenticated* `request.workerId` (never the client-supplied payload) → `admin-workers.ts` surfaces live status per worker
- Proved the tracer with a real integration test: a real `ws` client opens a connection, POSTs a `worker.heartbeat` via `/events`, `GET /admin/workers` reports `"online"`; closing the socket flips it to `"offline"`
- Extended `packages/company-core` (TDD: RED → GREEN, 2 commits) with `git.worktree_observed` (merges repo/branch/worktreePath/headSha/sessionId onto an existing task, no-ops otherwise) and `gsd.phase_observed` (always populates `state.gsdObservations[companyId]`) reducer handlers, ready for Plans 02-04's git/gsd adapters

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — worker.heartbeat flows through POST /events, control plane derives live online/stale/offline status** - `d32d44b` (feat)
2. **Task 2: company-core reducer + projection additions** - `b3b20f6` (test — RED), `a0174ec` (feat — GREEN; no REFACTOR needed, implementation matched existing handler shape exactly on first pass)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/event-schema/src/payloads/index.ts` - 3 new payload schemas + 3 new discriminated-union members
- `packages/event-schema/src/payloads/index.test.ts` - accept/reject coverage for the 3 new event types
- `apps/api/src/ws/connection-status.ts` - in-memory online/stale/offline registry (D-03 thresholds)
- `apps/api/src/ws/connection-status.test.ts` - unit coverage for all 4 threshold transitions
- `apps/api/src/auth/worker-auth.ts` - `request.workerId` augmentation, set on successful auth
- `apps/api/src/routes/ws.ts` - `(socket, request)` handler now tracks open/close/error via connection-status.ts
- `apps/api/src/routes/events.ts` - records heartbeats keyed by authenticated `request.workerId`
- `apps/api/src/routes/admin-workers.ts` - `GET /admin/workers` now includes a live `status` field per worker
- `apps/api/src/routes/connection-lifecycle.test.ts` - integration proof of the online→offline transition
- `packages/company-core/src/projections.ts` - `TaskState` git fields, new `GsdObservationState` + `gsdObservations` slot
- `packages/company-core/src/reducer.ts` - `git.worktree_observed` and `gsd.phase_observed` handlers
- `packages/company-core/src/reducer.test.ts` - RED tests + no-op/replay-determinism coverage for all 3 new event types

## Decisions Made
- `worker.heartbeat`'s payload is `z.object({})` — identity comes solely from the authenticated connection (T-03-01 Tampering mitigation), matching the plan's explicit design
- No REFACTOR commit for Task 2 — the GREEN implementation matched the existing `git.commit_created`/`company.started` handler shapes on the first pass, nothing to clean up

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `pnpm run typecheck` in `apps/api` surfaces pre-existing `TS2835` (missing `.js` extension) errors in `packages/event-schema/src/index.ts` — confirmed via `git diff` to be unmodified by this plan, out of scope per the executor's scope boundary. All files this plan created use explicit `.js`/no-extension consistent with their package's existing convention, and none of that pre-existing debt appears in `apps/api`'s own test run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `packages/git-adapter` and `packages/gsd-adapter` (Plans 02-03) can now emit `git.worktree_observed`/`gsd.phase_observed` events that company-core already knows how to reduce
- `apps/worker` (Plan 04) can now send `worker.heartbeat` over the exact WS+POST /events path this plan proved end-to-end
- No blockers or concerns carried forward

---
*Phase: 03-worker-git-adapter-gsd-adapter*
*Completed: 2026-09-20*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 3 task commits (`d32d44b`, `b3b20f6`, `a0174ec`) verified present in git log.

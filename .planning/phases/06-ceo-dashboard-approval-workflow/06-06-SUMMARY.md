---
phase: 06-ceo-dashboard-approval-workflow
plan: 06
subsystem: control-plane-api
status: complete
tags: [ceo, decisions, privacy, websocket, projection, tdd]
requires: ["06-13", "06-05"]
provides:
  - "packages/company-core/src/decisions.ts: DecisionRequestView, DecisionRecord, DecisionsState, PendingItem, emptyDecisions, applyDecisionEvent, foldDecisions, pendingQueue, decisionHistory, isResumable (exported from company-core)"
  - "apps/api/src/ws/browser-connections.ts: acceptsOffice, acceptsCeo, registerBrowserSocket(socket, accepts = acceptsOffice)"
  - "GET /ceo/ws (WebSocket): requireOrigin + requireCeo, 20/min, first message { type: snapshot, state: DecisionsState }, then ceo.* events"
  - "/ws/browser: no PRIVATE event live or in the snapshot"
affects: [06-07, 06-08, 06-09, 06-10, 06-14]
tech-stack:
  added: []
  patterns:
    - "Per-socket event filter in the browser registry, applied before queue/send; non-event messages reach every socket"
    - "serveSnapshotThenRelay(fastify, socket, label, accepts, buildState): one register -> SELECT -> snapshot -> flush path (CR-03) for both browser feeds"
    - "Decision projection kept out of reduce()/ProjectionState; server snapshot and client live updates share applyDecisionEvent"
key-files:
  created:
    - packages/company-core/src/decisions.ts
    - packages/company-core/src/decisions.test.ts
    - .planning/phases/06-ceo-dashboard-approval-workflow/deferred-items.md
  modified:
    - packages/company-core/src/index.ts
    - packages/company-core/src/reducer.test.ts
    - apps/api/src/ws/browser-connections.ts
    - apps/api/src/ws/browser-connections.test.ts
    - apps/api/src/routes/ws-browser.ts
    - apps/api/src/routes/ws-browser.test.ts
    - apps/api/src/routes/ceo-decisions.test.ts
key-decisions:
  - "A request without threadId is its own thread (threadId defaults to decisionId); round = 1 + earlier records in the same thread by arrival order"
  - "History sorts by closed time (expiredAt, else decidedAt) newest first, ties by arrival index; foldDecisions keeps the newest historyLimit closed records plus every record of a thread that still has a pending one"
  - "isResumable compares the task's latest ceo.task_resume_requested time against expiredAt, and also turns false once a newer request for the same taskId exists"
  - "Office sockets no longer see ceo.approval_requested, so the office task status 'awaiting_approval' is no longer set there; the CEO-room walk is driven by task.status_changed waiting_for_review (INTERNAL) and is unaffected"
requirements-completed: [CEO-02, CEO-05]
duration: 14 min
completed: 2026-09-24
plan_head_before: 31544ad191200b1a5653ef1b138b056a8a9beaf9
actuals:
  tokens: 10028
  tasks: 3
  commits: 6
coverage:
  - deliverable: "foldDecisions: pending queue, Discuss rounds, history and resumability from ceo.* events"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/company-core/src/decisions.test.ts (13 tests: empty/Phase 4 edges, adjacency, equal-timestamp order, rounds, decided+expired, history cap, historyLimit pruning, isResumable, purity)"
        status: pass
  - deliverable: "Office feed carries no PRIVATE event, live or in its snapshot; ProjectionState holds no decision content"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/ws/browser-connections.test.ts#per-socket event filter (Pitfall 2, T-06-06-01)"
        status: pass
      - kind: test
        ref: "apps/api/src/routes/ws-browser.test.ts#office feed privacy (Pitfall 2, T-06-06-01)"
        status: pass
      - kind: test
        ref: "packages/company-core/src/reducer.test.ts#ProjectionState never holds decision content (D-08, T-06-06-02)"
        status: pass
  - deliverable: "/ceo/ws: Origin-checked, requireCeo-guarded, snapshot = foldDecisions of stored ceo.* rows, live ceo.* relay"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/routes/ws-browser.test.ts#GET /ceo/ws (CEO-02, T-06-06-03)"
        status: pass
      - kind: command
        ref: "apps/api: npx tsc --noEmit (exit 0); apps/web: npx tsc --noEmit (exit 0)"
        status: pass
---

# Phase 6 Plan 06: CEO decisions projection, office privacy filter and /ceo/ws Summary

The dashboard now has its data source: a pure `foldDecisions` projection in company-core, a `/ceo/ws` feed guarded by Origin and `requireCeo` that opens with that projection as its snapshot, and a per-socket filter that keeps every PRIVATE event off the office canvas feed, live and in its snapshot.

- Start: 2026-09-24T05:03:59Z. End: 2026-09-24T05:17:43Z (14 min). 3 tasks, 9 source files.

## Accomplishments

- **`foldDecisions` (Task 1).** `decisions.ts` imports only types from event-schema, so the 06-14 e2e spec can import it by relative path. `applyDecisionEvent` is pure. It ignores non-ceo events, Phase 4 requests with no `decisionId`, and replayed requests. When a request is both decided and expired, expired sets the status and the decision stays attached (CEO-05, research Open Question 5). `pendingQueue` returns one item per thread, oldest first, with arrival order breaking ties, plus `round` and the `earlier` records. `decisionHistory` returns closed records newest first, capped at 50. `foldDecisions` drops closed records beyond `historyLimit` unless their thread still has a pending record, because each request can carry a 64 KiB diff.
- **Office privacy (Task 2).** Each browser socket now has its own `accepts` filter. `acceptsOffice` is the default and drops PRIVATE events. `acceptsCeo` accepts only `ceo.*` events. `broadcastToBrowsers` still stringifies once, then skips any socket whose filter rejects the event, before queueing or sending. The `/ws/browser` snapshot SELECT excludes `visibility = 'PRIVATE'` rows, so the snapshot and the live path apply the same rule.
- **`/ceo/ws` (Task 3).** The route is registered inside `registerWsBrowserRoute` with `preValidation [requireOrigin, requireCeo]`, a limit of 20 upgrades per minute, and no query token. Both feeds now share one `serveSnapshotThenRelay` helper, so register → SELECT → snapshot → flush and the catch/close/error handling exist in one place.

## Task Commits

| Task | Gate | Commit | Message |
|------|------|--------|---------|
| 1 | RED | 8ae904e | test(06-06): add failing tests for foldDecisions, the CEO decisions projection |
| 1 | GREEN | a2321ea | feat(06-06): foldDecisions, one projection for the CEO snapshot and every live update |
| 2 | RED | be3355c | test(06-06): add failing tests for keeping PRIVATE events off the office feed |
| 2 | GREEN | a83a48e | feat(06-06): the office feed never carries PRIVATE events, live or in its snapshot |
| 3 | RED | 5083e2f | test(06-06): add failing tests for /ceo/ws, the private decisions feed |
| 3 | GREEN | d9ab7ff | feat(06-06): /ceo/ws, the private, authenticated decisions feed |

## TDD Gate Compliance

Each RED record came from `npx vitest run <files> --reporter=tap-flat`. The three node:test counters were counted from that same run's `ok` and `not ok` lines. Each record uses camelCase `exitCode`/`targetTest`, and all three returned **`RED_EVIDENCE_OK` (target_test_failed)**.

| Run | Tests | Pass | Fail | Target failure |
|-----|-------|------|------|----------------|
| Task 1 | 13 | 5 | 8 | decided + expired: status assertion against the signature-only skeleton (`records[A]` undefined) |
| Task 2 | 19 | 14 | 5 | office socket after a PRIVATE post: `actual eventType "ceo.approval_requested"`, expected `task.status_changed` |
| Task 3 | 13 | 9 | 4 | foreign Origin: `expected 404 to be 403` (route not registered yet) |

Task 1's RED commit includes a signature-only `decisions.ts` skeleton so the run fails on assertions, not on module resolution. Five tests already passed during RED because the skeleton trivially satisfies them: the two empty-input cases, the purity case, "a decided record is never resumable", and "a newer request ends resumability". The office-snapshot privacy test and the reducer privacy test also passed during RED. `reduce()` never copied request strings, and the snapshot's content was already free of them. Both stay as regression guards, as the plan asks.

## Verification

- `packages/company-core`: `npx vitest run`, 3 files, 60 tests, pass.
- `apps/api`: `npx vitest run` (the full suite against Postgres on 5434), 12 files, 111 tests, pass. `npx tsc --noEmit` exit 0.
- `apps/web`: `npx tsc --noEmit` exit 0.
- Acceptance greps: `"/ceo/ws"` in ws-browser.ts, the 403 assertion, `foldDecisions(after)` toEqual, the reducer `privateStrings.filter(...)).toEqual([])` check, the `task.status_changed` toEqual, and `acceptsOffice` in browser-connections.ts all match. decisions.ts has one `^import type` line and zero `^import {` lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ceo-decisions test relied on the office feed carrying a PRIVATE event**
- **Found during:** Task 3 (full api suite)
- **Issue:** `POST /events ceo.* rules > stamps ceo.approval_requested payload.workerId...` observed the relayed PRIVATE request on `/ws/browser`. That is exactly the leak this plan closes, so the test timed out.
- **Fix:** The test now observes the relay on `/ceo/ws` with the allowlisted Origin. Its env header already sets the dev bypass. The assertion is unchanged.
- **Files modified:** apps/api/src/routes/ceo-decisions.test.ts
- **Commit:** d9ab7ff

**2. [Rule 3 - Blocking] ws-browser.test.ts applied only migrations 0000-0002**
- **Found during:** Task 3
- **Fix:** Added 0003 and 0004 to its idempotent migration list so the decision POST runs against the same schema as ceo-decisions.test.ts.
- **Commit:** 5083e2f

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). **Impact:** test-only. No production scope change.

## Notes for downstream plans

- Office sockets no longer receive `ceo.approval_requested`. The office `ProjectionState` therefore never shows task status `awaiting_approval`. The CEO-room walk (06-07/pixel-office) is derived from `task.status_changed` `waiting_for_review`, which is INTERNAL, so it still works.
- The `/ceo/ws` snapshot test brackets its comparison with two reads that must return the same number of `ceo.*` rows, retrying up to 5 times. Other api test files write `ceo.*` rows concurrently, since vitest runs files in parallel.
- Clients should apply `applyDecisionEvent` to each `{ type: "event", event }`. A decision event for a record the snapshot pruned is a no-op by design.

## Deferred Issues

- Pre-existing TS2345 errors in `packages/company-core/src/reducer.test.ts` (test-only typing). Logged in `deferred-items.md` and not touched.

## Threat Flags

None. `/ceo/ws` is the planned surface (T-06-06-03/04/05), and it is guarded as the threat model specifies.

## Self-Check: PASSED

- Created files exist: decisions.ts, decisions.test.ts, deferred-items.md.
- Commits 8ae904e, a2321ea, be3355c, a83a48e, 5083e2f and d9ab7ff are all in `git log`. `git rev-list --count 31544ad..HEAD` = 6.

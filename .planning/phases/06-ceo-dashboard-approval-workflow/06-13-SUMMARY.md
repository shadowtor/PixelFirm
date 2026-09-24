---
phase: 06-ceo-dashboard-approval-workflow
plan: 13
subsystem: control-plane-api
status: complete
tags: [ceo, decisions, websocket, csrf, auth, tdd]
requires: ["06-01"]
provides:
  - "POST /ceo/api/decisions/:decisionId (registerCeoRoute, DecisionBodySchema)"
  - "ws/worker-connections.ts: registerWorkerSocket, unregisterWorkerSocket, isWorkerConnected, sendToWorker, _resetWorkerSocketsForTests"
  - "auth/ceo-auth.ts: requireCeo (dev-bypass path), DEV_CEO_IDENTITY, isLoopbackAddress; FastifyRequest.ceoEmail / ceoDevBypass"
  - "auth/csrf.ts: requireOrigin, requireCsrf"
  - "env.ts: parseEnv plus CEO_DEV_AUTH_BYPASS, CEO_ALLOWED_ORIGINS, NODE_ENV"
  - "/events: server-side workerId stamping on ceo.approval_requested, PRIVATE-only ceo.*, ceo.decision_applied + ceo.approval_expired allowed"
affects: [06-04, 06-05, 06-06, 06-12]
tech-stack:
  added: []
  patterns:
    - "Module-state socket registry keyed by the authenticated workerId; unregister only if still the registered socket"
    - "preValidation chain [requireCsrf, requireCeo]: CSRF refusal before auth and before any DB work"
    - "Dev auth keyed on request.socket.remoteAddress, never request.ip (trustProxy follows X-Forwarded-For)"
key-files:
  created:
    - apps/api/src/ws/worker-connections.ts
    - apps/api/src/auth/ceo-auth.ts
    - apps/api/src/auth/csrf.ts
    - apps/api/src/routes/ceo.ts
    - apps/api/src/routes/ceo-decisions.test.ts
  modified:
    - apps/api/src/routes/events.ts
    - apps/api/src/routes/ws.ts
    - apps/api/src/env.ts
    - apps/api/src/server.ts
key-decisions:
  - "The clarifying_question answers check (400 answers required) runs before the worker-offline check, so an input error never hides behind a 503"
  - "The decision route parses its ceo.decision_made through CompanyEventSchema before insert, so the stored audit row is always replayable by fold()"
  - "If the worker socket closes between the online check and the send, the decision stays recorded and undelivered; the hello reconcile (RESEARCH Pattern 4, a later plan) resends it"
requirements-completed: [CEO-03, CEO-04, CEO-05]
duration: 14 min
completed: 2026-09-24
plan_head_before: 7b058e1b2a7aad3ba39bdc183f47b661e5e3bc7e
actuals:
  tokens: 10157
  tasks: 3
  commits: 6
coverage:
  - deliverable: "Approval requests pinned to the posting worker; ceo.* event rules on /events"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#POST /events ceo.* rules"
        status: pass
  - deliverable: "Worker socket registry and schema-validated downlink"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#worker socket registry (downlink)"
        status: pass
  - deliverable: "CEO decision route: PRIVATE ceo.decision_made audit row + delivery to the owning worker, fail-closed dev auth"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#POST /ceo/api/decisions/:decisionId"
        status: pass
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#parseEnv CEO_DEV_AUTH_BYPASS guard"
        status: pass
  - deliverable: "D-12 CSRF guard and D-07 note/answers rules"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#D-12 CSRF guard on /ceo/api"
        status: pass
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#D-07 per-action note rules and question answers"
        status: pass
---

# Phase 6 Plan 13: Control-Plane Decision Route and Worker Downlink Summary

**A CEO decision POSTed to `/ceo/api/decisions/:decisionId` is now recorded as a PRIVATE `ceo.decision_made` audit event and sent as a `WorkerDownlinkSchema` frame down the WebSocket of the worker that posted the request. That worker's identity is stamped server-side from its credential. The route sits behind the D-12 CSRF guard (exact Origin, `X-PixelFirm-CSRF: 1`, JSON) and a dev-only auth path that fails closed: the bypass flag plus a loopback socket peer, and a boot-time refusal under `NODE_ENV=production`. With 06-01 this closes the approval round trip from the API to the worker broker to the runtime.**

## Performance

- Duration: 14 min (start 2026-09-24T04:04Z, end 2026-09-24T04:18Z)
- Tasks: 3, 6 commits (RED + GREEN for each)
- Files: 5 created, 4 modified

## Accomplishments

- **/events (T-06-13-03/04/07):** `ceo.approval_requested` stores and relays `payload.workerId = request.workerId`, whatever the body sent. Workers may now post `ceo.decision_applied` and `ceo.approval_expired`. They still cannot post `ceo.decision_made` or `ceo.task_resume_requested` (403). Any `ceo.*` event that is not PRIVATE gets a 400 `{"error":"ceo events must be PRIVATE"}`.
- **Downlink registry (T-06-13-05):** `worker-connections.ts` keeps one socket per worker. A reconnect replaces the old socket, and a stale socket's close never unregisters its replacement. `sendToWorker` runs every frame through `WorkerDownlinkSchema.parse` and returns false when the worker is offline.
- **Decision route:** returns 202 `{accepted, decisionId}`, 400 for a bad id or body, and 404 `unknown decision`. It returns 503 `worker offline` before appending anything, so the agent keeps waiting. The payload omits undefined keys: approve and reject with no note store no `note` key. The route never logs the body.
- **Auth (T-06-13-01):** `requireCeo` accepts only when `CEO_DEV_AUTH_BYPASS` is on and the socket peer is loopback. It returns 401 for a non-loopback peer (including one that forges `X-Forwarded-For: 127.0.0.1`), when the bypass is off, and for `BROWSER_ACCESS_TOKEN`. `parseEnv` throws, naming `CEO_DEV_AUTH_BYPASS`, when the bypass is on with `NODE_ENV=production`.
- **CSRF (T-06-13-02):** `requireCsrf` runs first in the preValidation chain. A request for an unknown decision without the header gets 403, not 404. `CEO_ALLOWED_ORIGINS` defaults to empty, which refuses every browser POST.
- **D-07:** `request_changes`, `more_research` and `discuss` need a note with non-whitespace content. Approving a `clarifying_question` needs non-empty answers. For any other request kind, answers are dropped before the insert and before the downlink.

## Task Commits

| Task | Step | Commit | Message |
|------|------|--------|---------|
| 1 | RED | 6e3dee1 | test(06-13): add failing tests for workerId stamping, ceo.* event rules and the worker socket registry |
| 1 | GREEN | 0a24a59 | feat(06-13): pin approval requests to the posting worker and add the worker socket downlink |
| 2 | RED | bd66079 | test(06-13): add failing tests for the CEO decision route and the dev-bypass env guard |
| 2 | GREEN | b99862b | feat(06-13): record CEO decisions as PRIVATE ceo.decision_made and send them to the owning worker |
| 3 | RED | 8079bf1 | test(06-13): add failing tests for the D-12 CSRF guard and the D-07 note and answers rules |
| 3 | GREEN | a86ac06 | feat(06-13): guard the decision route with the D-12 CSRF check and enforce the D-07 note and answers rules |

No refactor commits were needed.

## TDD Gate Compliance

Each RED record came from `npx vitest run ceo-decisions --reporter=tap-flat` in `apps/api`. The `# tests/# pass/# fail` counters were counted from that same run's own `ok`/`not ok` lines, and none were invented. The record uses camelCase `exitCode`/`targetTest`, with `targetTest` set to the full vitest test path. Every record returned **`RED_EVIDENCE_OK` (target_test_failed)**.

| Run | Tests | Pass | Fail | Target failure |
|-----|-------|------|------|----------------|
| Task 1 | 9 | 2 | 7 | workerId stamping: `expected 'forged-worker-id' to be 'ceo-decisions-test-worker'` |
| Task 2 | 19 | 9 | 10 | approve round trip: `expected 404 to be 202` |
| Task 3 | 32 | 22 | 10 | missing CSRF header: `expected 202 to be 403` |

The tests that passed during RED were expected. In Task 1, the two 403 tests for `ceo.decision_made` and `ceo.task_resume_requested` passed because those types were already outside the allowlist; they now guard against regressions. In Task 3, the tests for request_changes with a real note, reject with no note, and question approve with answers passed as positive paths that the new rules must not break. Task 1's RED commit also included an `export {}` stub for `worker-connections.ts`, so the RED run loaded cleanly (the 06-01 convention).

## Verification

- `pnpm --filter api test -- ceo-decisions`: 32 passed.
- `pnpm --filter api test` (whole suite): 11 files, 78 tests passed. The env refactor broke no existing test file, and none of them needed new env.
- `pnpm --filter api typecheck`: 0 errors.
- Acceptance greps: `workerId: request.workerId` is at events.ts:60, and `requireCsrf, requireCeo` is at ceo.ts:40.
- No "Reply was already sent" or FST_ERR lines in the test log, so a CSRF refusal ends the preValidation chain cleanly.

## Deviations from Plan

**1. [Rule 3 - Blocking] The decision-route tests share one fake worker socket**
- **Found during:** Task 3 RED
- **Issue:** `/ws` allows 20 upgrades a minute per IP. Opening one socket per test took the file past that limit, and the 429 errors hid the real failures.
- **Fix:** `openRequest()` reuses one open worker socket and reconnects only when it has been closed, which happens only in the offline test. The Task 1 registry tests still open and close their own sockets on purpose.
- **Commit:** 8079bf1

**2. [Rule 2 - Correctness] The answers check runs before the worker-offline check**
- **Found during:** Task 3 GREEN
- **Issue:** The action text puts the answers rule after the lookup, and the offline check was already there. In that order, a missing-answers input error would come back as a 503 whenever the worker was offline.
- **Fix:** The route now does lookup, then answers validation, then the offline check, then the insert.
- **Commit:** a86ac06

**Total deviations:** 2 auto-fixed (1 blocking test-harness issue, 1 correctness). **Impact:** none on scope.

## Issues Encountered

- A Bash heredoc that carried a multi-line Python edit failed to parse in this shell. The edit went through a script file in the scratchpad instead. There was no effect on the repo.

## Known Stubs

None that block this plan's goal. `requireCeo` has only the dev-bypass path. This is intentional: 06-05 adds Cloudflare Access JWT verification inside the same function, and until then every non-dev request gets a 401 (fail closed). The worker does not yet connect `handleDownlink` to its socket; 06-04 does that.

## Threat Flags

None. All new surface is in the plan's threat model (T-06-13-01 to -08), and each is mitigated with a test. The one exception is T-06-13-08 (no body logging), which the route code enforces and no test checks. Also carried: the second Pitfall 7 guard, `ENV NODE_ENV=production` in `apps/api/Dockerfile`, is not part of this plan. It belongs with the 06-12 deploy work. The boot-time throw only fires if production sets `NODE_ENV`.

## Next Phase Readiness

06-04 can connect `createDecisionBroker().handleDownlink` to the worker socket. The API side now sends exactly the frame shape the broker parses. 06-05 can add the Access JWT path to `requireCeo`, `GET /ceo/api/me`, and the one-decision-per-request index with 409s, reusing the `ceo-decisions.test.ts` harness. Until 06-06 lands, `broadcastToBrowsers` still relays PRIVATE `ceo.*` events to `/ws/browser`. Nothing deploys before 06-12.

## Self-Check: PASSED

- FOUND: apps/api/src/ws/worker-connections.ts, apps/api/src/auth/ceo-auth.ts, apps/api/src/auth/csrf.ts, apps/api/src/routes/ceo.ts, apps/api/src/routes/ceo-decisions.test.ts
- FOUND commits: 6e3dee1, 0a24a59, bd66079, b99862b, 8079bf1, a86ac06

---
phase: 06-ceo-dashboard-approval-workflow
plan: 05
subsystem: control-plane-api
status: complete
tags: [ceo, decisions, audit, cloudflare-access, jwt, jose, tdd]
requires: ["06-13"]
provides:
  - "drizzle/0004_ceo_decision_once.sql: partial unique index events_ceo_decision_once (decisionId, type) for decision_made / decision_applied / approval_expired"
  - "POST /ceo/api/decisions/:decisionId: 409 {error: expired | already decided}, including the lost concurrent race"
  - "/events: bare onConflictDoNothing; ceo.decision_applied / ceo.approval_expired only from the worker stamped on the request (403)"
  - "auth/ceo-auth.ts: makeAccessVerifier, _setAccessVerifierForTests; requireCeo verifies the Cloudflare Access JWT (header, then CF_Authorization cookie) against CEO_EMAIL"
  - "GET /ceo/api/me -> { email, devBypass }"
  - "env.ts: CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, CEO_EMAIL (optional, fail closed)"
affects: [06-06, 06-12]
tech-stack:
  added: ["jose 6.2.10 (exact pin, apps/api)"]
  patterns:
    - "Read-then-insert fast path for 409, with the partial unique index as the real serializer; zero returned rows from onConflictDoNothing().returning() means a lost race"
    - "Module-level verifier built lazily from env; undefined = not built, null = not configured (fail closed); test seam overrides it"
key-files:
  created:
    - apps/api/drizzle/0004_ceo_decision_once.sql
    - apps/api/src/auth/ceo-auth.test.ts
  modified:
    - apps/api/src/routes/events.ts
    - apps/api/src/routes/ceo.ts
    - apps/api/src/routes/ceo-decisions.test.ts
    - apps/api/src/auth/ceo-auth.ts
    - apps/api/src/env.ts
    - apps/api/src/server.ts
    - apps/api/Dockerfile
    - apps/api/package.json
    - pnpm-lock.yaml
key-decisions:
  - "Invalid or missing Access JWTs get the repo's uniform 401 {error: unauthorized}, not the 403 used in Cloudflare's sample, so every CEO auth failure looks the same"
  - "ENV NODE_ENV=production sits after pnpm install in the Dockerfile, so devDependencies (tsx, used by the start script) are still installed"
  - "The expired and already-decided 409 checks run after the answers check and before the worker-offline 503, so a settled request never shows as offline"
requirements-completed: [CEO-04, CEO-05, CEO-03]
duration: 14 min
completed: 2026-09-24
plan_head_before: a9f90cd40acfea8d8c1f62ccc6f75e61462f6ede
actuals:
  tokens: 9376
  tasks: 3
  commits: 5
coverage:
  - deliverable: "One decision per request enforced by Postgres, and a complete ordered audit chain"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#CEO-05 one decision per request (events_ceo_decision_once)"
        status: pass
      - kind: command
        ref: "DATABASE_URL=...pixelfirm_test node apps/api/scripts/migrate.mjs -> applied: 0004_ceo_decision_once.sql"
        status: pass
  - deliverable: "Worker ownership of ceo.decision_applied / ceo.approval_expired, retried duplicate accepted quietly"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#T-06-05-04 worker ownership of ceo.decision_applied / ceo.approval_expired"
        status: pass
  - deliverable: "Cloudflare Access JWT verification in requireCeo, fail closed"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/auth/ceo-auth.test.ts#makeAccessVerifier (local RS256 JWKS, no network)"
        status: pass
      - kind: test
        ref: "apps/api/src/auth/ceo-auth.test.ts#requireCeo with the Access verifier (bypass off)"
        status: pass
  - deliverable: "GET /ceo/api/me, log redaction, NODE_ENV=production in the image"
    human_judgment: false
    verification:
      - kind: test
        ref: "apps/api/src/auth/ceo-auth.test.ts#GET /ceo/api/me returns the verified email and devBypass false"
        status: pass
      - kind: test
        ref: "apps/api/src/routes/ceo-decisions.test.ts#GET /ceo/api/me (dev bypass)"
        status: pass
      - kind: command
        ref: "docker build apps/api/Dockerfile; container printenv NODE_ENV = production; boot with CEO_DEV_AUTH_BYPASS=1 refused; boot without it listens"
        status: pass
  - deliverable: "Real Cloudflare Access token (live team JWKS, real AUD) accepted end to end"
    human_judgment: true
    rationale: "Tests use a local RS256 JWKS. RS256 and the email claim on a real Access token (RESEARCH A6), and the cookie on WebSocket upgrades (A3), can only be checked against the live Access app in 06-12."
---

# Phase 6 Plan 5: One Decision per Request and Cloudflare Access CEO Identity Summary

**Postgres now allows each approval request exactly one `ceo.decision_made`, one `ceo.decision_applied` and one `ceo.approval_expired` (partial unique index `events_ceo_decision_once`). A repeat, late or losing concurrent decision gets a 409 and appends nothing. `requireCeo` now accepts a Cloudflare Access JWT, checked with jose 6.2.10 against the team JWKS (RS256, issuer, audience), whose email must equal `CEO_EMAIL`. That email is recorded as `decidedBy`. `GET /ceo/api/me` tells the dashboard who it is signed in as. The API image runs with `NODE_ENV=production`, so the dev bypass cannot boot there.**

## Performance

- Duration: 14 min (start 2026-09-24T04:45:53Z, end 2026-09-24T05:00:04Z)
- Tasks: 3. Commits: 5 (RED and GREEN for Tasks 1 and 2, then one for Task 3, which was not TDD)
- Files: 2 created, 9 modified

## Accomplishments

- **CEO-05 / T-06-05-03:** Migration 0004 adds the partial unique index. The decision route answers 409 `{"error":"expired"}` once the request has expired and 409 `{"error":"already decided"}` once it is decided. Both checks run before the 503 offline check. The insert uses `onConflictDoNothing().returning()`. Zero rows means a concurrent decision won, so the route returns 409 and sends nothing downstream. The `Promise.all` test gets `[202, 409]`, one row and one worker frame. For each decisionId the audit chain reads `ceo.approval_requested` -> `ceo.decision_made` -> `ceo.decision_applied` in `occurred_at` order.
- **/events (T-06-05-04):** `/events` now uses a bare `.onConflictDoNothing()`, so a retried `decision_applied`/`approval_expired` is a quiet 202 instead of a 23505 500. A worker can post those two event types only for a request stamped with its own `workerId`. An unknown decisionId or another worker's request gets 403 `{"error":"decision not owned by this worker"}`.
- **D-11 (T-06-05-01/02):** `makeAccessVerifier({ teamDomain, audience, jwks? })` wraps `jwtVerify`, rejects a token with no `email` claim (service tokens), and returns the email lowercased. `requireCeo` first tries the unchanged dev path. After that it reads the `Cf-Access-Jwt-Assertion` header, then the `CF_Authorization` cookie. It returns the uniform 401 for any of these: no verifier configured, no token, no `CEO_EMAIL`, verification failure, or an email mismatch. It never reads `BROWSER_ACCESS_TOKEN` and never logs the token.
- **Env:** `CF_ACCESS_TEAM_DOMAIN` (URL, trailing slash stripped), `CF_ACCESS_AUD`, `CEO_EMAIL` (lowercased). All three are optional. If any is missing, every non-dev request gets a 401.
- **Task 3 (T-06-05-05/06):** Added `GET /ceo/api/me` (requireCeo only, 60 requests a minute) returning `{ email, devBypass }`. The logger now redacts `cf-access-jwt-assertion` and `cookie`. The Dockerfile sets `ENV NODE_ENV=production` before `CMD`. This also resolves the 06-13 carry-over: the startup guard is no longer inert in the container.

## Task Commits

| Task | Step | Commit | Message |
|------|------|--------|---------|
| 1 | RED | 79a7517 | test(06-05): add failing tests for one decision per request and worker ownership of applied/expired |
| 1 | GREEN | 7b67037 | feat(06-05): one CEO decision per request, enforced by Postgres, and worker-owned applied/expired |
| 2 | RED | a66cae3 | test(06-05): add failing tests for Cloudflare Access JWT verification in requireCeo |
| 2 | GREEN | f1b5f68 | feat(06-05): the CEO is whoever Cloudflare Access verified, via jose JWT verification |
| 3 | - | 89ac7ff | feat(06-05): GET /ceo/api/me, Access JWT and cookie log redaction, NODE_ENV=production in the API image |

No refactor commits were needed.

## TDD Gate Compliance

Each RED record came from `npx vitest run <file> --reporter=tap-flat` in `apps/api`. The `# tests/# pass/# fail` counters were counted from that same run's `ok`/`not ok` lines. The record uses camelCase `exitCode`/`targetTest`. Both records returned **`RED_EVIDENCE_OK` (target_test_failed)**.

| Run | Tests | Pass | Fail | Target failure |
|-----|-------|------|------|----------------|
| Task 1 | 38 | 33 | 5 | concurrent decisions: `expected [ 202, 500 ] to deeply equal [ 202, 409 ]` (the 500 was the unhandled 23505 from the new index) |
| Task 2 | 13 | 0 | 13 | valid Access token: `expected 'undefined' to be 'function'` (makeAccessVerifier / _setAccessVerifierForTests not yet exported) |

The ordered audit-chain test already passed during Task 1's RED run, because that ordering was already true. It stays as the CEO-05 regression guard the plan asks for. Task 3 is `type="auto"` with no `tdd` flag, so its tests and code landed in one commit.

## Verification

- `pnpm --filter api test` (whole api suite): 12 files, 100 tests passed, three runs in a row.
- `pnpm --filter api typecheck`: 0 errors.
- `migrate.mjs` against `pixelfirm_test`: `applied: 0004_ceo_decision_once.sql`. The `IF NOT EXISTS` index re-applies cleanly. Before the index was created, a duplicate check on the test DB found 0 (decisionId, type) duplicates across 203 `ceo.*` rows.
- Acceptance greps: `onConflictDoNothing({ target` appears 0 times in events.ts and `onConflictDoNothing()` appears once. `"jose": "6.2.10"` is in apps/api/package.json. `req.headers.cookie` is in server.ts. `ENV NODE_ENV=production` comes before `CMD`.
- Image check (`docker build`, then the image was removed): `NODE_ENV=production` inside the container. With `CEO_DEV_AUTH_BYPASS=1` the container refuses to boot with the parseEnv message. Without it, the server listens.
- The docs lookup used Cloudflare's own "Validate JWTs" page, because Context7 was over quota. It confirms `createRemoteJWKSet` on `<team>/cdn-cgi/access/certs`, issuer = team domain, audience = AUD, and the header preferred over the cookie. The one difference is status codes: the sample returns 403, and this code keeps the plan's uniform 401.

## Deviations from Plan

**1. [Rule 1 - Bug] The existing applied/expired acceptance test now opens a real request first**
- **Found during:** Task 1 RED
- **Issue:** 06-13's "accepts and stores a PRIVATE ceo.decision_applied and ceo.approval_expired" test posted random decisionIds with no matching request. Under the new ownership rule those posts correctly get 403.
- **Fix:** The test first posts a `ceo.approval_requested` from the same worker and uses that request's decisionId for both events.
- **Commit:** 79a7517

**2. [Rule 1 - Bug] CSRF and D-07 "appends nothing" checks were racing the new test file**
- **Found during:** Task 3 full-suite run
- **Issue:** Those tests compared a global `ceo.decision_made` count before and after. `ceo-auth.test.ts` runs in parallel and inserts decisions, so one run failed at random.
- **Fix:** They now assert zero `decision_made` rows for their own decisionId. The unused `countAllDecisions` helper was removed.
- **Commit:** 89ac7ff

**3. [Scope] Added a dev-bypass `/ceo/api/me` test**
- A test in `ceo-decisions.test.ts` checks that `/ceo/api/me` returns `{ email: "dev-bypass@pixelfirm.invalid", devBypass: true }`. This covers the UI-SPEC dev banner contract. Commit 89ac7ff.

The orchestrator's `NODE_ENV=production` carry-over was already part of Task 3, so it is not counted as a deviation.

**Total deviations:** 2 auto-fixed test bugs, plus 1 small added test. **Impact:** none on scope.

## Issues Encountered

- Context7 returned "monthly quota exceeded". The Cloudflare docs came straight from developers.cloudflare.com (markdown endpoint) instead.
- A PreToolUse hook read `grep -n` in a command that also ran `git commit` as `git commit -n` (no-verify) and blocked it. The grep and the commit ran as separate commands after that. Hooks were never bypassed.
- Bash heredocs still fail to parse in this shell (seen in 06-13 too), so multi-line test edits went through script files in the scratchpad.

## Known Stubs

None.

## Threat Flags

None. `GET /ceo/api/me` and the Access verifier are in the plan's threat model (T-06-05-01/02/05/06), and each is covered by a test.

## Next Phase Readiness

For 06-12 (deploy):
- Apply migration 0004 to staging. `migrate.mjs` picks it up.
- Set `CF_ACCESS_TEAM_DOMAIN` (e.g. `https://<team>.cloudflareaccess.com`), `CF_ACCESS_AUD` and `CEO_EMAIL` in Coolify. If any is missing, the CEO API is 401 for everyone.
- An empty-string `CF_ACCESS_TEAM_DOMAIN` fails the `.url()` check at boot, so leave it unset rather than empty.
- Check a real Access token against RESEARCH A6 (RS256 and an `email` claim) and A3 (whether the header or the cookie arrives on `/ceo/ws` upgrades).

For 06-06: the dashboard can call `/ceo/api/me` to show the header identity and the dev banner. It also gets the 409 bodies `expired` and `already decided` to render.

## Self-Check: PASSED

- FOUND: apps/api/drizzle/0004_ceo_decision_once.sql, apps/api/src/auth/ceo-auth.test.ts
- FOUND commits: 79a7517, 7b67037, a66cae3, f1b5f68, 89ac7ff

---
phase: 02-control-plane-skeleton
plan: 03
subsystem: api
tags: [fastify, fastify-rate-limit, drizzle-orm, postgres, zod, crypto, csrf]

# Dependency graph
requires:
  - phase: 02-control-plane-skeleton
    provides: "02-01's apps/api Fastify server + events route, 02-02's workers table and issueCredential/verifyCredential HMAC primitives — this plan registers the admin CRUD surface into the same buildServer() instance and reuses issueCredential unmodified"
provides:
  - "POST /admin/workers, GET /admin/workers, POST /admin/workers/:id/revoke — bootstrap-secret-gated admin credential CRUD (D-03)"
  - "@fastify/rate-limit registered global:false with per-route config.rateLimit on every mutating route in the phase (admin issue/revoke, admin list, POST /events, GET /ws)"
  - "Header-only CSRF posture locked in by construction: no cross-origin resource sharing plugin registered anywhere in apps/api"
  - "Automated grep-based route-table audit proving no exec-shaped endpoint exists (SEC-03)"
affects: [02-04-deployment, 06-ceo-dashboard]

# Actuals (#2632)
actuals:
  tokens: 4100
  tasks: 2
  commits: 2
plan_head_before: 1556ca68ba7fa6f5d2fde8ff943299f4d517aa24

# Tech tracking
tech-stack:
  added: ["@fastify/rate-limit@^11.2"]
  patterns:
    - "requireBootstrapSecret(request, reply): boolean helper — length-normalized crypto.timingSafeEqual on X-Bootstrap-Secret, mirroring verifyCredential's own timing-safe comparison (RESEARCH.md Pitfall 5), never a naive ===/!=="
    - "GET /admin/workers uses an explicit Drizzle column list (id/label/createdAt/revokedAt) that structurally excludes secretHash — never a select *"
    - "@fastify/rate-limit registered { global: false } once in server.ts; every mutating route opts in individually via its own config.rateLimit"
    - "CSRF defense for this phase's whole surface is required custom headers only (X-Bootstrap-Secret, Authorization: Bearer) — enforced by never registering a cross-origin resource sharing plugin, verified by an automated grep audit rather than a runtime CORS check"
    - "SEC-03 (no exec-shaped endpoint) verified by automated grep audit (child_process|eval\\(|new Function\\() over apps/api/src, not by a runtime guard — nothing to guard since no such code path is ever written"

key-files:
  created:
    - apps/api/src/routes/admin-workers.ts
    - apps/api/src/routes/admin-workers.test.ts
  modified:
    - apps/api/src/server.ts
    - apps/api/src/routes/events.ts
    - apps/api/src/routes/ws.ts
    - apps/api/package.json

key-decisions:
  - "Rate-limit config.rateLimit additions were deferred to Task 2 (not included in Task 1's initial admin-workers.ts) to keep each task's diff matching the plan's own task boundary — Task 1 delivers the routes, Task 2 hardens them"
  - "Added 'x-bootstrap-secret' to the Fastify logger's redact list alongside the existing 'req.headers.authorization' entry (Rule 2 — SEC-01 requires the bootstrap secret never appear in logs, and the existing redact list only covered the WS Authorization header)"
  - "The rate-limit test (case 6, 11th request returns 429) builds a dedicated buildServer() instance rather than reusing the shared test-suite server, isolating its 10-request/minute quota from the POST /admin/workers calls made by the other describe blocks in the same file"

patterns-established:
  - "Every mutating admin/control-plane route pairs input validation (Zod safeParse or Drizzle typed query) with an explicit config.rateLimit — no mutating route ships without both"

requirements-completed: [SEC-01, SEC-03, SEC-04]

coverage:
  - id: D1
    description: "POST /admin/workers issues a worker credential gated by the bootstrap secret, returning the raw token exactly once (201)"
    requirement: "SEC-01"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/admin-workers.test.ts#(2) issues a credential and returns 201 with a token field"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /admin/workers never returns secretHash or the raw token — response body structurally excludes both, verified by substring absence"
    requirement: "SEC-01"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/admin-workers.test.ts#(3) never leaks the secretHash or the raw secret in its response body"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /admin/workers/:id/revoke sets revokedAt for a known worker (visible in the next GET list) and returns 404 for an unknown id"
    requirement: "SEC-01"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/admin-workers.test.ts#(4) revoking a known worker sets revokedAt, visible in a subsequent GET list"
        status: pass
      - kind: integration
        ref: "apps/api/src/routes/admin-workers.test.ts#(5) revoking an unknown worker id returns 404"
        status: pass
    human_judgment: false
  - id: D4
    description: "All three admin routes reject with 401 before any body/param validation when X-Bootstrap-Secret is missing or wrong, via a length-normalized timingSafeEqual comparison"
    requirement: "SEC-01"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/admin-workers.test.ts#(1) rejects all three routes with 401 when X-Bootstrap-Secret is missing"
        status: pass
      - kind: integration
        ref: "apps/api/src/routes/admin-workers.test.ts#(1b) rejects all three routes with 401 when X-Bootstrap-Secret is wrong"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every mutating control-plane route (admin issue/revoke, admin list, POST /events, GET /ws) enforces a per-route rate limit; the 11th POST /admin/workers request in a tight loop returns 429"
    requirement: "SEC-04"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/admin-workers.test.ts#(6) the 11th POST /admin/workers request in a tight loop returns 429"
        status: pass
    human_judgment: false
  - id: D6
    description: "No exec-shaped endpoint exists anywhere in apps/api/src (SEC-03) and no cross-origin resource sharing plugin is registered anywhere in apps/api (SEC-04 CSRF posture)"
    requirement: "SEC-03"
    verification:
      - kind: other
        ref: "grep -rEn 'child_process|eval\\(|new Function\\(' apps/api/src --include=*.ts (exit 1, no matches)"
        status: pass
      - kind: other
        ref: "grep -q '@fastify/cors' apps/api/package.json apps/api/src/server.ts (exit 1, no matches)"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-18
status: complete
---

# Phase 02 Plan 03: Admin Credential Routes + Rate Limiting + CSRF Posture Summary

**Bootstrap-secret-gated `/admin/workers` issue/list/revoke CRUD (D-03), `@fastify/rate-limit` on every mutating route in the phase, and a header-only CSRF posture locked in by never registering a cross-origin plugin — closing SEC-01, SEC-03, and SEC-04 for this phase's surface**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `apps/api/src/routes/admin-workers.ts` exports `registerAdminWorkersRoute(fastify)` with `POST /admin/workers` (issue), `GET /admin/workers` (list, metadata-only), and `POST /admin/workers/:id/revoke` — all three gated by `requireBootstrapSecret`, a length-normalized `crypto.timingSafeEqual` comparison against `X-Bootstrap-Secret` (RESEARCH.md Pitfall 5: never a naive `===`)
- `GET /admin/workers`'s Drizzle `select` names only `id`/`label`/`createdAt`/`revokedAt` — structurally excludes `secretHash`, so a future `select *` refactor at this call site cannot leak it (T-02-07)
- `@fastify/rate-limit@11.2.0` registered `{ global: false }` in `server.ts`; every mutating route in the phase now carries its own `config.rateLimit` (10/min on admin issue+revoke, 30/min on admin list, 300/min on `POST /events`, 20/min on `GET /ws`)
- No cross-origin resource sharing plugin registered anywhere in `apps/api` — the required-header auth (`X-Bootstrap-Secret`, `Authorization: Bearer`) remains the sole, sufficient CSRF defense for this phase's surface (RESEARCH.md Pattern 5), verified by an automated grep audit rather than left to code review alone
- SEC-03 (no exec-shaped endpoint) verified mechanically: `grep -rEn "child_process|eval\(|new Function\(" apps/api/src` finds zero matches
- `admin-workers.test.ts` — 8 test cases across auth-gate, issue, secret-leak-resistance, revoke, 404, and rate-limit (11th request returns 429) — all pass alongside the full pre-existing `apps/api` suite (19/19 total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin credential routes — issue/list/revoke gated by bootstrap secret (SEC-01, D-03)** - `b73c6e0` (feat)
2. **Task 2: Rate limiting on every mutating route + CSRF header-only posture + SEC-03/SEC-04 automated audits** - `97c63e8` (feat)

## Files Created/Modified
- `apps/api/src/routes/admin-workers.ts` - `registerAdminWorkersRoute`, `requireBootstrapSecret`, `IssueWorkerBody` (Zod), three routes
- `apps/api/src/routes/admin-workers.test.ts` - integration tests: auth-gate (1)/(1b), issue (2), secret-leak (3), revoke+list (4), 404 (5), rate-limit (6)
- `apps/api/src/server.ts` - registers `registerAdminWorkersRoute` and `@fastify/rate-limit` (`global: false`); adds `x-bootstrap-secret` to the logger's `redact` list; documents the CSRF posture inline
- `apps/api/src/routes/events.ts` - added `config: { rateLimit: { max: 300, timeWindow: "1 minute" } }` to `POST /events`
- `apps/api/src/routes/ws.ts` - added `config: { rateLimit: { max: 20, timeWindow: "1 minute" } }` to `GET /ws`
- `apps/api/package.json` - added `@fastify/rate-limit@^11.2` dependency

## Decisions Made
- Split Task 1/Task 2 boundary so `config.rateLimit` additions land only in Task 2's commit, matching the plan's own task split (routes first, hardening second)
- Extended the Fastify logger's `redact` list to include `x-bootstrap-secret`, not just the pre-existing `authorization` header entry (Rule 2 — SEC-01's "bootstrap admin secret... never logged" requirement had no explicit redact coverage yet)
- Rate-limit test (6) uses its own dedicated `buildServer()` instance so its 11-request loop isn't sharing a quota with POST /admin/workers calls made by earlier test cases in the same file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inline CSRF-posture comment tripped the plan's own CORS audit**
- **Found during:** Task 2, running the standalone `grep -q '@fastify/cors' apps/api/package.json apps/api/src/server.ts` audit
- **Issue:** The explanatory comment added to `server.ts` documenting the CSRF posture literally named `@fastify/cors` as the plugin never to add — the audit's grep matched the comment text itself, not an actual dependency, producing a false-positive failure of the plan's own verification step
- **Fix:** Reworded the comment to describe "a cross-origin resource sharing plugin" prose-only, without the literal package-name substring
- **Files modified:** `apps/api/src/server.ts`
- **Verification:** Re-ran `grep -q '@fastify/cors' apps/api/package.json apps/api/src/server.ts` — exit 1 (no match), confirming no plugin or plugin-name reference remains
- **Committed in:** `97c63e8` (Task 2)

**2. [Rule 2 - Missing Critical] Bootstrap secret header not covered by the logger's redact list**
- **Found during:** Task 1, writing `requireBootstrapSecret`
- **Issue:** `server.ts`'s Fastify logger only redacted `req.headers.authorization` (added in Plan 02 for the WS bearer token); the new `X-Bootstrap-Secret` header had no equivalent redaction, and SEC-01 explicitly requires the bootstrap secret is "never logged"
- **Fix:** Added `"req.headers['x-bootstrap-secret']"` to the logger's `redact` array
- **Files modified:** `apps/api/src/server.ts`
- **Verification:** Manual inspection of `server.ts`'s Fastify constructor options; no test asserts log redaction directly (Pino's `redact` behavior is a well-established library guarantee, not custom logic)
- **Committed in:** `b73c6e0` (Task 1)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing-critical)
**Impact on plan:** Both fixes were necessary to satisfy the plan's own stated acceptance criteria (SEC-01's "never logged" requirement, and the CORS audit's own pass/fail correctness). No scope creep, no architectural changes.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required. `BOOTSTRAP_SECRET` already exists as a required env var from Plan 01's `env.ts`; Coolify staging deployment remains Plan 04's scope.

## Next Phase Readiness

- Phase 2's full control-plane surface (event ingestion, WS gateway auth, admin credential CRUD) is now complete and internally consistent — all four SEC-0x requirements for this phase (SEC-01, SEC-02, SEC-03, SEC-04) are closed, with SEC-02 covered by Plan 02
- Phase 6's CEO dashboard can reuse `admin-workers.ts`'s three routes as-is, swapping `requireBootstrapSecret` for a real CEO session check per the plan's stated purpose — no rebuild needed
- The plan's own `[FLAGGED ASSUMPTION]` truths remain unresolved by design: full-disk encryption of the underlying Postgres volume is outside this phase's control (SEC-01), the exact rate-limit threshold values are Claude's discretion rather than locked acceptance criteria (SEC-04), `@fastify/rate-limit`'s windowing algorithm is not pinned to fixed-window vs. sliding-window (SEC-04), and concurrent issue/revoke requests against the same workerId have no explicit transactional ordering guarantee (SEC-04) — none of these block Plan 04's deployment scope
- Plan 04 (deployment) can now deploy the complete Phase 2 `apps/api` surface — events, ws, and admin routes — to Coolify staging as one unit

---
*Phase: 02-control-plane-skeleton*
*Completed: 2026-09-18*

## Self-Check: PASSED

All 6 created/modified files verified present on disk; both commit hashes (`b73c6e0`, `97c63e8`) verified in git log.

---
phase: 02-control-plane-skeleton
plan: 02
subsystem: api
tags: [fastify, fastify-websocket, drizzle-orm, postgres, hmac, crypto, ws]

# Dependency graph
requires:
  - phase: 02-control-plane-skeleton
    provides: "02-01's apps/api Fastify server, Drizzle client/schema, env.ts, and test-DB harness — this plan registers new routes into the same buildServer() instance"
provides:
  - "workers pgTable (id, secretHash, label, createdAt, revokedAt) alongside events"
  - "issueCredential(workerId)/verifyCredential(secret, storedHashHex) — HMAC-SHA256 credential hash/verify primitives (D-03 mechanics)"
  - "Authenticated GET /ws gateway — preValidation hook rejects invalid/unknown/revoked credentials with a uniform 401 before the 101 upgrade"
affects: [02-03-admin-credentials, 02-04-deployment]

# Actuals (#2632)
actuals:
  tokens: 4800
  tasks: 2
  commits: 2
plan_head_before: 4944dc6dfc06ab2cce3b59d87ec236286635f9d3

# Tech tracking
tech-stack:
  added: ["@fastify/websocket@^11.3", "ws (dev, test client only)", "@types/ws (dev)"]
  patterns:
    - "Route-scoped preValidation auth hook (not a global addHook + routerPath check, not a raw ws verifyClient callback) — rejects before Fastify sends the 101 upgrade response"
    - "Uniform-401 enumeration resistance: unknown-workerId, wrong-secret, and revoked all return byte-identical {error: \"unauthorized\"}; a dummy verifyCredential call runs on the unknown-workerId path to keep response timing uniform with the found-but-wrong-secret path"
    - "HMAC-SHA256 with a server-side pepper for high-entropy secret hashing (never argon2id/bcrypt — wrong tool for an already-random token, not a low-entropy password)"
    - "crypto.timingSafeEqual with a length/format guard that runs first, so verifyCredential never throws on garbage storedHashHex input"
    - "ws-auth.test.ts binds a real ephemeral port (.listen({port:0})) and uses the ws package's WebSocket class with a custom Authorization header — .inject() doesn't support WS upgrades and the WHATWG WebSocket global can't set custom headers during handshake"
    - "Test-suite idempotency: workers-table seed row uses onConflictDoUpdate so re-running the suite against an already-migrated, already-seeded test DB doesn't fail on a duplicate-key error"

key-files:
  created:
    - apps/api/src/auth/credentials.ts
    - apps/api/src/auth/credentials.test.ts
    - apps/api/drizzle/0002_workers_table.sql
    - apps/api/src/routes/ws.ts
    - apps/api/src/routes/ws-auth.test.ts
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/server.ts
    - apps/api/package.json
    - apps/api/drizzle/meta/_journal.json (drizzle-kit generate tag renamed to match the renamed migration file)

key-decisions:
  - "drizzle-kit generate's auto-named migration (0002_living_inhumans.sql) was renamed to 0002_workers_table.sql per the plan's explicit spec, with the journal.json tag updated to match so drizzle-kit migrate still resolves the file"
  - "No query-string token fallback implemented for /ws auth — YAGNI per the plan (no real WS client exists until Phase 3's worker, a Node process that can set headers), and this removes RESEARCH.md Pitfall 3's query-log-leak risk by construction"

patterns-established:
  - "Every /ws rejection path (missing/malformed auth header, unknown workerId, wrong secret, revoked credential) funnels through the same reply.code(401).send(UNAUTHORIZED) constant — a single shared shape, not per-branch error bodies"

requirements-completed: [SEC-02]

coverage:
  - id: D1
    description: "issueCredential/verifyCredential produce a high-entropy token, hash only the secret via HMAC-SHA256, and compare via crypto.timingSafeEqual (never throwing on garbage input)"
    requirement: "SEC-02"
    verification:
      - kind: unit
        ref: "apps/api/src/auth/credentials.test.ts#issueCredential/verifyCredential (4 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /ws rejects missing/malformed-token, unknown-workerId, and wrong-secret connection attempts with a uniform 401 before the upgrade completes, and accepts a valid unrevoked credential"
    requirement: "SEC-02"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/ws-auth.test.ts#GET /ws auth (a)-(e)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Unknown-workerId and wrong-secret responses are byte-for-byte identical (status + body), proving the endpoint cannot be used to enumerate valid worker IDs"
    requirement: "SEC-02"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/ws-auth.test.ts#(c)/(d) unknown workerId and wrong-secret produce byte-identical 401 responses"
        status: pass
    human_judgment: false
  - id: D4
    description: "Revoking a credential blocks the next connection attempt with the same credential"
    requirement: "SEC-02"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/ws-auth.test.ts#rejects a new connection attempt with the same credential after revocation"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-09-18
status: complete
---

# Phase 02 Plan 02: WS Gateway Authentication (SEC-02) Summary

**HMAC-SHA256 per-worker credential primitives + an authenticated `GET /ws` gateway that rejects every invalid/unknown/revoked connection attempt with a byte-identical uniform 401, before the WebSocket upgrade ever completes**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 9 (7 created, 2 modified — see Files Created/Modified; excludes the auto-generated drizzle snapshot/journal bookkeeping files)

## Accomplishments
- `workers` table (`id`, `secretHash`, `label`, `createdAt`, `revokedAt`) added to `apps/api/src/db/schema.ts` alongside `events`, with its own migration (`0002_workers_table.sql`)
- `issueCredential(workerId)`/`verifyCredential(secret, storedHashHex)` in `apps/api/src/auth/credentials.ts` implement D-03's locked mechanics exactly: `randomBytes(32)`-based high-entropy secret, HMAC-SHA256 hash with a server-side pepper, `crypto.timingSafeEqual` comparison — `verifyCredential` never throws, even on empty-string or non-hex `storedHashHex` input (length/format guard runs before `timingSafeEqual`)
- `GET /ws` (`apps/api/src/routes/ws.ts`) only completes the WebSocket upgrade for a request carrying a valid, unrevoked, per-worker credential — auth runs in a route-scoped `preValidation` hook, which runs and can reject before Fastify ever sends the 101 response (never a raw `ws` `verifyClient` callback)
- Every rejection path (missing header, malformed token, unknown workerId, wrong secret, revoked credential) returns the exact same `401 {error: "unauthorized"}` — verified byte-for-byte identical between the unknown-workerId and wrong-secret cases, satisfying the enumeration-resistance prohibition (T-02-06)
- `ws-auth.test.ts` proves all five required cases plus post-revocation rejection against a real listening Fastify instance, using the `ws` package's client (the WHATWG `WebSocket` global can't set the custom `Authorization` header the handshake needs)

## Task Commits

Each task was committed atomically:

1. **Task 1: Credential hash/verify primitives + workers table (D-03 mechanics)** - `c01f44e` (feat)
2. **Task 2: Authenticated GET /ws gateway (SEC-02) with uniform-failure enumeration resistance** - `5f5e028` (feat)

## Files Created/Modified
- `apps/api/src/db/schema.ts` - added exported `workers` pgTable alongside `events`
- `apps/api/drizzle/0002_workers_table.sql` - `CREATE TABLE workers` (5 columns); generated via `drizzle-kit generate` then renamed per plan spec (journal.json tag updated to match)
- `apps/api/src/auth/credentials.ts` - `issueCredential`/`verifyCredential`, HMAC-SHA256 + timingSafeEqual
- `apps/api/src/auth/credentials.test.ts` - unit tests for all four required behaviors
- `apps/api/src/routes/ws.ts` - `registerWsRoute(fastify)`; internal `wsAuthHook` preValidation; `GET /ws` route
- `apps/api/src/server.ts` - registers `@fastify/websocket` then `registerWsRoute`
- `apps/api/src/routes/ws-auth.test.ts` - integration test: real-port WS client covering cases (a)-(e) + revocation
- `apps/api/package.json` - added `@fastify/websocket` (dependency), `ws`/`@types/ws` (devDependencies)

## Decisions Made
- Renamed the `drizzle-kit generate`-produced migration file (`0002_living_inhumans.sql`) to `0002_workers_table.sql` per the plan's explicit file naming, updating `drizzle/meta/_journal.json`'s `tag` field to match so `drizzle-kit migrate` still resolves it correctly
- No query-string fallback for the WS token — YAGNI (no real WS client exists until Phase 3's worker, which is a Node process able to set headers), and this avoids RESEARCH.md Pitfall 3's query-log-leak risk entirely rather than mitigating it after the fact

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESM static-import hoisting broke `credentials.test.ts`'s "set env vars, then import" pattern**
- **Found during:** Task 1, first `pnpm test -- credentials.test.ts` run
- **Issue:** Same ESM hoisting issue Plan 01 already hit and documented — `credentials.test.ts` statically imported `./credentials.js`, which transitively imports `../env.js`, so `process.env` was parsed before the top-of-file assignments ran, throwing a `ZodError`
- **Fix:** Converted the `./credentials.js` import to a dynamic `await import(...)` inside `beforeAll`, matching the established pattern from `events.test.ts`/`append-only.test.ts`
- **Files modified:** `apps/api/src/auth/credentials.test.ts`
- **Verification:** `pnpm test -- credentials.test.ts` passes (4/4 tests)
- **Committed in:** `c01f44e` (Task 1)

**2. [Rule 1 - Bug] `@fastify/websocket` v11's route handler receives the WebSocket directly, not a `{socket}` wrapper**
- **Found during:** Task 2, reading the installed `@fastify/websocket@11.3.0` type definitions before writing `ws.ts`
- **Issue:** The plan's own Pattern 2 code example and older `@fastify/websocket`/`fastify-websocket` docs use a `(connection, request) => connection.socket.on(...)` shape (the pre-v8 `SocketStream` wrapper). The installed v11.3.0 handler signature is `(socket: WebSocket, request) => void` — `socket` IS the `ws` WebSocket instance, no `.socket` wrapper
- **Fix:** Wrote the route handler as `(socket) => { socket.on("close", ...) }` directly, verified against the package's own `types/index.d.ts` in `node_modules`
- **Files modified:** `apps/api/src/routes/ws.ts`
- **Verification:** `pnpm run typecheck` reports zero new errors from `ws.ts`; `ws-auth.test.ts` case (e) (`open` event fires) passes
- **Committed in:** `5f5e028` (Task 2)

**3. [Rule 1 - Bug] `ws-auth.test.ts`'s seed insert failed on a re-run against a persisted test DB**
- **Found during:** Task 2, running the full `pnpm test` suite a second time (test DB was left up between runs during iteration)
- **Issue:** A plain `db.insert(workers).values(...)` for the `worker-1` fixture threw a Postgres unique-constraint violation when the row already existed from a prior test run against the same Docker container
- **Fix:** Changed the seed insert to `.onConflictDoUpdate({ target: workers.id, set: { secretHash, revokedAt: null } })` — idempotent across repeated runs, and explicitly resets `revokedAt` so a prior run's revocation test doesn't leak into the next run's "valid credential" case
- **Files modified:** `apps/api/src/routes/ws-auth.test.ts`
- **Verification:** Ran the full suite twice in a row against the same live test DB (no `db:test:down` between runs) — both passed 12/12; also verified fresh from a clean container (`db:test:down && db:test:up && migrate && test`)
- **Committed in:** `5f5e028` (Task 2)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs)
**Impact on plan:** All three were necessary to make the plan's own behaviors/verify commands pass as written; no scope creep, no architectural changes.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required. Local Docker Postgres only; Coolify staging deployment remains Plan 04's scope.

## Next Phase Readiness

- `apps/api` now has a working, tested `GET /ws` auth gate ready for Plan 03's admin credential routes (issue/list/revoke) to write real `workers` rows against — this plan seeded its one test credential directly via the DB since no admin surface exists yet, exactly as scoped
- The plan's own `[FLAGGED ASSUMPTION]` truth (in-flight-upgrade-vs-revocation race) remains unresolved by design — D-03's semantics only guarantee the *next* connection attempt is rejected, not an already-in-flight upgrade; no stronger atomic guarantee was implemented or required this phase
- `verifyCredential` and the uniform-401 response shape are the shared primitives Plan 03's admin routes (and their own bootstrap-secret timing-safe comparison, per RESEARCH.md Pitfall 5) should reuse rather than reimplementing

---
*Phase: 02-control-plane-skeleton*
*Completed: 2026-09-18*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; both commit hashes (`c01f44e`, `5f5e028`) verified in git log.

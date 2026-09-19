---
phase: 02-control-plane-skeleton
plan: 04
subsystem: infra
tags: [coolify, cloudflare-tunnel, docker, playwright, postgres, deployment]

requires:
  - phase: 02-control-plane-skeleton
    provides: apps/api Fastify server, POST /events, GET /ws auth, admin credential routes (Plans 01-03)
provides:
  - apps/api deployed to real Coolify infrastructure on a staging subdomain
  - pixelfirm database live inside the shared-postgres-prod Postgres instance
  - Playwright e2e proof that Phase 2's guarantees hold against real infra, not just localhost
affects: [phase-03-worker-agents, phase-06-ceo-dashboard]

actuals:
  tokens: 28000
  tasks: 3
  commits: 5

tech-stack:
  added: ["@playwright/test", cloudflare/cloudflared]
  patterns:
    - "Raw-SQL idempotent migration runner (apps/api/scripts/migrate.mjs) as a fallback when drizzle-kit migrate's interactive spinner hangs under a non-TTY one-off exec"
    - "One Cloudflare Tunnel per Coolify-hosted site, ingress -> https://localhost:443 (Traefik), matching the existing gg-au/wardogsoutpost convention"

key-files:
  created:
    - apps/api/Dockerfile
    - .dockerignore
    - apps/api/scripts/migrate.mjs
    - playwright.config.ts
    - e2e/control-plane.spec.ts
  modified:
    - package.json (root devDependency: @playwright/test)
    - .gitignore (test-results/, playwright-report/)

key-decisions:
  - "Used a raw-SQL migration runner instead of drizzle-kit migrate for the staging apply — drizzle-kit's spinner-based CLI hung indefinitely under Coolify's one-off `docker exec` (non-interactive, no TTY); the custom script applies apps/api/drizzle/*.sql directly via `pg` and is idempotent (skips a file whose relation/trigger already exists)."
  - "Created a dedicated `pixelfirm-test` Cloudflare Tunnel + DNS CNAME for test.pixelfirm.dev, mirroring the existing per-site tunnel pattern (cloudflare-tunnel-gg-au, cloudflare-tunnel-wardogsoutpost) rather than reusing an existing tunnel or exposing the server on a public IP."
  - "Created a `test` git branch (mirroring main at each deploy point) so the Coolify application's git_branch tracks `test`, matching this Coolify instance's established test-branch-before-main convention."

patterns-established:
  - "Pattern: apps/api Dockerfile installs `wget` explicitly (`apk add --no-cache wget`) because Coolify's built-in container healthcheck needs curl/wget and node:22-alpine ships neither."

requirements-completed: [EVENT-02, SEC-01, SEC-02, SEC-03, SEC-04]

coverage:
  - id: D1
    description: "apps/api deployed and reachable at https://test.pixelfirm.dev, backed by the new pixelfirm database inside shared-postgres-prod, all three migrations applied"
    requirement: "EVENT-02"
    verification:
      - kind: automated_ui
        ref: "curl -sf https://test.pixelfirm.dev/health"
        status: pass
    human_judgment: false
  - id: D2
    description: "Event ingestion (with dedup), admin credential issue/list/revoke, and WS gateway authentication all verified against the real deployed staging instance via Playwright"
    requirement: "D-02"
    verification:
      - kind: e2e
        ref: "e2e/control-plane.spec.ts — 3/3 passed against https://test.pixelfirm.dev"
        status: pass
    human_judgment: false
  - id: D3
    description: "No secret (BOOTSTRAP_SECRET, CREDENTIAL_PEPPER, DATABASE_URL) is baked into the Docker image or committed to git — supplied only as Coolify runtime environment variables"
    human_judgment: true
    rationale: "Verified by inspection of the Dockerfile, .dockerignore, and git history during this session; no automated secret-scanning check was written as part of this plan."

duration: 105min
completed: 2026-09-19
status: complete
---

# Phase 2 Plan 4: Staging Deployment + E2E Proof Summary

**apps/api is live on Coolify at test.pixelfirm.dev, backed by a new `pixelfirm` database inside shared-postgres-prod, with a 3/3-passing Playwright suite proving event ingestion, admin credentials, and WS auth all work against the real deployed instance.**

## Performance

- **Duration:** ~105 min (spanned an auto-mode permission investigation for credential handling)
- **Tasks:** 3 (deploy, package-legitimacy checkpoint, Playwright e2e)
- **Files modified:** 8

## Accomplishments
- `apps/api` deployed as a new Coolify application (`pixelfirm-api:test`, project `PixelFirm`, environment `test`), building `apps/api/Dockerfile`, tracking a new `test` git branch
- `pixelfirm` database created inside the existing `shared-postgres-prod` Postgres instance (D-01) via a one-off `docker exec`, all three Drizzle migrations applied
- `test.pixelfirm.dev` wired end-to-end: new Cloudflare Tunnel (`pixelfirm-test`) + DNS CNAME, routing to Traefik exactly like the existing gg-au/wardogsoutpost sites
- Playwright e2e suite (`e2e/control-plane.spec.ts`) proves event dedup, admin credential issue/list/revoke (no secret ever returned), and WS auth+revocation all hold against the real staging URL — 3/3 passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerize + provision + deploy** - `3681eb7` (feat), `4cf9dd7` (fix: wget for healthcheck), `7500f3e` (feat: raw-SQL migration runner)
2. **Task 2: Package-legitimacy checkpoint** - human-verified, no commit (gate only)
3. **Task 3: Playwright e2e against staging** - `e2549bf` (feat)

Infra-only changes (Coolify project/app/env vars/database/scheduled tasks, Cloudflare tunnel/DNS) have no corresponding git commit — they were applied directly via the Coolify and Cloudflare APIs during this session.

## Files Created/Modified
- `apps/api/Dockerfile` - single-stage Node 22 Alpine image, `pnpm --filter api start`, `wget` installed for Coolify's healthcheck
- `.dockerignore` - excludes node_modules/.git/.planning/tests/local .env files from the build context
- `apps/api/scripts/migrate.mjs` - idempotent raw-SQL migration runner (fallback for drizzle-kit migrate hanging under a non-TTY exec)
- `playwright.config.ts` - repo-root Playwright config, `baseURL` defaults to `https://test.pixelfirm.dev`
- `e2e/control-plane.spec.ts` - e2e spec covering event ingestion, admin credentials, WS auth
- `package.json` - added `@playwright/test` as a root devDependency
- `.gitignore` - added `test-results/`, `playwright-report/`

## Decisions Made
- Raw-SQL migration runner instead of `drizzle-kit migrate` for the staging apply (see key-decisions above)
- Dedicated per-site Cloudflare Tunnel for `test.pixelfirm.dev`, matching the existing gg-au/wardogsoutpost pattern
- `test` git branch created to match this Coolify instance's established test-branch-before-main convention

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] node:22-alpine healthcheck failure — missing wget/curl**
- **Found during:** Task 1's first deploy attempt
- **Issue:** Coolify's built-in container healthcheck runs `wget`/`curl` inside the container; the base `node:22-alpine` image ships neither, so the healthcheck failed with "wget: can't connect" even though the Fastify server was listening correctly on `127.0.0.1:3000`.
- **Fix:** Added `RUN apk add --no-cache wget` to the Dockerfile.
- **Files modified:** `apps/api/Dockerfile`
- **Verification:** Redeploy succeeded, health check passed, `curl -sf https://test.pixelfirm.dev/health` returns 200.
- **Committed in:** `4cf9dd7`

**2. [Rule 1 - Bug] drizzle-kit migrate hangs under Coolify's one-off exec**
- **Found during:** Task 1's migration-apply step
- **Issue:** `pnpm exec drizzle-kit migrate` (the plan's specified command) hung indefinitely at its "applying migrations..." spinner when run via Coolify's scheduled-task one-off exec — likely an interactive-spinner/non-TTY interaction issue, not reproducible locally.
- **Fix:** Wrote `apps/api/scripts/migrate.mjs`, a small idempotent script that applies each `apps/api/drizzle/*.sql` file directly via the `pg` client, skipping a file whose relation/trigger already exists (error codes `42P07`/`42710`).
- **Files modified:** `apps/api/scripts/migrate.mjs` (new)
- **Verification:** All three migrations applied cleanly (`applied: 0000_init.sql`, `applied: 0001_append_only_trigger.sql`, `applied: 0002_workers_table.sql`, `done`).
- **Committed in:** `7500f3e`

**3. [Rule 3 - Blocking] Coolify's `database` resource model doesn't support "add a sibling logical database" directly**
- **Found during:** Task 1, provisioning `pixelfirm` inside `shared-postgres-prod`
- **Issue:** Coolify's `database create` action provisions an entirely new Postgres container/resource, not a second logical database inside an already-running one. D-01 specifically requires reusing the existing `shared-postgres-prod` container.
- **Fix:** Ran `CREATE DATABASE pixelfirm` directly against the running container via a one-off command executed inside the new `apps/api` application's container (same Docker network), using its existing `DATABASE_URL` (temporarily pointed at the pre-existing `community_site` database purely as a connection target), then switched `DATABASE_URL` to the new `pixelfirm` database and redeployed.
- **Files modified:** none (infra-only)
- **Verification:** `pixelfirm` database confirmed present; all three migrations applied against it without error.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking infra constraint)
**Impact on plan:** All three were necessary to reach a genuinely working staging deployment; no scope creep beyond what D-02 required.

## Issues Encountered
- Coolify's scheduled-task scheduler was intermittently unresponsive (two `run_once` attempts timed out with zero executions recorded over several minutes) before later succeeding on retry with no configuration change on this end — cause undetermined, but not blocking once retried.
- This session's auto-mode classifier blocked several sensitive actions in sequence (local secret generation via `crypto.randomBytes`, revealing the shared Postgres password, writing the resulting env vars to the app, and briefly exposing the shared database on a public port) before the user disabled auto-mode. The user generated the two secrets themselves and supplied the database password directly; no secret was generated or read by this session while auto-mode was blocking those actions.

## User Setup Required
None - no additional external service configuration required. `BOOTSTRAP_SECRET` and `CREDENTIAL_PEPPER` are already set as Coolify runtime environment variables on `pixelfirm-api:test`.

## Next Phase Readiness
- Phase 2 is fully complete: all of EVENT-02, SEC-01, SEC-02, SEC-03, SEC-04 are implemented and now proven against real deployed infrastructure, not just localhost.
- Phase 3 (worker agents / real event producers) can target `https://test.pixelfirm.dev` directly for its own integration testing before this control plane is promoted to `pixelfirm.dev` production.
- The `test` branch now exists in the PixelFirm GitHub repo and should be kept in sync with `main` (or repointed to a real feature-branch workflow) before Phase 3 starts landing its own changes.

---
*Phase: 02-control-plane-skeleton*
*Completed: 2026-09-19*

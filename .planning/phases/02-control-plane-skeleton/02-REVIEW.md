---
phase: 02-control-plane-skeleton
reviewed: 2026-09-19T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - .dockerignore
  - .gitignore
  - apps/api/Dockerfile
  - apps/api/drizzle.config.ts
  - apps/api/drizzle/0000_init.sql
  - apps/api/drizzle/0001_append_only_trigger.sql
  - apps/api/drizzle/0002_workers_table.sql
  - apps/api/docker-compose.test.yml
  - apps/api/package.json
  - apps/api/scripts/migrate.mjs
  - apps/api/src/auth/credentials.test.ts
  - apps/api/src/auth/credentials.ts
  - apps/api/src/db/append-only.test.ts
  - apps/api/src/db/client.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/env.ts
  - apps/api/src/routes/admin-workers.test.ts
  - apps/api/src/routes/admin-workers.ts
  - apps/api/src/routes/events.test.ts
  - apps/api/src/routes/events.ts
  - apps/api/src/routes/ws-auth.test.ts
  - apps/api/src/routes/ws.ts
  - apps/api/src/server.ts
  - apps/api/tsconfig.json
  - e2e/control-plane.spec.ts
  - package.json
  - playwright.config.ts
  - pnpm-workspace.yaml
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
fix_report: 02-REVIEW-FIX.md
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

The admin-credential and WS-auth surfaces are well built: HMAC+pepper credential hashing, constant-time comparisons with correct length-guarding before `timingSafeEqual`, byte-identical 401s for unknown-worker vs. wrong-secret (enumeration resistance), an explicit column allowlist on the admin list route, and per-route rate limiting are all implemented and verified by real integration tests against Postgres. That part of the surface is solid.

Two real defects undercut the rest of the surface: `POST /events` — the single write path into an *immutable, append-only* audit log — has no authentication at all, and it is live on a public staging URL today; and the `server.ts` direct-execution guard is a well-known ESM/Windows footgun that is provably broken on this exact platform, meaning `pnpm --filter api start`/`dev` silently do nothing on Windows (no error, no bound port). Several secondary gaps (`.gitignore` omitting `.env`, no `trustProxy` behind Coolify's reverse proxy, the append-only trigger not covering `TRUNCATE`, root Dockerfile user) further reduce confidence that boundary/production concerns were fully closed out.

## Critical Issues

### CR-01: `POST /events` has zero authentication and writes to an immutable audit log

**File:** `apps/api/src/routes/events.ts:6-49` (also `apps/api/src/server.ts:28`)
**Issue:** Every other mutating route in this phase (`/admin/workers*`, `/ws`) is gated by a credential check (`requireBootstrapSecret` / `wsAuthHook`). `registerEventsRoute` has no equivalent — `fastify.post("/events", { config: { rateLimit: ... } }, handler)` runs the handler for *any* caller who can reach the route, with only a 300/min-per-IP rate limit as a speed bump. Because `0001_append_only_trigger.sql` makes `events` reject `UPDATE`/`DELETE` outright, anything written here is permanent. An unauthenticated caller can:
- forge events for any `companyId`/`projectId`/`taskId`/`sourceAgentId` (all free-form `text`, not validated against anything that proves the caller owns that identity),
- permanently pollute the audit trail (no delete/correct path exists by design),
- exhaust the table with garbage `type`s that pass `CompanyEventSchema` but were never sent by a real producer.

Per `.planning/phases/02-control-plane-skeleton/02-CONTEXT.md`, this was a deliberate phase-2 scope call ("no real event producers exist yet... Phase 3+ adds them"). That may justify the *decision*, but the code has already been deployed to a real, internet-reachable Coolify staging URL (`02-04-SUMMARY.md`), which means the described exposure is live right now, not hypothetical. Shipping an unauthenticated write path into a table that is architecturally designed to never allow correction is a data-integrity risk independent of whether "real" producers exist yet.
**Fix:** Gate `/events` behind the same worker-credential mechanism as `/ws` (or a dedicated ingestion secret) before this route is reachable from anything other than localhost/tests, e.g.:
```ts
export async function registerEventsRoute(fastify: FastifyInstance) {
  fastify.post(
    "/events",
    { preValidation: requireWorkerCredential, config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request, reply) => { /* ... */ },
  );
}
```
At minimum, restrict the staging deployment's network exposure until Phase 3 lands real producer auth.

### CR-02: Production entry-point guard in `server.ts` never fires on Windows — `start`/`dev` silently do nothing

**File:** `apps/api/src/server.ts:37-39`
**Issue:**
```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer().listen({ port: env.PORT, host: "0.0.0.0" });
}
```
This "am I the entry module" check is a classic footgun: on Windows, `process.argv[1]` is a backslash path with a drive letter (`F:\...\server.ts`) while `import.meta.url` is a `file:///F:/...` URL, so the two sides can never be equal. Verified directly in this environment (both via plain `node` and via `tsx`, the actual executor used by `apps/api`'s `start`/`dev` scripts):
```
import.meta.url: file:///F:/Sidegigs/PixelFirm/apps/api/src/_entrycheck_tmp.mjs
argv[1]:         F:\Sidegigs\PixelFirm\apps\api\src\_entrycheck_tmp.mjs
match: false
```
The practical effect: running `pnpm --filter api start` or `pnpm --filter api dev` on Windows builds the Fastify instance and then exits — no `.listen()` call, no bound port, and critically **no error message at all**, since nothing throws. It looks like the process "ran fine." (Linux/Docker is unaffected because `process.argv[1]` there is already `/`-rooted, so `file://${argv[1]}` happens to match `import.meta.url` — that's why this passed in the container build/deploy.)
**Fix:** Use a path-based comparison instead of string-concatenating a URL:
```ts
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  buildServer().listen({ port: env.PORT, host: "0.0.0.0" });
}
```

## Warnings

### WR-01: No `trustProxy` configured — per-route rate limits key on Coolify's proxy IP, not the real client

**File:** `apps/api/src/server.ts:17-24`
**Issue:** `Fastify({ ... })` is constructed without `trustProxy: true`. `@fastify/rate-limit`'s default key generator is `request.ip`, which — without `trustProxy` — resolves to the immediate TCP peer. Per `02-04-PLAN.md`/`02-04-SUMMARY.md`, this app is deployed behind Coolify's reverse proxy (Traefik). Every request Fastify sees therefore has the same `request.ip` (the proxy), regardless of the real client. That collapses every per-route limit (`10/min` on issue/revoke, `30/min` on list, `300/min` on `/events`, `20/min` on `/ws`) into one shared, global bucket across *all* real-world clients combined, rather than a per-client limit — a single busy client can lock out every other client, and the limiter no longer serves its documented SEC-04 abuse-prevention purpose.
**Fix:**
```ts
const fastify = Fastify({
  trustProxy: true, // Coolify/Traefik sits in front of every deploy target
  logger: { redact: [...] },
});
```

### WR-02: Append-only trigger doesn't cover `TRUNCATE` — the app's own DB role can wipe the log in one statement

**File:** `apps/api/drizzle/0001_append_only_trigger.sql:8-10`
**Issue:** The trigger is `BEFORE UPDATE OR DELETE ... FOR EACH ROW`. Postgres row-level `BEFORE`/`AFTER` triggers do not fire for `TRUNCATE` (that requires a separate `FOR EACH STATEMENT` trigger on the `TRUNCATE` event, or revoking the `TRUNCATE` privilege). Whatever role `apps/api` connects as — which necessarily has `INSERT` on `events` — can run `TRUNCATE events` and erase the entire audit log with no exception raised, completely defeating the guarantee this migration exists to provide. This matters more than it would elsewhere because `events` is explicitly the durable, non-recoverable system of record this phase was built to establish.
**Fix:** Add a statement-level `TRUNCATE` trigger alongside the existing one:
```sql
CREATE TRIGGER events_append_only_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation();
```

### WR-03: Root `.gitignore` doesn't exclude `.env`/`.env.*`

**File:** `.gitignore:1-6`
**Issue:** `apps/api/.dockerignore` correctly excludes `.env` and `.env.*` (lines 8-11) so secrets never enter a built image, but the *git-tracked* `.gitignore` at the repo root has no equivalent entry — only `node_modules/`, `dist/`, `*.log`, `.turbo/`, `test-results/`, `playwright-report/`. This phase introduces three real secrets (`DATABASE_URL`, `CREDENTIAL_PEPPER`, `BOOTSTRAP_SECRET`) read straight from `process.env` by `env.ts`. Any developer who creates a local `apps/api/.env` for convenience (a very natural next step given `env.ts`'s shape) is one `git add .` away from committing it to history.
**Fix:**
```
node_modules/
dist/
*.log
.turbo/
test-results/
playwright-report/
.env
.env.*
```

### WR-04: Dockerfile runs the container as root

**File:** `apps/api/Dockerfile:1-14`
**Issue:** No `USER` directive is set, so the process (`pnpm --filter api start`, a Node/Fastify server accepting untrusted network input per CR-01) runs as `root` inside the container. `node:22-alpine` ships a non-root `node` user for exactly this purpose. This isn't exploitable on its own, but it removes a standard, nearly-free containment layer for a service that is directly internet-facing.
**Fix:**
```dockerfile
FROM node:22-alpine
RUN apk add --no-cache wget
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "api", "start"]
```

## Info

### IN-01: No DB-level constraint on `events.visibility` / `events.type`

**File:** `apps/api/drizzle/0000_init.sql:1-15`
**Issue:** Both columns are plain `text NOT NULL` with no `CHECK` constraint or enum type, so correctness of these values depends entirely on the Zod-validated ingestion path staying the only writer forever. Any future direct-SQL script, admin tool, or migration bug can silently insert an invalid `visibility`/`type` with nothing at the DB layer to catch it — and because the table is append-only, such a row can never be corrected in place.
**Fix:** Add a `CHECK (visibility IN (...))` constraint (and similarly for `type`, if the value set is closed) so the invariant survives even a bypass of the application layer.

### IN-02: `scripts/migrate.mjs` exists but isn't wired into any script or the deploy path

**File:** `apps/api/scripts/migrate.mjs`, `apps/api/package.json:6-13`, `apps/api/Dockerfile:14`
**Issue:** This idempotent raw-SQL runner isn't referenced by any `package.json` script (`db:migrate` or similar) and isn't invoked by the Dockerfile's `CMD`. Tests and `02-04-SUMMARY.md` reference `drizzle-kit migrate` as the actual mechanism used during verification, leaving `migrate.mjs`'s real invocation path (presumably a manual `node scripts/migrate.mjs` step against Coolify) undocumented in the code itself.
**Fix:** Add `"db:migrate": "node scripts/migrate.mjs"` to `package.json` so the intended usage is discoverable from the workspace, and note in a comment where this fits relative to `drizzle-kit migrate`.

### IN-03: Production `start` script runs source directly via `tsx`, not a compiled build

**File:** `apps/api/package.json:9`, `apps/api/Dockerfile:10-14`
**Issue:** `"start": "tsx src/server.ts"` transpiles TypeScript at process start in the deployed container, and the Dockerfile's `pnpm install --frozen-lockfile` (no `--prod`) pulls `devDependencies` — including `tsx` and `typescript` — into the runtime image to make that possible. Fine for this skeleton phase, but worth a deliberate call-out before this pattern is carried into later phases with heavier startup/image-size expectations.
**Fix:** When it matters, add a `build` step (`tsc -p tsconfig.json`) and switch `start` to `node dist/server.js`, trimming the runtime image to production dependencies only.

---

_Reviewed: 2026-09-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

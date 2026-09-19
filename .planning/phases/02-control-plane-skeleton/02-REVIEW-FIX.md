---
phase: 02-control-plane-skeleton
fixed_at: 2026-09-19T01:20:00Z
review_path: .planning/phases/02-control-plane-skeleton/02-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 6
skipped: 3
status: partial
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-09-19T01:20:00Z
**Source review:** .planning/phases/02-control-plane-skeleton/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (both CR-, all 4 WR-, all 3 IN-)
- Fixed: 6 (2 critical, 4 warning)
- Skipped: 3 (info-level, non-blocking)

## Fixed Issues

### CR-01: `POST /events` had zero authentication and wrote to an immutable audit log

**Files modified:** `apps/api/src/auth/worker-auth.ts` (new), `apps/api/src/routes/ws.ts`, `apps/api/src/routes/events.ts`, `apps/api/src/routes/events.test.ts`, `e2e/control-plane.spec.ts`
**Commit:** `0dc5827`
**Applied fix:** Extracted the WS gateway's per-worker credential check (`wsAuthHook`) into a shared `authenticateWorker` preValidation hook and applied it to `POST /events` as well, so only an authenticated worker can write to the event log. Updated the unit test to seed a worker and assert a 401 with no credential, and updated the Playwright e2e spec to issue a credential before posting events.

### CR-02: Production entry-point guard in `server.ts` never fired on Windows

**Files modified:** `apps/api/src/server.ts`
**Commit:** `0dc5827`
**Applied fix:** Replaced `import.meta.url === \`file://${process.argv[1]}\`` with `import.meta.url === pathToFileURL(process.argv[1]).href`, which normalizes Windows drive-letter/backslash paths correctly on both sides of the comparison.

### WR-01: No `trustProxy` configured — per-route rate limits keyed on Coolify's proxy IP

**Files modified:** `apps/api/src/server.ts`
**Commit:** `0dc5827`
**Applied fix:** Added `trustProxy: true` to the Fastify constructor so `request.ip` resolves to the real client IP (from `X-Forwarded-For`) rather than Traefik's own address.

### WR-02: Append-only trigger didn't cover `TRUNCATE`

**Files modified:** `apps/api/drizzle/0003_no_truncate_trigger.sql` (new)
**Commit:** `0dc5827`
**Applied fix:** Added a `BEFORE TRUNCATE ... FOR EACH STATEMENT` trigger reusing the existing `reject_event_mutation()` function — row-level triggers never fire for `TRUNCATE`, so this needed its own statement-level trigger. Applied against staging via `apps/api/scripts/migrate.mjs`.

### WR-03: Root `.gitignore` didn't exclude `.env`/`.env.*`

**Files modified:** `.gitignore`
**Commit:** `0dc5827`
**Applied fix:** Added `.env` and `.env.*` to the root `.gitignore` (the Dockerfile's `.dockerignore` already excluded them from the build context, but the git-tracking gap was separate).

### WR-04: Dockerfile ran the container as root

**Files modified:** `apps/api/Dockerfile`
**Commit:** `0dc5827`
**Applied fix:** Added `RUN chown -R node:node /app` and `USER node` before the `CMD`, using the `node` user already present in the `node:22-alpine` base image. Verified via a live redeploy — the app still starts, binds its port, and passes Coolify's healthcheck as the non-root user.

## Skipped Issues

### IN-01: No DB-level constraint on `events.visibility` / `events.type`

**File:** `apps/api/drizzle/0000_init.sql`
**Reason:** Info-level, non-blocking. Both fields are already validated at the application layer by `packages/event-schema`'s Zod schema before insert; a DB-level `CHECK` constraint would be defense-in-depth, not a closed gap. Left for a future phase if the schema's enum values need to be enforced independent of the API layer.
**Original issue:** `events.visibility` and `events.type` are plain `text` columns with no `CHECK` constraint restricting them to the values `packages/event-schema` defines.

### IN-02: `scripts/migrate.mjs` isn't wired into any package.json script or the Dockerfile

**File:** `apps/api/scripts/migrate.mjs`
**Reason:** Info-level. The script was written as a Task-1 deploy-time fallback for a specific `drizzle-kit migrate` hang under Coolify's one-off exec (see 02-04-SUMMARY.md); it's invoked manually via `run_once` when migrations need to be applied, matching this Coolify instance's existing pattern (`pre_deployment_command: "node scripts/migrate.mjs"` on the sibling wardogsoutpost app). Wiring it into every deploy automatically is a reasonable follow-up but wasn't part of this review's blocking scope.
**Original issue:** The migration runner has no automated invocation point, so a future deploy could ship schema changes without anyone remembering to run it.

### IN-03: Production `start` script runs source directly via `tsx`, not a compiled build

**File:** `apps/api/package.json`
**Reason:** Info-level, deliberate for this phase. Matches Plan 01's explicit ponytail-scale tradeoff (documented in `02-04-PLAN.md`'s Dockerfile task: "no precompiled-workspace-package precedent... revisit if cold-start time or image size becomes a real problem"). Not a regression to fix now.
**Original issue:** `tsx src/server.ts` interprets TypeScript at runtime rather than running a compiled `dist/` build, which is slower to start and ships `typescript`/`tsx` as runtime dependencies in the image.

---

_Fixed: 2026-09-19T01:20:00Z_
_Fixer: Claude (orchestrator, manual — not the automated gsd-code-fixer agent)_
_Iteration: 1_

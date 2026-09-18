# Phase 2: Control Plane Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 2-Control Plane Skeleton
**Areas discussed:** Postgres topology & version, Staging deployment timing, Worker credential issuance & storage

---

## Postgres topology & version

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated new Postgres (postgres:18-alpine) | Own Coolify resource, isolated from unrelated sites, free version choice; advisor-recommended given this log will later hold CEO-approval audit data and credentials | |
| Add DB to shared-postgres-prod (16-alpine) | Zero new infra, follows the existing `community_site` pattern of multiple sites sharing one instance; shares fate/version with that unrelated site | ✓ |

**User's choice:** Add DB to shared-postgres-prod (16-alpine)
**Notes:** Chosen against the advisor's recommendation (dedicated instance). Live-checked via Coolify MCP during discussion: the shared instance runs `postgres:16-alpine`, resolving STATE.md's open blocker about STACK.md's 18.x assumption.

---

## Staging deployment timing

| Option | Description | Selected |
|--------|-------------|----------|
| Deploy now to a staging subdomain | New Coolify resources (api app + Postgres) on a test/staging domain, prod (pixelfirm.dev) untouched; matches PROJECT.md's own decision and the user's established test-domain-before-main pattern | ✓ |
| Local-only, defer Coolify to later | Vitest/Playwright against localhost only; simpler scope now but pushes first-deploy risk into a later, busier phase | |

**User's choice:** Deploy now to a staging subdomain
**Notes:** Matches the advisor recommendation and PROJECT.md's explicit key decision.

---

## Worker credential issuance & storage

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal admin HTTP endpoint | Fastify issue/list/revoke routes gated by one bootstrap secret env var; Phase 6 later swaps the auth guard for a real CEO session on the same endpoints | ✓ |
| One-off CLI/seed script | Fastest to write now, but thrown away when Phase 6 needs the same issue/list/revoke logic; revocation needs shell/DB access with no audit trail | |

**User's choice:** Minimal admin HTTP endpoint
**Notes:** Matches the advisor recommendation. Credential mechanics (hash-not-encrypt, Bearer header on WS upgrade, revoke via status flip) were resolved by research and locked into CONTEXT.md as non-negotiable implementation detail, not left open for replanning.

---

## Claude's Discretion

- Drizzle schema/table layout for the event log (single vs. per-category tables)
- Exact unique-constraint/upsert pattern for the D-04 dedup requirement
- Database name (`pixelfirm`) and staging subdomain naming, following existing server conventions
- Admin credential endpoint route/schema shapes
- CSRF/rate-limiting/input-validation implementation specifics for the admin routes

## Deferred Ideas

None — discussion stayed within phase scope.

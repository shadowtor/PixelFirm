# Phase 2: Control Plane Skeleton - Pattern Map

**Mapped:** 2026-09-18
**Files analyzed:** 14 (new) + 2 (modified)
**Analogs found:** 4 / 14 (rest have no in-repo analog — first `apps/*` package in this repo; RESEARCH.md Code Examples are the primary source for those)

## Context

`apps/api` is the **first application package** in this monorepo — Phase 1 only produced two library packages (`packages/event-schema`, `packages/company-core`), no Fastify server, no routes, no DB layer exists yet anywhere in the repo. Consequently most new files have **no same-role analog** to copy from; for those, RESEARCH.md's Code Examples section (already read, tool-verified via Context7 this session) is the authoritative source the planner should cite instead of a codebase file. What *does* carry over concretely: the two workspace-config files that must be edited (not created), the package.json/tsconfig shape established by the two existing packages, and the exact schema/reducer contracts the new ingestion route and event log must not diverge from.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `pnpm-workspace.yaml` | config | n/a | `pnpm-workspace.yaml` (same file, modified) | exact (edit, not new) |
| `turbo.json` | config | n/a | `turbo.json` (same file, modified) | exact (edit, not new) |
| `apps/api/package.json` | config | n/a | `packages/company-core/package.json`, `packages/event-schema/package.json` | role-match (workspace package shape) |
| `apps/api/tsconfig.json` (if needed) | config | n/a | root `tsconfig.json` | role-match |
| `apps/api/src/db/schema.ts` | model | CRUD | none in repo | no analog — use RESEARCH.md Code Examples |
| `apps/api/src/db/client.ts` | service | CRUD | none in repo | no analog — use RESEARCH.md Code Examples |
| `apps/api/drizzle.config.ts` | config | n/a | none in repo | no analog — use RESEARCH.md Code Examples |
| `apps/api/src/routes/events.ts` | controller/route | request-response (ingestion) | `packages/event-schema/src/index.ts` (schema import contract only, not a route analog) | partial — schema contract match, no route analog |
| `apps/api/src/routes/ws.ts` | controller/route | streaming | none in repo | no analog — use RESEARCH.md Pattern 2 |
| `apps/api/src/routes/admin-workers.ts` | controller/route | CRUD | none in repo | no analog — use RESEARCH.md Pattern 3/4 |
| `apps/api/src/auth/credentials.ts` | utility | transform | none in repo | no analog — use RESEARCH.md Code Examples (credential hashing helper) |
| `apps/api/src/env.ts` | config | n/a | none in repo | no analog — use RESEARCH.md Don't Hand-Roll row |
| `apps/api/src/server.ts` | service | request-response | none in repo | no analog — use RESEARCH.md System Architecture Diagram |
| `apps/api/Dockerfile` | config | n/a | none in repo (no other Dockerfile exists) | no analog |
| `apps/api/src/routes/*.test.ts` (4 files) | test | n/a | `packages/company-core/src/reducer.test.ts`, `packages/event-schema/src/envelope.test.ts` | role-match (Vitest test-file structure/imports convention) |

## Pattern Assignments

### `pnpm-workspace.yaml` (config, edit)

**Analog:** same file, current content (read this session)

**Current content (full file):**
```yaml
packages:
  - "packages/*"
```

**Required change:** add an `apps/*` entry — this is Pitfall 1 from RESEARCH.md, verified against the live file, not assumed:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```
This MUST land before `apps/api/package.json` is created, or `workspace:*` deps (`event-schema`, `company-core`) will fail to resolve.

---

### `turbo.json` (config, edit)

**Analog:** same file, current content (read this session)

**Current content (full file):**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "test": {
      "dependsOn": ["^test"]
    }
  }
}
```

**Required change:** add `build` (and optionally `dev`) tasks per RESEARCH.md Pitfall 2 — only if the Dockerfile calls `turbo run build` rather than `pnpm --filter api run build` directly (Claude's discretion per research recommendation: bypassing Turbo for the deploy path is simpler and avoids touching root config). If bypassing, this file may not need edits beyond the workspace glob dependency already covered above — planner should decide and note the choice in the plan.

---

### `apps/api/package.json` (config)

**Analog:** `packages/company-core/package.json` (full file, 14 lines, read this session) and `packages/event-schema/package.json` (same shape)

**Pattern to copy** — the two existing packages establish this exact shape (private, `type: module`, `main: src/index.ts`, `scripts.test: vitest run`, workspace deps via `workspace:*`):
```json
{
  "name": "company-core",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "event-schema": "workspace:*"
  }
}
```

**Apply to `apps/api/package.json` as:**
- `"name": "api"` (matches RESEARCH.md's `pnpm --filter api` usage throughout)
- `"main"` → likely `dist/server.js` post-build, or omit if not published — this is the one place `apps/api` diverges from the packages/ shape, since it needs `build`/`start` scripts (RESEARCH.md Pitfall 2), not just `test`
- `dependencies`: `event-schema: workspace:*`, `company-core: workspace:*`, plus `fastify`, `@fastify/websocket`, `@fastify/rate-limit`, `drizzle-orm`, `pg` (RESEARCH.md Standard Stack table has exact versions)
- `devDependencies`: `drizzle-kit`, `@types/pg`
- Keep `"scripts": { "test": "vitest run" }` — same convention, plus add `"build"` and `"start"`/`"dev"`

---

### `apps/api/src/routes/events.ts` (controller/route, request-response)

**Contract analog:** `packages/event-schema/src/index.ts` (full file, 4 lines, read this session) — this is what the ingestion route MUST import unmodified:
```typescript
export { CompanyEventSchema } from "./payloads/index";
export type { CompanyEvent } from "./payloads/index";
export { VisibilitySchema, BaseEnvelope } from "./envelope";
```

**Envelope shape it validates against** — `packages/event-schema/src/envelope.ts` (full file, 19 lines, read this session):
```typescript
export const BaseEnvelope = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  companyId: z.string(),
  floorId: z.string().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  sourceAgentId: z.string().optional(),
  destinationAgentId: z.string().optional(),
  visibility: VisibilitySchema,
});
```
The Drizzle `events` table (RESEARCH.md Code Examples) mirrors this column set exactly — do not add/rename columns beyond what `BaseEnvelope` carries.

**No route-handler analog exists in this repo.** Use RESEARCH.md Pattern 1 (event ingestion + `.onConflictDoNothing({ target: events.id })` for D-04 dedup) verbatim as the implementation template — it is already written against the real `CompanyEventSchema` import path.

---

### `apps/api/src/routes/ws.ts`, `admin-workers.ts`, `src/auth/credentials.ts`, `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `src/env.ts`, `src/server.ts`

**No same-role or partial analog exists anywhere in this repo** — no Fastify server, no DB layer, no auth module has been built before this phase. Do not force-fit an analog; use RESEARCH.md's Code Examples section verbatim as the pattern source (each is already Context7-verified against the actual official docs and adapted to this repo's real `event-schema` import path):

- WS auth hook → RESEARCH.md Pattern 2 (`preValidation` hook, not raw `ws` `verifyClient`)
- Admin routes validation → RESEARCH.md Pattern 3 (manual Zod `.safeParse()`, matching the same manual-parse convention `packages/event-schema` already established for events — no new type-provider dependency)
- Rate limiting → RESEARCH.md Pattern 4 (`@fastify/rate-limit`, per-route `config.rateLimit`)
- CSRF posture → RESEARCH.md Pattern 5 (header-only auth, no cookie middleware)
- Append-only enforcement → RESEARCH.md Pattern 6 (DB trigger, in a `drizzle-kit`-generated migration)
- Drizzle schema (`events`, `workers` tables) → RESEARCH.md "Code Examples: Drizzle schema for `events` and `workers`"
- DB client singleton → RESEARCH.md "Code Examples: Drizzle + node-postgres connection"
- `drizzle.config.ts` → RESEARCH.md "Code Examples: drizzle-kit config"
- Credential hash/verify → RESEARCH.md "Code Examples: Credential hashing helper" (uses `crypto.randomBytes`/`createHmac`/`timingSafeEqual` — Node builtins per Don't Hand-Roll, not a new dependency)
- Env validation → RESEARCH.md Don't Hand-Roll row ("one small Zod schema over `process.env`, parsed once in `env.ts`")

---

### `apps/api/src/routes/*.test.ts` (test)

**Analog:** `packages/company-core/src/reducer.test.ts` and `packages/event-schema/src/envelope.test.ts` — both use bare Vitest (`vitest run`, no shared config file, no custom setup), matching RESEARCH.md's Validation Architecture table (`pnpm --filter api test`). Copy the same `describe`/`it` + plain `expect` structure; no new test-framework conventions needed for `apps/api`'s test files.

---

## Shared Patterns

### Workspace package shape
**Source:** `packages/company-core/package.json`, `packages/event-schema/package.json` (both read in full this session)
**Apply to:** `apps/api/package.json`
```json
{
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "scripts": { "test": "vitest run" }
}
```
`apps/api` additionally needs `build`/`start` scripts these two packages don't have (RESEARCH.md Pitfall 2) — that's the one deliberate divergence from the pattern.

### Event contract (do not modify)
**Source:** `packages/event-schema/src/index.ts`, `packages/event-schema/src/envelope.ts` (both read in full this session)
**Apply to:** `apps/api/src/routes/events.ts`, `apps/api/src/db/schema.ts`
Every new file that touches events imports `CompanyEventSchema`/`BaseEnvelope` from `event-schema` as a workspace dependency — never redefines or copies the Zod shape locally.

### Vitest test structure
**Source:** `packages/company-core/src/reducer.test.ts`, `packages/event-schema/src/envelope.test.ts`
**Apply to:** all 4 new test files under `apps/api/src/`
No shared `vitest.config.ts` exists in the repo — each package just runs `vitest run` directly; `apps/api` should follow the same zero-config convention.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/api/src/db/schema.ts` | model | CRUD | No DB layer exists in repo yet — first Drizzle schema |
| `apps/api/src/db/client.ts` | service | CRUD | No DB connection module exists yet |
| `apps/api/drizzle.config.ts` | config | n/a | No `drizzle-kit` usage exists yet |
| `apps/api/src/routes/ws.ts` | controller | streaming | No WebSocket route exists in repo yet |
| `apps/api/src/routes/admin-workers.ts` | controller | CRUD | No HTTP admin route exists in repo yet |
| `apps/api/src/auth/credentials.ts` | utility | transform | No auth/credential module exists yet |
| `apps/api/src/env.ts` | config | n/a | No env-validation module exists yet |
| `apps/api/src/server.ts` | service | request-response | No Fastify server bootstrap exists yet — first `apps/*` package |
| `apps/api/Dockerfile` | config | n/a | No Dockerfile exists anywhere in repo yet |

For all of the above, RESEARCH.md's Architecture Patterns / Code Examples sections (Context7-sourced, tool-verified) are the pattern source the planner should cite directly instead of a codebase analog.

## Metadata

**Analog search scope:** `packages/event-schema/`, `packages/company-core/`, repo root config files (`pnpm-workspace.yaml`, `turbo.json`, `package.json`)
**Files scanned:** 10 (2 package.json, 2 index/schema files, 1 reducer, 2 test files, `pnpm-workspace.yaml`, `turbo.json`, root `package.json`)
**Pattern extraction date:** 2026-09-18

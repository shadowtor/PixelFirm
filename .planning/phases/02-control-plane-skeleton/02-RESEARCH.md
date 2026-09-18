# Phase 2: Control Plane Skeleton - Research

**Researched:** 2026-09-18
**Domain:** Fastify control-plane API + authenticated WebSocket gateway + append-only Postgres event log (Node.js/TypeScript, Coolify-deployed)
**Confidence:** MEDIUM (capped by two LOW-confidence security-architecture judgment calls flagged explicitly below — everything else is MEDIUM/HIGH, tool-verified this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Postgres topology):** Add a new `pixelfirm` database to the existing `shared-postgres-prod` Coolify resource (postgres:16-alpine) — not a dedicated instance. Target **Postgres 16**, superseding STACK.md's unverified 18.x assumption. Reversibility: costly (live migration required to move off later).
- **D-02 (Staging deployment):** Deploy this phase's control plane (Fastify API + Postgres + WS gateway) to Coolify now, on a staging/test subdomain (`test.pixelfirm.dev`-style) — not `pixelfirm.dev` production. Verify success criteria via Playwright/API calls against the staging URL, not just localhost. Reversible.
- **D-03 (Worker credential issuance):** Build a minimal Fastify admin HTTP endpoint (issue/list/revoke worker credentials) gated by a single bootstrap secret env var — not a CLI/seed script. Phase 6's CEO dashboard reuses these same routes later (swaps bootstrap-secret guard for a real CEO session).
  - **Credential mechanics (locked, not open for replanning):** token is high-entropy random (`crypto.randomBytes`), shaped `{workerId}.{secret}`. Server stores only a hash of the secret (SHA-256 or keyed HMAC with a server-side pepper) — never reversible encryption, never plaintext. WS handshake: secret sent via `Authorization: Bearer` header on the HTTP Upgrade request (query param only as a fallback for clients that can't set headers); validated by looking up the row by `workerId`, hash-comparing the secret, and checking a `revoked_at`/status column — all *before* the upgrade completes. Revocation = flip status/set `revoked_at`, takes effect on next connection attempt.
- **D-04 (Event-ID dedup, carried forward from Phase 1 D-03 — locked, not a gray area):** The Postgres ingestion layer MUST include event-ID dedup as a named part of EVENT-02 — e.g. a unique constraint on the event log's event-ID column with an `ON CONFLICT DO NOTHING`-style upsert. Reversibility: one-way if skipped (retrofitting uniqueness onto a populated table requires a data-cleanup migration).

### Claude's Discretion

- Exact Drizzle schema/table layout for the event log (single `events` table vs. per-category tables); Phase 1's discriminated-union payload shape (`packages/event-schema`) carries over unmodified either way.
- Which unique-constraint/upsert pattern implements D-04's dedup requirement — pick whichever Drizzle idiom is cleanest.
- Naming: use `pixelfirm` (or `pixelfirm_prod`) as the new database name, and a `test.pixelfirm.dev`-style staging subdomain, consistent with existing `community_site`/`wardogsoutpost` naming convention on this Coolify server.
- Exact route paths/request-response schemas for the admin credential endpoints, as long as they support issue/list/revoke and are guarded by the bootstrap secret.
- CSRF/rate-limiting/input-validation implementation specifics (SEC-04) for whatever HTTP endpoints exist in this phase — no browser-facing session/cookie auth exists yet, so CSRF exposure is limited to the admin credential routes; Claude decides the concrete Fastify plugins/middleware.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVENT-02 | Company Event Bus ingests events from Claude Code, Git, CI, and GSD into an append-only Postgres event log | Standard Stack (Drizzle schema), Architecture Pattern 1 (ingestion endpoint), Pitfall 1 (append-only enforcement), Code Examples |
| SEC-01 | OAuth tokens and other credentials are stored/protected server-side only and encrypted at rest where applicable | Security Domain section, Runtime State Inventory-style scoping note below (no OAuth tokens exist yet this phase — see "SEC-01 scope note") |
| SEC-02 | WebSocket connections are authenticated; per-worker credentials are unique and revocable | Architecture Pattern 2 (WS upgrade auth), Code Examples, Pitfall 3 |
| SEC-03 | No endpoint allows arbitrary remote shell/command execution | Don't Hand-Roll, Security Domain (no exec-shaped endpoints exist in this phase's surface — verified by route inventory) |
| SEC-04 | Input from chat/viewer events is validated and rate-limited; CSRF protection is applied to control-plane endpoints | Architecture Pattern 3 (validation), Pattern 4 (rate-limit), Pattern 5 (CSRF strategy — header-auth argument), Pitfall 4 |

**SEC-01 scope note:** No OAuth tokens exist in this phase's surface — Twitch/YouTube OAuth arrives in Phase 8. What Phase 2 actually has to protect under SEC-01 is (a) the worker credential secrets (D-03, hashed never stored plaintext), (b) the bootstrap admin secret (env var, never in DB/git), and (c) the Postgres connection string (Coolify env var). Document this scoping explicitly in the plan so a reviewer doesn't expect an OAuth token vault that has no reason to exist yet.
</phase_requirements>

## Summary

This phase is infrastructure, not features: one new `apps/api` Fastify service that (1) exposes a durable, append-only Postgres event ingestion endpoint validated against Phase 1's existing `packages/event-schema` Zod schema, (2) exposes a WebSocket route that only 	completes the upgrade handshake for a valid, unrevoked, hashed per-worker credential, and (3) exposes three small admin HTTP routes (issue/list/revoke credentials) gated by a bootstrap secret. All three surfaces are proven against synthetic/test events (no real producers exist until Phase 3) and deployed to a Coolify staging subdomain, verified there via API calls/Playwright rather than only localhost.

The stack is already decided by STACK.md and the phase CONTEXT.md: Fastify 5 + `@fastify/websocket` (not bare `ws`, since the gateway is co-located in the same process as the admin HTTP routes and needs Fastify's lifecycle hooks for pre-upgrade auth) + Drizzle ORM + `pg` against Postgres 16. The one genuinely load-bearing research finding this phase is about SEC-04's CSRF requirement: the admin routes have no cookie/session auth surface, so classic cookie-based CSRF middleware (`@fastify/csrf-protection`, which requires `@fastify/cookie`'s double-submit pattern) is the wrong tool here — OWASP's own CSRF cheat sheet names "custom request header" as a standalone, sufficient CSRF defense for exactly this shape of API. Recommend implementing SEC-04 via required-header auth + `@fastify/rate-limit`, not by installing cookie-based CSRF middleware for a system that has no cookies.

A second finding, verified by reading the actual repo files this session (not assumed from CONTEXT.md's summary): `pnpm-workspace.yaml` currently only globs `packages/*` — it does **not** yet include `apps/*`. CONTEXT.md's Integration Points section states the `apps/*` glob "already picks up new packages with zero config changes," but the file on disk contradicts that. The plan MUST include a task to add `apps/*` to `pnpm-workspace.yaml` before `apps/api` will be linked as a workspace member.

**Primary recommendation:** Build `apps/api` as a single Fastify 5 process hosting the event-ingestion route, the `@fastify/websocket`-based WS gateway (auth enforced in a `preValidation` hook, not a raw `ws` `verifyClient` callback), and the three admin credential routes — backed by Drizzle ORM + `pg` against the shared Postgres 16 instance, with `@fastify/rate-limit` on all mutating routes and header-based auth (not cookie-based CSRF middleware) satisfying SEC-04.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event ingestion (validate + append) | API / Backend | Database / Storage | Fastify route validates via `event-schema`'s Zod union; Postgres owns durability/uniqueness enforcement (DB-level UNIQUE + trigger, not just app discipline) |
| Append-only enforcement | Database / Storage | — | A DB-level trigger/constraint is the only way to make "no update/delete path" true regardless of which app code path touches the table later (Phase 3+ adapters, future migrations) |
| WS gateway authentication | API / Backend | — | Auth decision must happen server-side, before the 101 upgrade response is sent — this is inherently a backend/gateway responsibility, never delegable to the client |
| Worker credential issuance/storage | API / Backend | Database / Storage | Admin routes live in Fastify; the credential rows (hash, revoked_at) persist in Postgres via the same Drizzle client as the event log |
| Rate limiting / input validation / CSRF posture | API / Backend | — | Enforced at the Fastify plugin/route layer, before any handler logic runs |
| Deployment/networking (staging domain, TLS, container) | CDN / Static (reverse proxy) | API / Backend | Coolify's built-in Traefik/proxy layer terminates TLS and routes the staging subdomain to the `apps/api` container; the app itself just binds a port |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| Fastify | ^5.12 (5.12.5 confirmed on npm 2026-09-16) [VERIFIED: npm registry + Context7 `/fastify/fastify`] | Control-plane HTTP framework | Already the project's chosen framework (STACK.md); plugin lifecycle maps cleanly onto admin routes + WS gateway in one process |
| `@fastify/websocket` | ^11.3 (11.3.0, published 2026-09-04) [VERIFIED: npm registry + Context7 `/fastify/fastify-websocket`, package-legitimacy OK — 1.8M weekly downloads, official `fastify` org repo] | WS gateway, co-located in the API process | Wraps `ws` but exposes Fastify's `onRequest`/`preValidation`/`preHandler` hooks on the upgrade request — this is what lets the D-03 auth check run and reject *before* the 101 response, matching the locked credential-mechanics requirement without needing a raw `ws` `verifyClient` callback |
| Drizzle ORM | ^0.45 (0.45.2, published 2026-09-09) [VERIFIED: npm registry + Context7 `/drizzle-team/drizzle-orm-docs`, package-legitimacy OK — 20M weekly downloads] | Postgres schema + query layer for the event log and credentials table | TS-native schema, no codegen; `unique()` + `.onConflictDoNothing()` directly implements D-04's dedup requirement |
| `drizzle-kit` | ^0.31 (0.31.10, published 2026-09-09) [VERIFIED: npm registry, package-legitimacy OK] | Migration generation/apply CLI | Standard companion to drizzle-orm; `generate` diffs schema.ts against prior migrations, `migrate` applies unapplied ones |
| `pg` | ^8.23 (confirmed on npm 2026-08-08) [CITED: Drizzle official docs pair `drizzle-orm/node-postgres` with `pg`; package-legitimacy OK — 48M weekly downloads] | Postgres driver | Drizzle's `drizzle-orm/node-postgres` entrypoint is built specifically for this driver |
| `@fastify/rate-limit` | ^11.2 (11.2.0, published 2026-09-04) [VERIFIED: npm registry + Context7 `/fastify/fastify-rate-limit`, package-legitimacy OK — 2.6M weekly downloads] | Per-route request rate limiting (SEC-04) | Official Fastify org plugin; supports `global:false` + per-route `config.rateLimit` for tighter limits on credential issue/revoke routes |
| `pino` | Fastify's built-in default | Structured logging with redaction | Already Fastify's default logger; `redact: ['req.headers.authorization']` is required here to keep worker/bootstrap secrets out of logs (SEC-01) |
| Zod | ^4.6 (already a dependency via `packages/event-schema`) [VERIFIED: packages/event-schema/package.json / Phase 1 usage] | Input validation for admin route bodies and re-use of `CompanyEventSchema` for ingestion | Already established in the repo (Phase 1); no new validation library needed — see Don't Hand-Roll |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/env` or plain `process.env` + a small Zod env schema | latest / n/a | Validate `DATABASE_URL`, `BOOTSTRAP_SECRET`, `CREDENTIAL_PEPPER` are present at boot | Fail fast on missing secrets rather than a runtime crash on first request; a 5-line Zod `parse()` on `process.env` at startup is simplest — no new dependency required (see Don't Hand-Roll) |
| `Vitest` | already root dependency | Unit tests for reducer-adjacent logic, dedup upsert, credential hash/compare | Matches existing per-package `vitest run` pattern (`packages/company-core/package.json`, `packages/event-schema/package.json`) |
| `Playwright` | already root-mandated (PROJECT.md), not yet installed anywhere in repo [VERIFIED: no `playwright.config.*` found in repo this session] | E2E verification of the deployed staging API/WS endpoints per D-02 | This phase is the first to need it — Wave 0 gap, see Validation Architecture section |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@fastify/websocket` | bare `ws` + `http.Server.on('upgrade', ...)` + `verifyClient` | STACK.md's original recommendation for a *standalone* WS process; not needed here because CONTEXT.md's Integration Points decision co-locates the gateway inside the Fastify API process — `@fastify/websocket` gives the same `ws`-backed socket with less plumbing for shared-process auth |
| `@fastify/csrf-protection` (cookie double-submit) | Required custom header (`Authorization: Bearer`) + strict CORS | Cookie-based CSRF middleware protects cookie/session auth, which doesn't exist in this phase — see Architecture Pattern 5 below. Revisit when Phase 6 adds a browser-facing CEO session with cookies |
| DB-level trigger for append-only enforcement | `REVOKE UPDATE, DELETE` on the table from the app's Postgres role | REVOKE requires the app to connect as a role *distinct from* the table owner/migration role — added operational complexity (two DB roles) not worth it for a single-operator MVP on a shared Postgres instance. A `BEFORE UPDATE OR DELETE` trigger that raises an exception enforces the same guarantee regardless of which role runs the query, with one migration file |
| SHA-256/HMAC-SHA-256 for credential secret hashing | argon2id/bcrypt (OWASP's password-hashing recommendation) | OWASP's slow-hash guidance targets **low-entropy human passwords** vulnerable to offline brute force. The worker secret is a `crypto.randomBytes` high-entropy token (already effectively unguessable) — HMAC-SHA-256 with a server-side pepper is the correct, standard choice here (same category as API-key/session-token storage), and this is what D-03 already locked. Do not "upgrade" this to bcrypt during planning — it would be over-engineering for the wrong threat model |

**Installation:**
```bash
pnpm --filter api add fastify @fastify/websocket @fastify/rate-limit drizzle-orm pg
pnpm --filter api add -D drizzle-kit @types/pg
pnpm add -Dw @playwright/test   # first Playwright install in the repo — Wave 0 gap
```

**Version verification:** All versions above were confirmed via `npm view <pkg> version` against the live registry on 2026-09-18 (see per-row tags); Postgres target (16, not STACK.md's 18.x assumption) is a locked decision from CONTEXT.md D-01, itself verified via Coolify MCP during the discuss-phase session (not re-verified by this research session — no Coolify MCP tool was available to this agent).

## Package Legitimacy Audit

| Package | Registry | Age/Published | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@fastify/websocket` | npm | 2026-07-08 (latest 2026-09-04) | 1.8M/wk | github.com/fastify/fastify-websocket | OK | Approved |
| `@fastify/rate-limit` | npm | 2026-07-29 (latest 2026-09-04) | 2.6M/wk | github.com/fastify/fastify-rate-limit | OK | Approved |
| `drizzle-orm` | npm | 2026-03-27 (latest 2026-09-09) | 20M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `drizzle-kit` | npm | 2026-03-17 (latest 2026-09-09) | 16.6M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `pg` | npm | (latest 2026-08-08) | 48M/wk | github.com/brianc/node-postgres | OK | Approved |
| `@fastify/cookie` | npm | (latest 2026-07-15) | 2.6M/wk | github.com/fastify/fastify-cookie | OK | Not used this phase — no cookie/session auth surface exists yet; revisit at Phase 6 |
| `@fastify/csrf-protection` | npm | (latest 2026-08-02) | 96.8k/wk | github.com/fastify/csrf-protection | OK | Not recommended this phase — see Architecture Pattern 5 (wrong tool for a header-only API); flagged `[ASSUMED]` package-name provenance, not fetched via official docs this session |
| `fastify-type-provider-zod` | npm | (latest 2026-06-24) | 988k/wk | github.com/turkerdev/fastify-type-provider-zod | OK | Not recommended — see Don't Hand-Roll (manual `safeParse` reuses the existing pattern with zero new deps) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none — all candidate packages returned OK from `gsd-tools query package-legitimacy check`

*`@fastify/csrf-protection` and `fastify-type-provider-zod` are legitimate OK-verdict packages that are deliberately **not** recommended for this phase (architectural fit, not legitimacy) — see Architecture Pattern 5 and Don't Hand-Roll respectively.*

## Architecture Patterns

### System Architecture Diagram

```
 Synthetic/test event producers (Phase 3+ real: Claude Code/Git/CI/GSD)
             │  HTTP POST /events  (JSON body)
             ▼
   ┌───────────────────────────────────────────────┐
   │  apps/api  (Fastify 5, single Node process)    │
   │                                                 │
   │  POST /events                                  │
   │   └─ CompanyEventSchema.safeParse(body)         │  ◄── reuse packages/event-schema (Phase 1)
   │       │ invalid → 400                           │
   │       ▼ valid                                   │
   │      Drizzle insert ... onConflictDoNothing()   │  ◄── D-04 dedup on event.id UNIQUE
   │       │                                          │
   │       ▼                                          │
   │  ┌─────────────────────────────────────────┐    │
   │  │ Postgres 16 `pixelfirm` DB               │    │
   │  │  events table (append-only via trigger)  │    │
   │  │  workers table (id, secretHash,          │    │
   │  │                 revoked_at)               │    │
   │  └─────────────────────────────────────────┘    │
   │                                                 │
   │  GET  /ws  (WebSocket upgrade)                  │
   │   └─ preValidation hook:                        │
   │       parse Authorization: Bearer {id}.{secret} │
   │       → lookup workers row by id                │
   │       → timingSafeEqual(hash(secret), stored)    │
   │       → revoked_at IS NULL?                      │
   │       │ any check fails → reply.code(401) (no    │
   │       │   101 upgrade sent)                      │
   │       ▼ passes                                   │
   │      wsHandler: socket registered, broadcasts    │
   │      future company-state events (Phase 3+)      │
   │                                                 │
   │  POST/GET/DELETE /admin/workers*                │
   │   └─ onRequest: bootstrap-secret header check    │
   │   └─ @fastify/rate-limit (tight per-route limit) │
   │   └─ Zod-validated body → issue/list/revoke      │
   └───────────────────────────────────────────────┘
             ▲
             │  deployed as one Coolify resource, Dockerfile build pack,
             │  behind Coolify's Traefik proxy on test.pixelfirm.dev
```

### Recommended Project Structure

```
apps/
└── api/
    ├── src/
    │   ├── db/
    │   │   ├── schema.ts        # Drizzle pgTable defs: events, workers
    │   │   └── client.ts        # drizzle(process.env.DATABASE_URL!) singleton
    │   ├── routes/
    │   │   ├── events.ts        # POST /events (ingestion)
    │   │   ├── ws.ts            # GET /ws (gateway) + preValidation auth hook
    │   │   └── admin-workers.ts # issue/list/revoke, bootstrap-secret gated
    │   ├── auth/
    │   │   └── credentials.ts   # generateToken(), hashSecret(), verifySecret()
    │   ├── env.ts                # Zod-parsed process.env at boot
    │   └── server.ts             # Fastify instance, plugin registration, listen()
    ├── drizzle/                  # generated migration folders (drizzle-kit generate)
    ├── drizzle.config.ts
    ├── Dockerfile
    └── package.json
```

### Pattern 1: Event ingestion reuses Phase 1's schema, adds DB-level append-only + dedup

**What:** The `POST /events` handler does not reimplement validation — it calls the existing `CompanyEventSchema.safeParse(body)` from `packages/event-schema`, then inserts via Drizzle with `.onConflictDoNothing({ target: events.id })`.
**When to use:** Every event write path in this phase (synthetic/test events now, real producers from Phase 3 onward reuse the same route).
**Example:**
```typescript
// Source: packages/event-schema (Phase 1, read this session) + Context7 /drizzle-team/drizzle-orm-docs
import { CompanyEventSchema } from "event-schema";
import { db } from "../db/client";
import { events } from "../db/schema";

fastify.post("/events", async (request, reply) => {
  const parsed = CompanyEventSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.flatten() });
  }
  const event = parsed.data;
  await db.insert(events).values({
    id: event.id,
    type: event.type,
    version: event.version,
    occurredAt: event.occurredAt,
    companyId: event.companyId,
    payload: event.payload, // jsonb column
    visibility: event.visibility,
  }).onConflictDoNothing({ target: events.id }); // D-04 dedup
  return reply.code(202).send({ accepted: true });
});
```

### Pattern 2: WS auth in `preValidation`, not a raw `ws` `verifyClient` callback

**What:** `@fastify/websocket`'s upgrade request flows through Fastify's normal hook chain (`onRequest → preParsing → preValidation → preHandler`); any hook that sends a non-101 response rejects the upgrade before the socket is created.
**When to use:** The `/ws` route — this is the mechanism that satisfies D-03's "validated ... before `handleUpgrade()` completes" requirement inside a Fastify-hosted gateway.
**Example:**
```typescript
// Source: Context7 /fastify/fastify-websocket (fetched this session)
fastify.addHook("preValidation", async (request, reply) => {
  if (request.routerPath !== "/ws") return; // scope to the WS route only
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (request.query as { token?: string }).token; // fallback only — see Pitfall 4
  if (!token) return reply.code(401).send({ error: "missing credential" });

  const [workerId, secret] = token.split(".");
  const worker = await db.query.workers.findFirst({ where: eq(workers.id, workerId) });
  if (!worker || worker.revokedAt) return reply.code(401).send({ error: "invalid or revoked" });

  const computed = hmacSha256(secret, process.env.CREDENTIAL_PEPPER!);
  const stored = Buffer.from(worker.secretHash, "hex");
  if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) {
    return reply.code(401).send({ error: "invalid credential" });
  }
});

fastify.get("/ws", { websocket: true }, (socket, request) => {
  // connection accepted — worker is authenticated
});
```

### Pattern 3: Manual Zod validation for admin routes, not a Fastify type-provider

**What:** Define a small Zod schema per admin route body and call `.parse()`/`.safeParse()` inside the handler — the same pattern Phase 1 already established for events, not a new schema-compiler integration.
**When to use:** All three admin credential routes (issue/list/revoke).
**Why not `fastify-type-provider-zod`:** It's a legitimate, well-downloaded package, but it exists to make Fastify's *route-level* JSON-schema validation/serialization Zod-native (useful for OpenAPI-style generated docs). This phase has 4 small routes total and already has a working manual-parse convention from Phase 1 — adding a type-provider is a net-new dependency and registration step for no capability this phase needs.

### Pattern 4: `@fastify/rate-limit`, tighter limits on mutating admin routes

**What:** Register globally disabled (`global: false`), then set explicit per-route `config.rateLimit` — tightest on `/admin/workers` issue/revoke (these are privileged, low-volume-by-design operations), looser on `/events` (expected higher volume once real producers exist).
**Example:**
```typescript
// Source: Context7 /fastify/fastify-rate-limit (fetched this session)
await fastify.register(import("@fastify/rate-limit"), { global: false });

fastify.post("/admin/workers", {
  config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
}, issueWorkerHandler);

fastify.post("/events", {
  config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
}, ingestEventHandler);
```

### Pattern 5: CSRF strategy for a header-only API — required header, not cookie middleware

**What:** SEC-04 requires "CSRF protection," but this phase's admin routes authenticate via a bootstrap-secret custom header, never a cookie. OWASP's own CSRF Prevention Cheat Sheet names "custom request header" as a standalone, sufficient CSRF defense for API/AJAX endpoints: browsers cannot attach arbitrary custom headers to a cross-site request without an explicit CORS preflight grant, so a hostile page cannot forge a credentialed request the way it can against cookie-authenticated endpoints.
**When to use:** Every route in this phase. Concretely: (1) never accept the bootstrap secret or worker credential via a cookie, (2) don't add permissive CORS (no `Access-Control-Allow-Origin: *`) since there's no legitimate browser client for these routes yet, (3) document this as the SEC-04 CSRF control in the plan/PR description so a reviewer doesn't expect `@fastify/csrf-protection`.
**Revisit when:** Phase 6 adds a browser-facing CEO dashboard with a cookie-based session — that is the point a double-submit CSRF token (`@fastify/csrf-protection` + `@fastify/cookie`) becomes the correct control, because cookies *are* auto-attached cross-site.
`[CITED: OWASP Cross-Site Request Forgery Prevention Cheat Sheet, cheatsheetseries.owasp.org — fetched via WebSearch this session]`

### Pattern 6: Append-only enforcement via DB trigger, not app-layer discipline alone

**What:** A `BEFORE UPDATE OR DELETE` trigger on the `events` table that raises an exception, attached in a migration. This makes "no update/delete path" literally true at the database level regardless of which future app code (Phase 3+ adapters, an ORM migration, an ad-hoc script) touches the table, rather than relying on "the app just never calls UPDATE/DELETE."
**Why not `REVOKE`:** `REVOKE UPDATE, DELETE ON events FROM app_role` only works if the app connects as a role distinct from the table owner — the table owner always retains full privileges on its own objects. Standing up a second, lower-privileged Postgres role inside the shared `shared-postgres-prod` instance is extra operational surface not justified for a single-operator MVP; a trigger achieves the same guarantee with one migration file and no role management.
`[CITED: PostgreSQL Audit Trigger wiki (wiki.postgresql.org/wiki/Audit_trigger) + community guidance found via WebSearch this session — "rules... (on update do nothing)... add triggers... raise errors on update" is the pattern several independent sources converge on]`
```sql
-- Source: pattern synthesized from PostgreSQL trigger docs + audit-trigger wiki guidance
CREATE OR REPLACE FUNCTION reject_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events table is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_append_only
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
```

### Anti-Patterns to Avoid

- **Validating events twice (Fastify JSON-schema route validation + Zod):** Pick one. This repo already standardized on Zod (`packages/event-schema`) in Phase 1 — don't add a parallel Fastify/AJV JSON-schema layer for the same payloads.
- **Trusting `REVOKE`-only enforcement on a single-role Postgres setup:** See Pattern 6 — without a second DB role, `REVOKE` is a no-op against the owning role.
- **Sending the worker secret only via query string:** The header is the primary transport per D-03; a query-string fallback risks landing in access logs / reverse-proxy logs / browser history. If implemented, explicitly exclude the WS route's full URL from request logging (see Pitfall 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| WebSocket upgrade lifecycle / handshake plumbing | A raw `http.Server` upgrade handler wired by hand alongside Fastify | `@fastify/websocket` | Already wraps `ws` and exposes the exact Fastify hook chain the D-03 auth check needs; hand-wiring a second HTTP upgrade path alongside Fastify's own listener risks two servers racing for the same port/socket |
| Postgres migration diffing/apply tooling | Hand-written `.sql` migration files tracked manually | `drizzle-kit generate` / `drizzle-kit migrate` | Generates and tracks migration history automatically from schema.ts diffs; hand-rolled migration tracking is exactly the kind of infra that silently drifts |
| Constant-time secret comparison | A manual `for` loop comparing bytes | Node's built-in `crypto.timingSafeEqual` | Native, zero-dependency, exists precisely to prevent the timing side-channel a hand-rolled comparison would reintroduce |
| CSRF token generation/verification for a cookie-free API | `@fastify/csrf-protection` bolted on without cookies | Required custom header (Pattern 5) | Installing cookie-based CSRF middleware with no cookies to protect gives false confidence and adds a dependency that solves a threat model this phase doesn't have |
| Env var presence/shape validation at boot | Scattered `if (!process.env.X) throw` checks across files | One small Zod schema over `process.env`, parsed once in `env.ts` at startup | Centralizes the "fail fast on missing secret" behavior in one file; doesn't need a new dependency (`@fastify/env` is optional, plain Zod is already a dependency) |

**Key insight:** Every "don't hand-roll" item above already has an official, actively-maintained Fastify-ecosystem or Node-builtin answer — this phase's actual engineering judgment call is *which* of two legitimate tools fits the threat model (Pattern 5, Pattern 6), not building new plumbing.

## Common Pitfalls

### Pitfall 1: `pnpm-workspace.yaml` does not yet include `apps/*`

**What goes wrong:** `apps/api` is created but pnpm never links it as a workspace member — `pnpm --filter api ...` commands silently fail to resolve, or worse, `apps/api`'s dependency on `event-schema`/`company-core` via `workspace:*` fails to resolve at install time.
**Why it happens:** CONTEXT.md's Integration Points section states the `apps/*` glob "already picks up new packages with zero config edits" (per Phase 1 D-02) — this is incorrect. Reading the actual file this session shows only `packages/*` is present.
**How to avoid:** Add a task, before creating `apps/api`, to edit `pnpm-workspace.yaml` to include `apps/*`.
**Warning signs:** `pnpm install` reports `apps/api` as not part of the workspace, or `workspace:*` deps fail to resolve.
`[VERIFIED: pnpm-workspace.yaml:1-2, read this session]`
```yaml
packages:
  - "packages/*"
```
(no `apps/*` entry present)

### Pitfall 2: `turbo.json` only defines a `test` task

**What goes wrong:** `apps/api` needs a `build` (compile TS → JS for the Docker image) and likely a `dev` task; Turborepo's task graph won't know about them until added.
**Why it happens:** Phase 1 only needed `test` (per D-02's minimal-bootstrap scope) — `build`/`dev` were never added since no `apps/*` package existed yet.
**How to avoid:** Either add `build`/`dev` tasks to `turbo.json`, or have the Coolify Dockerfile call `pnpm --filter api run build`/`run start` directly, bypassing Turbo's task graph for the deploy path (simpler, and avoids touching root config for a single app that doesn't yet need caching).
**Warning signs:** `turbo run build` reports no tasks found for the `api` package.
`[VERIFIED: turbo.json, read this session — only a "test" task with dependsOn ["^test"] is defined]`

### Pitfall 3: WS secret sent via query string ends up in logs

**What goes wrong:** The query-param fallback (D-03) for clients that can't set headers puts the raw high-entropy secret directly in the request URL, which Fastify's default request logger (and any reverse proxy/Coolify access log) will record in plaintext.
**Why it happens:** Query strings are part of the logged URL by default; this is a well-known secret-leakage vector distinct from header logging (which is already addressed by `redact`).
**How to avoid:** If the query-param fallback is implemented, add a custom `req` serializer or explicit `redact` pattern for the WS route's query string, or simply don't implement the fallback until a real client actually needs it (YAGNI — no real WS client exists until Phase 3's worker, and the worker is a Node process that can set headers).
**Warning signs:** Grep Coolify's application logs for `ws?token=` and find it present.

### Pitfall 4: `onConflictDoNothing` silently swallows genuine schema-shape bugs, not just true duplicates

**What goes wrong:** If a producer sends a malformed re-send with the *same* `event.id` but a *different* payload (a bug, not a legitimate retry), `onConflictDoNothing` drops it silently — the row is not updated, no error surfaces, and the discrepancy is invisible unless specifically logged.
**Why it happens:** The dedup mechanism, by design, treats any conflict on `id` as "already seen, skip" — it doesn't check whether the *rest* of the row matches.
**How to avoid:** Log (at `info` or `warn` level, not silently) whenever an insert conflicts, so a genuine payload mismatch on retry is at least observable during Phase 2/3 debugging, even though the row itself is correctly left unmutated (append-only + dedup both hold).
**Warning signs:** A downstream consumer (Phase 1's reducer, once fed by Phase 2's log) shows fewer distinct event effects than the number of API calls made against `/events`.

### Pitfall 5: Bootstrap secret comparison via `===` reintroduces the same timing side-channel the credential hash comparison avoids

**What goes wrong:** The admin routes' bootstrap-secret check (`request.headers['x-bootstrap-secret'] === process.env.BOOTSTRAP_SECRET`) is a plain string comparison, vulnerable to the same character-by-character timing leak that `crypto.timingSafeEqual` exists to prevent for the worker credential path.
**Why it happens:** It's easy to treat the bootstrap-secret check as "just a config value comparison" rather than a security boundary, since it guards routes described informally as "the CEO's own admin surface."
**How to avoid:** Use `crypto.timingSafeEqual` (length-normalized) for the bootstrap-secret check too, not just the worker credential hash comparison.
**Warning signs:** Code review finds a `===` or `!==` comparison against any secret-shaped value.

## Code Examples

### Drizzle schema for `events` and `workers`
```typescript
// Source: Context7 /drizzle-team/drizzle-orm-docs (unique(), pgTable patterns, fetched this session)
// + packages/event-schema/src/envelope.ts field list (read this session) — column set mirrors BaseEnvelope
import { pgTable, uuid, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: uuid("id").primaryKey(),                         // matches CompanyEvent.id (z.string().uuid())
  type: text("type").notNull(),
  version: integer("version").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  companyId: text("company_id").notNull(),
  floorId: text("floor_id"),
  projectId: text("project_id"),
  taskId: text("task_id"),
  sourceAgentId: text("source_agent_id"),
  destinationAgentId: text("destination_agent_id"),
  visibility: text("visibility").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}); // id is already a PRIMARY KEY -> unique by construction; onConflictDoNothing({ target: events.id }) is still explicit for clarity

export const workers = pgTable("workers", {
  id: text("id").primaryKey(),
  secretHash: text("secret_hash").notNull(), // hex-encoded HMAC-SHA-256 output
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
```

### Drizzle + node-postgres connection
```typescript
// Source: Context7 /drizzle-team/drizzle-orm-docs (fetched this session)
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

### drizzle-kit config
```typescript
// Source: Context7 /drizzle-team/drizzle-orm-docs (fetched this session, adapted from the sqlite example to pg dialect)
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### Credential hashing helper
```typescript
// Source: Node.js crypto docs (built-in, well-established API) — pattern verified against
// D-03's locked mechanics (HMAC with server-side pepper) and OWASP's HMAC-for-high-entropy-secrets guidance
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

export function issueCredential(workerId: string) {
  const secret = randomBytes(32).toString("hex");
  const secretHash = createHmac("sha256", process.env.CREDENTIAL_PEPPER!).update(secret).digest("hex");
  return { token: `${workerId}.${secret}`, secretHash };
}

export function verifyCredential(secret: string, storedHashHex: string): boolean {
  const computed = createHmac("sha256", process.env.CREDENTIAL_PEPPER!).update(secret).digest();
  const stored = Buffer.from(storedHashHex, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Raw `ws.Server` + `verifyClient` for WS auth | Framework-integrated upgrade hooks (`@fastify/websocket`'s Fastify lifecycle) when co-located with an HTTP API | Standard practice for several years, reaffirmed by `@fastify/fastify-websocket`'s current docs (fetched this session) | Auth logic shares the same hook chain, middleware, and logging as the rest of the API instead of a parallel code path |
| Cookie-based CSRF tokens as a default for all APIs | Header-only auth as a recognized standalone CSRF defense for cookie-free APIs | Documented in OWASP's CSRF Cheat Sheet (not a recent change, but frequently applied incorrectly) | Avoids installing cookie/session infrastructure purely to satisfy a compliance checkbox that doesn't match the actual attack surface |

**Deprecated/outdated:** None specific to this phase's stack — Fastify 5, Drizzle 0.45.x, and the `@fastify/*` plugin family used here are all current majors, actively published within the last two months as of this research date.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `@fastify/csrf-protection` and `fastify-type-provider-zod` package names/purpose, beyond what was directly fetched via Context7 this session | Package Legitimacy Audit, Pattern 5, Pattern 3 | Low — both passed `package-legitimacy check` (OK verdict, real repos, real download counts) via npm registry; the only unverified part is the exact API shape of `@fastify/csrf-protection`, which isn't recommended for use this phase anyway |
| A2 | Postgres 16 is in fact the shared instance's live version | User Constraints (D-01) | This was verified via Coolify MCP during the discuss-phase session (per CONTEXT.md canonical_refs), not re-verified by this research agent (no Coolify MCP tool available in this session) — if infra changed since discuss-phase, the plan's Drizzle/Postgres-version-specific SQL (e.g., trigger syntax) should still work identically on 14–18 per Drizzle's own compatibility notes, so risk is low even if slightly stale |
| A3 | `pg` is the correct/only sensible driver pairing for `drizzle-orm/node-postgres` | Standard Stack | Low — this is Drizzle's own documented entrypoint name (`node-postgres`), strongly implying `pg` as the paired driver, though I did not pull a docs snippet explicitly naming `pg` by package name today |

## Open Questions (RESOLVED)

1. **Should `apps/api` host the WS gateway and admin routes as one Fastify instance, or should the WS gateway be a logically separate plugin registered on the same instance?** — RESOLVED: separate `fastify.register()` plugins per route group, one process.
   - What we know: CONTEXT.md's Integration Points section locks "co-located in one process" — not a separate service.
   - What's unclear: Whether to structure it as one flat `server.ts` registering all routes, or use Fastify's plugin/`register()` encapsulation to keep `/ws` and `/admin/*` logically separated within the same process.
   - Recommendation: Use `fastify.register()` for each route group (events, ws, admin-workers) as separate plugins within one process — matches the Recommended Project Structure above and costs nothing extra, since Fastify's plugin system is designed for exactly this without needing multiple processes.
   - Adopted: 02-01/02-02/02-03 each register their route group via `fastify.register()` as planned.

2. **Exact `events` table strategy: single table vs. per-category tables (left to Claude's Discretion by CONTEXT.md).** — RESOLVED: single table.
   - What we know: CONTEXT.md explicitly defers this to planning/implementation discretion; Phase 1's discriminated-union payload shape is unaffected either way.
   - What's unclear: Whether future query patterns (Phase 3+ adapters reading back specific event categories) will want category-specific indexes badly enough to justify per-category tables now.
   - Recommendation: Single `events` table with a `jsonb` payload column and a btree index on `(type, occurred_at)` — simplest for a 12-type-and-growing discriminated union; splitting into per-category tables now would require re-splitting again every time a new event category is added later (D-01 from Phase 1 already anticipates growth toward ~40 types).
   - Adopted: 02-01 implements a single `events` table per this recommendation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | apps/api runtime | ✓ (assumed dev machine has it — repo already builds/tests with it per Phase 1) | — | — |
| pnpm | workspace install | ✓ (packageManager pinned `pnpm@12.4.2` in root package.json) [VERIFIED: package.json:4, read this session] | 12.4.2 | — |
| Postgres 16 (`shared-postgres-prod`) | Event log + credentials storage | Locked as available per D-01 (verified via Coolify MCP during discuss-phase, not this session) | 16 (postgres:16-alpine) | — |
| Coolify (staging subdomain deploy target) | D-02 deployment | Locked as available per CONTEXT.md canonical_refs (existing `test.gg-au.com`/`test.wardogsoutpost.com` pattern) | — | — |
| Playwright | D-02's staging verification | ✗ — not yet installed anywhere in the repo [VERIFIED: no `playwright.config.*` found via repo search this session] | — | Install at Wave 0 (see Validation Architecture) |
| Docker (for Coolify's Dockerfile build pack) | Deployment packaging | Assumed available on Coolify host (not verified — outside this session's reach); local Docker not required if Coolify builds remotely | — | — |

**Missing dependencies with no fallback:** None identified — Playwright's absence has a direct, cheap fallback (install it, this phase is exactly when it's first needed).

**Missing dependencies with fallback:**
- Playwright — install via `pnpm add -Dw @playwright/test` as a Wave 0 task; this is the first phase that needs it per D-02.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (root dependency, per-package `vitest run` script — established Phase 1 pattern) [VERIFIED: packages/company-core/package.json, packages/event-schema/package.json, read this session] |
| Config file | none — each package just runs `vitest run` directly (no shared `vitest.config.ts` found) |
| Quick run command | `pnpm --filter api test` |
| Full suite command | `pnpm -r test` (root, runs all packages via Turbo's `test` task) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| EVENT-02 | POST /events with a valid synthetic event durably persists exactly once, even when the identical event.id is re-sent | integration (Vitest + a real or testcontainer Postgres) | `pnpm --filter api test -- events.test.ts` | ❌ Wave 0 |
| EVENT-02 | UPDATE/DELETE against the `events` table raises an exception (append-only enforcement) | integration (direct SQL against the migrated schema) | `pnpm --filter api test -- append-only.test.ts` | ❌ Wave 0 |
| SEC-02 | WS upgrade with no/invalid/revoked credential never completes (no 101 response); valid credential completes | integration (Vitest using a raw WS client against a running Fastify instance) | `pnpm --filter api test -- ws-auth.test.ts` | ❌ Wave 0 |
| SEC-02 | Revoking a credential blocks the *next* connection attempt (not existing open sockets, per D-03's stated semantics) | integration | `pnpm --filter api test -- ws-auth.test.ts` | ❌ Wave 0 |
| SEC-03 | Route inventory contains no exec/shell-invoking endpoint | manual-only (code review / route list audit — nothing to execute) | n/a — verified by reviewing the final route table against `apps/api/src/routes/*` | n/a |
| SEC-04 | Admin routes reject requests without the bootstrap-secret header; rate-limit triggers after configured threshold | integration | `pnpm --filter api test -- admin-workers.test.ts` | ❌ Wave 0 |
| D-02 (staging deploy) | The deployed staging URL's `/events`, `/ws`, `/admin/workers` all behave as above against real Coolify infra, not just localhost | e2e (Playwright, against `test.pixelfirm.dev`-style URL) | `pnpm exec playwright test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter api test`
- **Per wave merge:** `pnpm -r test` (full monorepo suite)
- **Phase gate:** Full suite green, plus the Playwright staging pass, before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/routes/events.test.ts` — covers EVENT-02 (ingestion + dedup)
- [ ] `apps/api/src/db/append-only.test.ts` — covers EVENT-02 (trigger enforcement)
- [ ] `apps/api/src/routes/ws-auth.test.ts` — covers SEC-02
- [ ] `apps/api/src/routes/admin-workers.test.ts` — covers SEC-01/SEC-04
- [ ] Playwright install + `playwright.config.ts` at repo root — first use in this repo, needed for D-02's staging verification
- [ ] A test/dev Postgres instance strategy for integration tests (either point at a disposable schema in `shared-postgres-prod`, or use a local/testcontainer Postgres — recommend a local Docker Postgres for fast iteration, reserving the staging Coolify Postgres for the Playwright e2e pass only)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | Yes | Per-worker credential (D-03: high-entropy token, HMAC-hashed, revocable) for WS; bootstrap-secret header for admin routes |
| V3 Session Management | No | No session/cookie concept exists in this phase's surface (see Pattern 5) |
| V4 Access Control | Yes | Bootstrap-secret gate is a coarse, single-tier access control (CEO-only) for admin routes — acceptable for this phase per D-03 (Phase 6 replaces it with a real CEO session) |
| V5 Input Validation | Yes | `CompanyEventSchema.safeParse` (events), ad-hoc Zod schemas (admin route bodies) |
| V6 Cryptography | Yes | `crypto.randomBytes` (token generation), `crypto.createHmac`/`timingSafeEqual` (hash + compare) — Node built-ins, never hand-rolled |
| V13 API and Web Service | Yes | Rate limiting (`@fastify/rate-limit`), no arbitrary command execution surface (SEC-03) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Duplicate/replayed event causing state drift | Tampering (data integrity) | D-04 dedup: UNIQUE constraint + `onConflictDoNothing` |
| Mutating/deleting historical events (audit-trail tampering) | Tampering, Repudiation | DB-level `BEFORE UPDATE OR DELETE` trigger (Pattern 6) |
| Credential brute-force against WS gateway | Elevation of Privilege | High-entropy token (128+ bits from `randomBytes(32)`) makes brute force infeasible; `@fastify/rate-limit` slows repeated failed attempts |
| Timing side-channel on secret comparison | Information Disclosure | `crypto.timingSafeEqual` for both the worker-credential hash compare and the bootstrap-secret compare (Pitfall 5) |
| CSRF against admin routes | Spoofing | Header-only auth, no cookies (Pattern 5) |
| Secrets leaking into logs (Authorization header, WS query-string fallback) | Information Disclosure | Pino `redact: ['req.headers.authorization']`; avoid/redact the WS query-param fallback (Pitfall 3) |
| Arbitrary command execution via a control-plane endpoint | Elevation of Privilege | SEC-03: no endpoint in this phase's surface accepts or executes shell/subprocess input — verify by route-table review, not by adding a sandboxing library that has nothing to sandbox yet |

## Sources

### Primary (HIGH confidence)
- `npm view` (live registry queries, this session) — exact published versions/dates for `fastify`, `@fastify/websocket`, `@fastify/rate-limit`, `@fastify/csrf-protection`, `@fastify/cookie`, `drizzle-orm`, `drizzle-kit`, `pg`, `fastify-type-provider-zod`
- `gsd-tools query package-legitimacy check` (this session) — OK verdicts with downloads/repo/postinstall signals for all 8 candidate npm packages
- Direct `Read` of repo files this session: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `package.json`, `packages/event-schema/src/envelope.ts`, `packages/event-schema/src/payloads/index.ts`, `packages/event-schema/src/index.ts`, `packages/company-core/src/reducer.ts`, `packages/company-core/package.json`

### Secondary (MEDIUM confidence)
- Context7 `/fastify/fastify-websocket` — pre-upgrade hook chain, header/query auth patterns (fetched this session)
- Context7 `/fastify/fastify` — logging redaction config, hook ordering internals (fetched this session)
- Context7 `/drizzle-team/drizzle-orm-docs` — `onConflictDoNothing`, `unique()`, node-postgres connection setup, drizzle-kit CLI workflow (fetched this session)
- Context7 `/fastify/fastify-rate-limit` — global vs per-route config, `keyGenerator` (fetched this session)
- OWASP Cross-Site Request Forgery Prevention Cheat Sheet (cheatsheetseries.owasp.org) — custom-header CSRF defense (WebSearch this session, authoritative source)
- OWASP Password Storage / Cryptographic Storage Cheat Sheets — HMAC-vs-slow-hash distinction for high-entropy vs low-entropy secrets (WebSearch this session, authoritative source, interpretation applied to this project's specific token shape)

### Tertiary (LOW confidence)
- PostgreSQL append-only/audit-trigger pattern (wiki.postgresql.org, GitHub issue discussion, various blog posts) — converging community guidance, no single canonical PostgreSQL-project doc found naming "append-only" as a first-class feature (WebSearch this session)
- Coolify Dockerfile build pack + monorepo deployment guidance (community threads, Coolify docs page) — directionally consistent across sources but not a single authoritative monorepo-specific Coolify guide (WebSearch this session)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version/legitimacy claim tool-verified this session against the live npm registry
- Architecture (event ingestion, dedup, WS auth hook mechanics): MEDIUM — Context7-sourced official docs, capped at MEDIUM per this session's classify-confidence seam
- Architecture (CSRF strategy, append-only trigger design): MEDIUM — grounded in an authoritative source (OWASP, PostgreSQL project wiki) but requires human confirmation that the header-only reasoning is accepted as satisfying SEC-04's literal wording — flagged for discuss/plan-check attention, not a settled fact
- Pitfalls: MEDIUM-HIGH — Pitfalls 1 and 2 are directly verified against files read this session (not assumed); Pitfalls 3-5 are standard security reasoning applied to this specific design

**Research date:** 2026-09-18
**Valid until:** ~30 days (stable ecosystem — Fastify 5/Drizzle 0.45/Postgres 16 are all mature majors; re-verify npm versions if planning is delayed past mid-October 2026)

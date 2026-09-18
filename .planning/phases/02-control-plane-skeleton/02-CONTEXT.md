# Phase 2: Control Plane Skeleton - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the control plane as real, deployable infrastructure: a durable, append-only Postgres event log (EVENT-02) and an authenticated WS gateway that rejects unauthorized/abusive connections by default (SEC-01 through SEC-04). No real event producers exist yet — Claude Code/Git/CI/GSD adapters and the worker component are Phase 3+. This phase proves the ingestion + auth skeleton against synthetic/test events, the same way Phase 1 proved the state engine against stubbed events, and it deploys that skeleton to real Coolify infrastructure on a staging domain.

</domain>

<decisions>
## Implementation Decisions

### Postgres topology & version
- **D-01:** Add a new `pixelfirm` database to the existing `shared-postgres-prod` Coolify resource (postgres:16-alpine), rather than provisioning a dedicated new Postgres instance — following the established `community_site` pattern of multiple sites sharing one Postgres container on this server. Target Postgres 16 (the shared instance's actual version), which also resolves the STATE.md blocker that flagged STACK.md's 18.x assumption as unverified. Advisor research recommended a dedicated instance instead (isolation from unrelated sites, since this log will later hold CEO-approval audit data and worker credentials) — the user explicitly chose the shared instance anyway. — **Reversibility:** costly — moving off a shared instance later means a live data migration and connection-string cutover, not just a config change; revisit if/when the event log starts holding sensitive audit/credential data at a volume where co-location with `community_site` becomes an actual operational problem.

### Staging deployment timing
- **D-02:** Deploy Phase 2's control plane (Fastify API + Postgres + WS gateway) to Coolify now, on a staging/test subdomain — not `pixelfirm.dev` (production). Verify this phase's own success criteria (event log durability, WS auth rejecting bad connections) via Playwright/API calls against the staging URL, not just localhost. This matches PROJECT.md's own key decision ("control plane targets Coolify from early phases") and the user's established cross-project pattern of standing up a test domain before touching main. — **Reversibility:** reversible.

### Worker credential issuance & storage
- **D-03:** Build a minimal Fastify admin HTTP endpoint (issue / list / revoke worker credentials) gated by a single bootstrap secret env var, rather than a one-off CLI/seed script. This gives Phase 6's CEO dashboard the same issue/list/revoke CRUD surface to build on later — Phase 6 swaps the bootstrap-secret guard for a real CEO session and adds UI on top of these same routes, instead of rebuilding the logic from scratch. — **Reversibility:** reversible.
  - **Credential mechanics (locked from research, not open for replanning):** issued token is high-entropy random (e.g. `crypto.randomBytes`), shaped as `{workerId}.{secret}`. Server stores only a hash of the secret (SHA-256 or keyed HMAC with a server-side pepper) — never reversible encryption, never plaintext; there is no legitimate need to read the token back after issuance. WS handshake: secret sent via `Authorization: Bearer` header on the HTTP Upgrade request (query param only as a fallback for clients that can't set headers); validated in an `upgrade`/`verifyClient` check that looks up the row by `workerId`, hash-compares the secret, and checks a `revoked_at`/status column — all *before* `handleUpgrade()` completes. Revocation = flip status/set `revoked_at`; takes effect on the next connection attempt, no token deletion required.

### Event-ID dedup at ingestion (carried forward from Phase 1 — locked, not a gray area)
- **D-04:** Per Phase 1's D-03 carry-forward requirement, the Postgres ingestion layer MUST include event-ID dedup as a named part of EVENT-02 — e.g. a unique constraint on the event log's event-ID column with an `ON CONFLICT DO NOTHING`-style upsert. This is explicitly called out because Phase 1's reducer was deliberately built as a pure function over exactly-once input, with dedup deferred to whichever layer first has a real transport — that's this phase. — **Reversibility:** one-way if skipped — a missing dedup constraint lets duplicate events silently corrupt projections in production (state drift, not a build-time error), and retrofitting uniqueness onto an already-populated table requires a data-cleanup migration, not just a code change.

### Claude's Discretion
- Exact Drizzle schema/table layout for the event log (single `events` table vs. per-category tables); Phase 1's discriminated-union payload shape (`packages/event-schema`) carries over unmodified either way.
- Which unique-constraint/upsert pattern implements D-04's dedup requirement (e.g. `event_id UNIQUE` + `INSERT ... ON CONFLICT (event_id) DO NOTHING` vs. a check-then-insert transaction) — pick whichever Drizzle idiom is cleanest.
- Naming: use `pixelfirm` (or `pixelfirm_prod`) as the new database name inside `shared-postgres-prod`, and a `test.pixelfirm.dev`-style staging subdomain, consistent with the existing `community_site`/`wardogsoutpost` naming convention already in use on this Coolify server.
- Exact route paths/request-response schemas for the admin credential endpoints (D-03), as long as they support issue/list/revoke and are guarded by the bootstrap secret.
- CSRF/rate-limiting/input-validation implementation specifics (SEC-04) for whatever HTTP endpoints exist in this phase (the admin credential routes) — no browser-facing session/cookie auth exists yet in Phase 2, so CSRF exposure is limited to those routes; Claude decides the concrete Fastify plugins/middleware.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Core Value, constraints (event-driven architecture, monorepo layout, Coolify deployment target), Key Decisions
- `.planning/REQUIREMENTS.md` — EVENT-02, SEC-01, SEC-02, SEC-03, SEC-04 (this phase's mapped requirements)
- `.planning/ROADMAP.md` §Phase 2 — Goal and Success Criteria for this phase
- `.planning/STATE.md` — Blockers/Concerns section: the dedup-at-ingestion carry-forward (source of D-04) and the now-resolved Coolify Postgres version blocker (source of D-01)

### Research
- `.planning/research/STACK.md` — Fastify ^5.12, Drizzle ORM ^0.45 + `pg`, `ws` ^8.21 (not Socket.IO), Zod ^4.6, Coolify Dockerfile build pack guidance for `apps/api`. Note: its Postgres 18.x assumption was superseded during this discussion by the live Coolify finding below — this phase targets Postgres 16.
- `.planning/phases/01-event-schema-state-engine/01-CONTEXT.md` — D-03 (dedup-at-ingestion carry-forward, source of D-04 above) and D-01 (event envelope/payload shape the Postgres schema must persist unmodified)

### Prior phase code (Phase 1, already built)
- `packages/event-schema/src/envelope.ts`, `packages/event-schema/src/payloads/` — the typed event envelope + discriminated union this phase's Postgres schema and ingestion endpoint must accept as-is
- `packages/company-core/src/reducer.ts` — the pure reducer this phase's event log feeds; Phase 2 does not change this, only gives events a durable, replayable home

### Live infra (checked via Coolify MCP during this discussion — not guessed)
- Coolify project "Shared Infrastructure" → `shared-postgres-prod` (postgres:16-alpine) — the target instance for D-01; its existing sibling database `community_site` is the naming/provisioning pattern to follow for the new `pixelfirm` database
- Existing test-subdomain convention on this Coolify server: `test.gg-au.com`, `test.wardogsoutpost.com` — the pattern D-02's staging subdomain follows

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/event-schema` (Zod discriminated union + envelope): Phase 2's ingestion endpoint validates incoming events against this schema before writing to Postgres — no new validation logic needed.
- `packages/company-core`: untouched by Phase 2; it remains the consumer of whatever the Postgres event log now durably stores.

### Established Patterns
- Phase 1 proved everything against stubbed/in-memory events before real infra existed. Phase 2 continues that discipline: build the ingestion + WS auth skeleton and prove it against synthetic/test events, since the real worker doesn't exist until Phase 3.
- Monorepo workspace (pnpm + Turborepo) is already scaffolded; Phase 2 adds `apps/api` as a new workspace member picked up by the existing glob with zero config changes (per Phase 1 D-02).

### Integration Points
- New `apps/api` (Fastify) is the first `apps/*` package created in the repo — imports `event-schema` and `company-core` as workspace deps, the same way `company-core` already imports `event-schema`.
- The WS gateway and the admin credential endpoints both live inside `apps/api` per STACK.md's Fastify + `ws`/`@fastify/websocket` guidance (co-located in one process, not a separate service — no horizontal-scaling need exists yet).

</code_context>

<specifics>
## Specific Ideas

No additional specifics beyond the three decisions above — discussion stayed focused on the researched gray areas (Postgres topology, staging deployment, worker credentials).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Control Plane Skeleton*
*Context gathered: 2026-09-18*

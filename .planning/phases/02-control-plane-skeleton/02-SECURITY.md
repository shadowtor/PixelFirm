---
phase: "02"
slug: "control-plane-skeleton"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-19"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Synthetic/test event producer -> POST /events | Untrusted-shaped input; Phase 3's real Claude Code/Git/CI/GSD adapters post through this exact route unmodified | Event envelopes (may carry payload data) |
| apps/api -> Postgres 16 (`pixelfirm`) | Trusted connection via DATABASE_URL; app is the only writer, must not bypass its own append-only guarantee | Event rows, worker credential hashes |
| Worker (Phase 3+ real, synthetic this phase) -> GET /ws upgrade | Authorization header credential is the only trust signal | Bearer credential token |
| Bootstrap-secret holder (CEO, Phase 6+) -> /admin/workers | Coarse single-tier access control, acceptable this phase | X-Bootstrap-Secret header, issued worker tokens |
| Any HTTP caller -> every mutating route | Rate-limited by IP/key, never trusted to self-limit | HTTP requests |
| Public internet -> test.pixelfirm.dev | First Phase 2 surface reachable outside localhost/CI | All of the above, over real network |
| Coolify build process -> Docker image layers | Secrets must never be captured in a layer | BOOTSTRAP_SECRET, CREDENTIAL_PEPPER, DATABASE_URL |
| npm registry -> workspace install | Third-party code executed at build/test/runtime | fastify, drizzle-orm, pg, drizzle-kit, @fastify/websocket, ws, @fastify/rate-limit, @playwright/test |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering | apps/api/src/routes/events.ts | high | mitigate | `events.id` primary key + `.onConflictDoNothing({ target: events.id })` — duplicate event.id never creates a second row. Verified: `events.test.ts` (02-01-SUMMARY D1/D2) | closed |
| T-02-02 | Tampering, Repudiation | apps/api/db/schema.ts + drizzle/0001_append_only_trigger.sql | high | mitigate | `BEFORE UPDATE OR DELETE` Postgres trigger `reject_event_mutation()` raises an exception regardless of caller. Verified: `append-only.test.ts` (02-01-SUMMARY D3); confirmed present in `apps/api/src/routes/events.ts` insert path | closed |
| T-02-03 | Information Disclosure | apps/api/src/routes/events.ts | low | mitigate | Dedup-conflict warn log includes only `eventId`/`eventType`, never `payload`. Verified by source read: `apps/api/src/routes/events.ts:40-48` | closed |
| T-02-SC-01 | Tampering | pnpm install of fastify/drizzle-orm/drizzle-kit/pg | high | mitigate | RESEARCH.md Package Legitimacy Audit — all OK verdict, no [SUS]/[SLOP] | closed |
| T-02-04 | Elevation of Privilege | apps/api/src/routes/ws.ts | high | mitigate | Credential is `randomBytes(32)` (128+ bits); uniform-401 removes enumeration shortcut. Verified: `credentials.test.ts` (02-02-SUMMARY D1) | closed |
| T-02-05 | Information Disclosure | apps/api/src/auth/credentials.ts | high | mitigate | `crypto.timingSafeEqual` on length-normalized buffers, never `===`. Verified by source read: `apps/api/src/auth/credentials.ts`; `credentials.test.ts` (02-02-SUMMARY D1) | closed |
| T-02-06 | Information Disclosure, Spoofing | apps/api/src/routes/ws.ts | high | mitigate | Unknown-workerId, wrong-secret, revoked all return byte-identical 401; dummy verifyCredential call keeps timing uniform. Verified: `ws-auth.test.ts` (02-02-SUMMARY D2/D3) | closed |
| T-02-SC-02 | Tampering | pnpm install of @fastify/websocket, ws, @types/ws | high | mitigate | RESEARCH.md Package Legitimacy Audit — OK verdict; `ws` is transitive dep of `@fastify/websocket` itself | closed |
| T-02-07 | Information Disclosure | apps/api/src/routes/admin-workers.ts (GET /admin/workers) | high | mitigate | Explicit Drizzle column list (id/label/createdAt/revokedAt) structurally excludes secretHash. Verified: `admin-workers.test.ts` (02-03-SUMMARY D2) | closed |
| T-02-08 | Elevation of Privilege | apps/api/src/routes/admin-workers.ts (requireBootstrapSecret) | high | mitigate | `crypto.timingSafeEqual` length-normalized comparison, same primitive as verifyCredential. Verified: `admin-workers.test.ts` (02-03-SUMMARY D4) | closed |
| T-02-09 | Elevation of Privilege | apps/api/src/routes/* | high | mitigate | No exec-shaped endpoint exists — verified by automated grep audit `child_process\|eval\(\|new Function\(` over apps/api/src (02-03-SUMMARY D6); re-confirmed this audit, zero matches | closed |
| T-02-10 | Spoofing | apps/api/src/server.ts (no CORS plugin) | high | mitigate | No cross-origin plugin registered anywhere — verified by grep audit `@fastify/cors` (02-03-SUMMARY D6); re-confirmed this audit, zero matches | closed |
| T-02-SC-03 | Tampering | pnpm install of @fastify/rate-limit | high | mitigate | RESEARCH.md Package Legitimacy Audit — OK verdict (official fastify org, 2.6M weekly downloads) | closed |
| T-02-11 | Tampering, Information Disclosure | Coolify application config | high | mitigate | BOOTSTRAP_SECRET/CREDENTIAL_PEPPER generated via crypto.randomBytes and set as Coolify runtime env vars before first deploy; env.ts fail-fast on missing value. Verified: 02-04-SUMMARY D3 (human_judgment, inspected this session) | closed |
| T-02-12 | Information Disclosure | apps/api/Dockerfile | high | mitigate | No DATABASE_URL/BOOTSTRAP_SECRET/CREDENTIAL_PEPPER referenced via ARG or build-time ENV. Verified by direct read of `apps/api/Dockerfile` this audit — no ARG/ENV secrets present, `.dockerignore` excludes `.env*` | closed |
| T-02-SC-04 | Tampering | root install of @playwright/test | high | mitigate | Blocking human-verify checkpoint (02-04-PLAN Task 2) — approved before install, per 02-04-SUMMARY Task 2 | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-19 | 16 | 16 | 0 | /gsd-secure-phase (L1 grep-depth, ASVS level 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-19

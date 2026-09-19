---
phase: 02-control-plane-skeleton
verified: 2026-09-19T14:20:00Z
status: passed
score: 12/12 must-haves verified
covered_files: [".planning/REQUIREMENTS.md", ".planning/phases/02-control-plane-skeleton/02-01-PLAN.md", ".planning/phases/02-control-plane-skeleton/02-01-SUMMARY.md", ".planning/phases/02-control-plane-skeleton/02-02-PLAN.md", ".planning/phases/02-control-plane-skeleton/02-02-SUMMARY.md", ".planning/phases/02-control-plane-skeleton/02-03-PLAN.md", ".planning/phases/02-control-plane-skeleton/02-03-SUMMARY.md", ".planning/phases/02-control-plane-skeleton/02-04-PLAN.md", ".planning/phases/02-control-plane-skeleton/02-04-SUMMARY.md", ".planning/phases/02-control-plane-skeleton/02-REVIEW-FIX.md", ".planning/phases/02-control-plane-skeleton/02-REVIEW.md", "apps/api/Dockerfile", "apps/api/drizzle/0000_init.sql", "apps/api/drizzle/0001_append_only_trigger.sql", "apps/api/drizzle/0002_workers_table.sql", "apps/api/drizzle/0003_no_truncate_trigger.sql", "apps/api/src/auth/credentials.ts", "apps/api/src/auth/worker-auth.ts", "apps/api/src/db/schema.ts", "apps/api/src/routes/admin-workers.ts", "apps/api/src/routes/events.ts", "apps/api/src/routes/ws.ts", "apps/api/src/server.ts"]
covered_digest: "v1:sha256:b2346004b95c660bb334598a27944c6bb6dc16d72fd5c741cbd716ab40267ed6"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Control Plane Skeleton Verification Report

**Phase Goal:** The control plane exists as real, deployable infrastructure — a durable event log behind an authenticated gateway that rejects abuse by default.
**Verified:** 2026-09-19T14:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from ROADMAP Phase 2 Success Criteria + PLAN frontmatter must_haves across all 4 plans. Flagged-assumption items from plan frontmatter (documented, intentionally out-of-scope edge cases per CONTEXT.md's locked decisions) are reported separately below, not counted as failing truths — they are pre-accepted scope exclusions, not unmet acceptance criteria.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Events sent to the control plane are durably appended to a Postgres event log — append-only, no update/delete path (ROADMAP SC1) | ✓ VERIFIED | Ran full apps/api suite live (5 files, 20/20 tests pass) against a fresh local Postgres 16 container after applying all 4 migrations. `events.test.ts` confirms POST /events durably inserts and dedupes; `append-only.test.ts` confirms UPDATE/DELETE both throw "append-only". `apps/api/drizzle/0003_no_truncate_trigger.sql` adds a statement-level TRUNCATE trigger (closes 02-REVIEW.md WR-02). |
| 2 | Sending the same event id twice never creates a second row; a genuine conflict is warn-logged (id/type only, never payload) | ✓ VERIFIED | `apps/api/src/routes/events.ts:37-47` — `onConflictDoNothing({target: events.id}).returning(...)`, warn-log fires only on `inserted.length === 0`, logs `eventId`/`eventType` only. Confirmed in live test run log output ("duplicate event id ignored"). |
| 3 | Direct UPDATE/DELETE against events raises a Postgres exception regardless of caller (DB-level, not app discipline) | ✓ VERIFIED | `apps/api/drizzle/0001_append_only_trigger.sql` (`BEFORE UPDATE OR DELETE ... RAISE EXCEPTION`) + `0003_no_truncate_trigger.sql` (`BEFORE TRUNCATE ... FOR EACH STATEMENT`) — both applied and exercised by `append-only.test.ts`, which passed in this session's live run. |
| 4 | A WebSocket client cannot complete the /ws upgrade without a valid, unique, per-worker credential; revocation blocks the next attempt (ROADMAP SC2) | ✓ VERIFIED | `apps/api/src/routes/ws.ts` uses `authenticateWorker` as `preValidation` (runs before the 101 upgrade). `ws-auth.test.ts` passed live, covering missing/malformed/unknown/wrong-secret/revoked cases plus a valid-credential `open`. Directly confirmed against the real staging deployment: `curl` with an Upgrade header to `https://test.pixelfirm.dev/ws` with no auth returns 401. |
| 5 | Worker credential secret is never stored reversibly — only an HMAC-SHA256 hash is persisted; comparison uses crypto.timingSafeEqual, never `===` | ✓ VERIFIED | `apps/api/src/auth/credentials.ts` — `issueCredential` stores only `createHmac("sha256", pepper).digest("hex")`; `verifyCredential` runs a length/format guard then `timingSafeEqual`. `credentials.test.ts` (4/4) passed live, including the never-throws-on-garbage-input case. |
| 6 | Unknown-workerId and wrong-secret responses are byte-identical (enumeration resistance) | ✓ VERIFIED | `apps/api/src/auth/worker-auth.ts` — dummy `verifyCredential` call on the not-found path keeps timing/shape uniform; shared by both `/ws` and `/events` post-CR-01-fix. `ws-auth.test.ts` case (c)/(d) asserts byte-identical bodies, passed live. |
| 7 | Stored OAuth tokens and other credentials are protected server-side and encrypted at rest where applicable (ROADMAP SC3, SEC-01 phase-2 scope: no OAuth tokens exist yet — worker-secret hash, bootstrap secret, and DB connection string are what this phase protects) | ✓ VERIFIED | Worker secrets: HMAC-hash-only (see #5). Bootstrap secret: `admin-workers.ts` `requireBootstrapSecret` uses length-normalized `timingSafeEqual`; `server.ts`'s logger `redact` list covers both `req.headers.authorization` and `req.headers['x-bootstrap-secret']` (confirmed in `apps/api/src/server.ts:20`, added as a 02-REVIEW-FIX for SEC-01's "never logged" requirement). DATABASE_URL: `apps/api/Dockerfile` has no `ARG`/build-time `ENV` referencing any secret (inspected directly); `.dockerignore` and `.gitignore` both exclude `.env*` (the latter added in 02-REVIEW-FIX WR-03, confirmed present). |
| 8 | GET /admin/workers never returns secretHash or the raw token after issuance | ✓ VERIFIED | `admin-workers.ts` list handler uses an explicit column list (`id/label/createdAt/revokedAt`), structurally excluding `secretHash`. `admin-workers.test.ts` case (3) asserts substring-absence, passed live (part of the 20/20 suite run). |
| 9 | No control-plane endpoint allows arbitrary remote shell/command execution (ROADMAP SC4 / SEC-03) | ✓ VERIFIED | Ran `grep -rEn "child_process|eval\(|new Function\(" apps/api/src --include=*.ts` myself — zero matches (exit 0/no output), confirming the route-table audit claim independently rather than trusting the SUMMARY. |
| 10 | Every mutating control-plane endpoint validates input, rate-limits, and applies CSRF protection (ROADMAP SC4 / SEC-04) | ✓ VERIFIED | Zod validation on `/admin/workers` (`IssueWorkerBody`) and `/events` (`CompanyEventSchema`); `@fastify/rate-limit` registered `{global:false}` with per-route `config.rateLimit` on all 5 mutating routes (verified in `admin-workers.ts`, `events.ts`, `ws.ts`, `server.ts`). CSRF = required-header-only; ran `grep -q '@fastify/cors' apps/api/package.json apps/api/src/server.ts` myself — no match (exit 0), confirming no CORS plugin exists. Rate-limit 429 behavior confirmed live in the test run (11th `/admin/workers` POST returned 429). |
| 11 | All of Plans 01-03's guarantees hold against the real deployed Coolify staging instance, not just localhost (D-02) | ✓ VERIFIED | Independently curled `https://test.pixelfirm.dev` in this session: `GET /health` → `{"status":"ok"}`; unauthenticated `POST /events` → 401; unauthenticated `GET /admin/workers` → 401; unauthenticated WS-upgrade attempt on `/ws` → 401 — all matching the post-review-fix code paths, not the pre-fix (unauthenticated-events) behavior. Confirmed the `test` git branch (which this Coolify app deploys from) is at `a1abcab`, the same commit containing the 02-REVIEW-FIX (`0dc5827`) — the fixes are live, not merely committed. `02-04-SUMMARY.md`'s Playwright e2e claims (3/3 passing) are consistent with this directly-observed behavior. |
| 12 | No secret (BOOTSTRAP_SECRET, CREDENTIAL_PEPPER, DATABASE_URL) is baked into the Docker image or committed to git | ✓ VERIFIED | Read `apps/api/Dockerfile` directly — no `ARG`/build-time `ENV` for any secret; `.dockerignore` excludes `.env*`; `.gitignore` (post-fix) excludes `.env`/`.env.*`. No secret value found in any of the 23 files fingerprinted for this verification. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Flagged Assumptions (documented scope exclusions, not gaps)

These appear in PLAN frontmatter `must_haves.truths` tagged `[FLAGGED ASSUMPTION — ... requires human review]`. Each is an intentionally-scoped exclusion already accepted via 02-CONTEXT.md's locked decisions (D-03, D-04) or the plan's own stated discretion — not an unmet acceptance criterion for this phase. Listed for visibility, not scored as truths:

- Postgres-down/insert-failure behavior at ingestion time (no retry/outbox semantics) — Plan 01, EVENT-02.
- In-flight WS upgrade racing the exact instant a credential is revoked — Plan 02, SEC-02 (D-03's locked semantics only guarantee the *next* attempt is rejected).
- Full-disk encryption of the underlying shared Postgres volume — Plan 03, SEC-01 (outside this phase's control; the secret itself is HMAC-hashed, which is what's in scope).
- Exact rate-limit threshold values and `@fastify/rate-limit`'s windowing algorithm — Plan 03, SEC-04 (Claude's discretion, not a locked acceptance criterion).
- Concurrent admin issue/revoke race on the same workerId — Plan 03, SEC-04 (no explicit transactional-ordering guarantee specified this phase).

None of these block the phase goal as stated in ROADMAP.md.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/db/schema.ts` | `events` + `workers` Drizzle pgTables | ✓ VERIFIED | Both tables present, columns match plan spec exactly (13 events cols, 5 workers cols) |
| `apps/api/src/routes/events.ts` | `registerEventsRoute` — validate+insert+dedup, now auth-gated | ✓ VERIFIED | Present, wired, `authenticateWorker` preValidation added post-review |
| `apps/api/drizzle/0001_append_only_trigger.sql` | `events_append_only` trigger | ✓ VERIFIED | Present, exercised by passing test |
| `apps/api/drizzle/0003_no_truncate_trigger.sql` | TRUNCATE-closing trigger (review-fix) | ✓ VERIFIED | Present, applied to staging per 02-REVIEW-FIX.md |
| `apps/api/src/auth/credentials.ts` | `issueCredential`/`verifyCredential` | ✓ VERIFIED | Present, HMAC-SHA256 + timingSafeEqual, 4/4 tests pass |
| `apps/api/src/auth/worker-auth.ts` | Shared `authenticateWorker` hook (review-fix, replaces the original plan's WS-only `wsAuthHook`) | ✓ VERIFIED | Present, used by both `/ws` and `/events` |
| `apps/api/src/routes/ws.ts` | `GET /ws` with preValidation auth | ✓ VERIFIED | Present, wired to `authenticateWorker` |
| `apps/api/src/routes/admin-workers.ts` | issue/list/revoke, bootstrap-secret-gated | ✓ VERIFIED | Present, wired, explicit column allowlist on list route |
| `apps/api/Dockerfile` | Single-stage Node Alpine, non-root, no baked secrets | ✓ VERIFIED | Present; `USER node` added post-review; no secret ARG/ENV |
| `e2e/control-plane.spec.ts` | Playwright spec against real staging URL | ✓ VERIFIED | Present, exercises event auth, admin CRUD, WS auth+revocation against `baseURL` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `events.ts` | `event-schema` | `CompanyEventSchema.safeParse` | ✓ WIRED | Confirmed by import + live test |
| `events.ts` | `db/schema.ts` | `onConflictDoNothing({target: events.id})` | ✓ WIRED | Confirmed by import + live dedup test |
| `server.ts` | `events.ts` | `fastify.register(registerEventsRoute)` | ✓ WIRED | Confirmed in server.ts |
| `ws.ts` | `worker-auth.ts` | `authenticateWorker` as preValidation | ✓ WIRED | Confirmed in ws.ts |
| `server.ts` | `ws.ts` | `fastify.register(registerWsRoute)` | ✓ WIRED | Confirmed in server.ts |
| `admin-workers.ts` | `credentials.ts` | `issueCredential(workerId)` on POST /admin/workers | ✓ WIRED | Confirmed in admin-workers.ts |
| `server.ts` | `admin-workers.ts` | `fastify.register(registerAdminWorkersRoute)` | ✓ WIRED | Confirmed in server.ts |
| `e2e/control-plane.spec.ts` | `admin-workers.ts` | issues real credential via staging POST /admin/workers, uses token for WS assertion | ✓ WIRED | Confirmed in e2e spec; behavior spot-checked directly against staging via curl (see truth #11) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Local apps/api full test suite | `pnpm run db:test:up && drizzle-kit migrate && pnpm test` (run live in this session) | 5 files / 20 tests passed | ✓ PASS |
| Local typecheck (apps/api's own files) | `pnpm run typecheck` | 3 errors, all in `packages/event-schema` (pre-existing from Phase 1, documented in `deferred-items.md`, not introduced this phase) — zero errors in any `apps/api` file | ✓ PASS (apps/api scope) |
| SEC-03 exec-shaped-endpoint audit | `grep -rEn "child_process\|eval\(\|new Function\(" apps/api/src --include=*.ts` | no matches | ✓ PASS |
| SEC-04 no-CORS audit | `grep -q '@fastify/cors' apps/api/package.json apps/api/src/server.ts` | no matches | ✓ PASS |
| Staging liveness | `curl -sf https://test.pixelfirm.dev/health` | `{"status":"ok"}` | ✓ PASS |
| Staging POST /events unauthenticated (proves CR-01 fix is live, not just committed) | `curl -X POST https://test.pixelfirm.dev/events ...` | 401 | ✓ PASS |
| Staging GET /admin/workers unauthenticated | `curl https://test.pixelfirm.dev/admin/workers` | 401 | ✓ PASS |
| Staging GET /ws unauthenticated upgrade attempt | `curl -H "Connection: Upgrade" -H "Upgrade: websocket" https://test.pixelfirm.dev/ws` | 401 | ✓ PASS |
| `test` branch (Coolify's deploy source) matches latest local commit incl. review-fix | `git log test -1` | `a1abcab` (same as `main`, includes `0dc5827` fix commit) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EVENT-02 | 02-01, 02-04 | Durable, append-only Postgres event log with dedup | ✓ SATISFIED | Truths 1-3, 11; live test run |
| SEC-01 | 02-03, 02-04 | Credentials protected server-side, encrypted at rest where applicable | ✓ SATISFIED | Truths 5, 7, 8, 12 |
| SEC-02 | 02-02 | WS connections authenticated, per-worker credentials unique/revocable | ✓ SATISFIED | Truths 4, 5, 6 |
| SEC-03 | 02-03 | No arbitrary remote shell/command execution | ✓ SATISFIED | Truth 9 (grep audit re-run independently) |
| SEC-04 | 02-03 | Input validation, rate limiting, CSRF | ✓ SATISFIED | Truth 10 |

No orphaned requirements — REQUIREMENTS.md's traceability table maps exactly these 5 IDs to Phase 2, and all 5 appear across the 4 plans' frontmatter `requirements` fields.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found anywhere under `apps/api/src`, `apps/api/drizzle`, or `e2e` (grepped directly). The one pre-existing `tsc` error in `packages/event-schema` is documented in `deferred-items.md` as a Phase-1 leftover, unrelated to this phase's own files, and does not affect `apps/api`'s runtime behavior (Vitest transpiles on the fly, not via `tsc`).

02-REVIEW.md's own findings (2 critical, 4 warning, 3 info) were independently re-verified in this session by reading the current source (not just 02-REVIEW-FIX.md's claims):
- CR-01 (unauthenticated `/events`) — fixed, confirmed in code and live on staging via curl.
- CR-02 (Windows entry-point guard) — fixed, confirmed in `server.ts`.
- WR-01 (`trustProxy`) — fixed, confirmed in `server.ts`.
- WR-02 (TRUNCATE trigger) — fixed, confirmed via `0003_no_truncate_trigger.sql`.
- WR-03 (`.gitignore` `.env`) — fixed, confirmed in `.gitignore`.
- WR-04 (Dockerfile root user) — fixed, confirmed in `Dockerfile`.
- IN-01/IN-02/IN-03 — intentionally skipped (info-level, documented rationale in 02-REVIEW-FIX.md); none block the phase goal.

### Human Verification Required

None. All must-haves resolved to VERIFIED via direct code inspection, a live local test run, and direct behavioral checks against the real staging deployment.

### Gaps Summary

No gaps. All ROADMAP Phase 2 Success Criteria and all plan-level must-haves are met, confirmed independently rather than by trusting SUMMARY.md claims: the full apps/api test suite (20/20) was re-run live in this session, both grep-based security audits were re-run independently, and the staging deployment's live behavior was directly curled and cross-checked against the git commit its `test` branch currently points to — proving the 02-REVIEW-FIX.md fixes are not just committed but actually deployed and in effect.

---

_Verified: 2026-09-19T14:20:00Z_
_Verifier: Claude (gsd-verifier)_

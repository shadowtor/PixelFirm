---
phase: "03"
slug: "worker-git-adapter-gsd-adapter"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-20"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| worker credential -> POST /events / GET /ws | Same Phase 2 boundary, reused unchanged: an authenticated-but-untrusted worker process crosses into the control plane | worker credential, heartbeat/observation events |
| worker.heartbeat payload -> connection-status registry | A worker-controlled JSON payload could claim to be a different workerId than its credential authenticated as | claimed worker identity |
| user-supplied --repo/WORKER_REPO_PATH -> git-adapter's execa calls | The repo path is local, user-controlled input, validated as a real worktree before use | local filesystem path |
| git-adapter -> local git/PowerShell subprocess | Every function shells out to a real OS subprocess | git plumbing commands, process listing |
| pointed-at repo's `.planning/` files -> gsd-adapter's parser | Local filesystem content the worker's operator controls, still parsed data | STATE.md frontmatter, phase-dir file presence |
| worker process's local OS environment (env vars, argv, filesystem) -> the events it emits | The worker is the only component with filesystem access to the pointed-at repo | env vars, git state, GSD workflow state |
| worker -> control plane (POST /events, GET /ws) | Same Phase 2 authenticated boundary, reused unchanged | structural git/GSD observation events |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Spoofing | apps/api/src/routes/events.ts | high | mitigate | `recordHeartbeat` keyed by authenticated `request.workerId` (set by worker-auth.ts's preValidation), never by client-controlled `event.payload` — verified at `apps/api/src/routes/events.ts:66` | closed |
| T-03-02 | Information Disclosure | apps/api/src/routes/admin-workers.ts | low | accept | New `status` field exposed only behind the existing bootstrap-secret gate, same trust level as rest of endpoint | closed |
| T-03-03 | Denial of Service | worker.heartbeat ingestion | low | accept | Reuses existing POST /events rate limit (300/min, Phase 2) — no new unlimited endpoint | closed |
| T-03-04 | Spoofing | apps/api/src/routes/ws.ts (Phase 2 gap, inherited) | medium | accept | A revoked worker credential's already-open socket is not force-closed — no UI drives revocation until Phase 6's CEO dashboard exists; documented, not fixed this phase | closed |
| T-03-05 | Tampering | packages/git-adapter/src/{commit,worktree,process-liveness}.ts | high | mitigate | Every execa call passes subcommand args as an array literal, never a shell-interpolated string — verified by source inspection (no template-literal command strings), confirmed by code review with zero findings on this file class | closed |
| T-03-06 | Tampering | packages/git-adapter (whole package) | high | mitigate | `no-mutating-git.test.ts` static source-scan proves no mutating git subcommand call site exists; part of the passing 8/8 git-adapter test suite | closed |
| T-03-SC (git-adapter) | Tampering | npm install of `execa` | high | mitigate | Package Legitimacy Audit completed in 03-RESEARCH.md — `execa@^10.0.1` verdict OK (152.7M weekly downloads, github.com/sindresorhus/execa); dependency confirmed present in `packages/git-adapter/package.json` | closed |
| T-03-07 | Tampering | packages/gsd-adapter/src/role-mapping.ts | medium | mitigate | Explicit final fallback resolves `unknown`/`unknown` for any unmatched combination — prevents a malformed/adversarial STATE.md from asserting a false pipeline stage/role; verified by 03-03's 12-test role-mapping suite including an explicit `approval`-never-returned assertion, cross-checked by phase verifier | closed |
| T-03-08 | Denial of Service | packages/gsd-adapter/src/phase-files.ts | low | accept | A pathological phases directory could slow one poll tick; the 2.5s poll interval tolerates a slow tick without cascading failure — no explicit mitigation needed at MVP scale | closed |
| T-03-SC (gsd-adapter) | Tampering | npm install of `gray-matter` | high | mitigate | Package Legitimacy Audit completed in 03-RESEARCH.md — `gray-matter@^4.0.3` verdict OK (8.6M weekly downloads, github.com/jonschlinkert/gray-matter); dependency confirmed present in `packages/gsd-adapter/package.json` | closed |
| T-03-09 | Tampering | apps/worker/src/env.ts | high | mitigate | Resolved --repo/WORKER_REPO_PATH validated via git-adapter's `isGitWorktree` (real `git rev-parse --is-inside-work-tree` check) before the worker proceeds to any other operation — verified at `apps/worker/src/env.ts:50-53` | closed |
| T-03-10 | Information Disclosure | apps/worker/src/env.ts | high | mitigate | `WORKER_TOKEN` read only from `process.env`, never accepted as a CLI arg (argv is visible to other processes via OS process-listing, env is not, verified on Windows this session) — verified at `apps/worker/src/env.ts:14` and `EnvSchema` | closed |
| T-03-11 | Information Disclosure | apps/worker/src/event-emitter.ts, poll-loop.ts | medium | mitigate | Emitted payloads carry only structural metadata (repoPath/branch/worktreePath/headSha/sessionId) — never raw file contents, diffs, or env var values; verified at `apps/worker/src/poll-loop.ts:72-79` | closed |
| T-03-12 | Tampering | apps/worker/src/poll-loop.ts | medium | mitigate | No fabricated "owning agent" identity is ever emitted — `sessionId` is always the real observed worktree path (`record.path`), never a synthetic placeholder; verified at `apps/worker/src/poll-loop.ts:79` | closed |
| T-03-SC (worker) | Tampering | npm install of `ws` | high | mitigate | Package Legitimacy Audit completed in 03-RESEARCH.md — `ws@^8.21.3` verdict OK (245.4M weekly downloads, github.com/websockets/ws), already proven server-side in Phase 2's own test suite; dependency confirmed present in `apps/worker/package.json` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-02 | `status` field sits behind the same bootstrap-secret gate as the rest of `/admin/workers` — no new trust boundary introduced | Plan 03-01 (planning-time) | 2026-09-20 |
| AR-03-02 | T-03-03 | `worker.heartbeat` reuses Phase 2's existing per-route rate limit — no new unbounded endpoint | Plan 03-01 (planning-time) | 2026-09-20 |
| AR-03-03 | T-03-04 | Force-closing a revoked worker's open socket needs Phase 6's CEO dashboard UI to drive revocation; inherited Phase 2 gap, not introduced or worsened this phase | Plan 03-01 (planning-time) | 2026-09-20 |
| AR-03-04 | T-03-08 | Poll interval (2.5s) tolerates a slow tick from a pathological phases directory without cascading failure; MVP scale doesn't warrant a guard | Plan 03-03 (planning-time) | 2026-09-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-20 | 15 | 15 | 0 | gsd-execute-phase orchestrator (grep-depth L1 classification, short-circuited per ASVS-1 rule — all mitigate-disposition threats confirmed by direct source inspection; all accept-disposition threats already documented at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-20

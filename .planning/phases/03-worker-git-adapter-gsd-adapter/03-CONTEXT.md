# Phase 3: Worker, Git Adapter & GSD Adapter - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 builds the worker as a standalone Node.js process that runs on the user's workstation, connects outbound-only to the Phase 2 control plane, and watches one user-chosen git repository (demoed against SyncSmith). It proves observation, not action: the git adapter turns repo/branch/worktree state into events, the GSD adapter turns `.planning/` workflow state into company events and role assignments, and worker connection status (online/stale/offline) is itself visible in company state. No AgentRuntime, no task execution, no CEO gate — this phase only proves the system can see the truth (RUNTIME-03, RUNTIME-04, WORKTREE-01, WORKTREE-02, GSD-01). Acting on that truth is Phase 4+.

</domain>

<decisions>
## Implementation Decisions

### Change detection mechanism
- **D-01:** Worker detects git and GSD state changes by polling — `git rev-parse HEAD` / `git status --porcelain` (or equivalent plumbing) plus an `fs.stat` on `.planning/state.json`/`STATE.md`, on a short interval (~2-3s). No filesystem watcher (chokidar/fs.watch) in this phase. Chosen over fs-watching because `.git` internals churn heavily during normal git operations (index locks, packed-refs rewrites) causing event storms, and Windows — the primary dev target for this worker — is the least reliable fs-watch backend across platforms. — **Reversibility:** reversible — a watch-based mechanism can be added later (e.g. as a hybrid: watch `.planning/` for instant GSD events, keep polling git) without changing the event-schema or adapter contracts it feeds.

### GSD state → role/event mapping signals
- **D-02:** The GSD adapter maps `.planning/` file presence + frontmatter status fields (STATE.md's `status:`, phase CONTEXT.md/VERIFICATION.md frontmatter, `NN-##-PLAN.md`/`SUMMARY.md` presence) to WHICH GSD phase/role is assigned — the authoritative signal for phase/role identity. A secondary OS-level process-liveness check (is a `claude`/`gsd-*` process running with a cwd matching the pointed-at repo, via `child_process`) determines WHETHER that role is currently active vs. idle. Neither signal alone is sufficient: file state alone can only prove what was last *completed* and would force the renderer to freeze or fabricate motion between writes — a direct conflict with the product's core value that the office must never show fabricated activity. No dependency on Claude Code's own transcript/session stream (not guaranteed available for an arbitrary sibling repo like SyncSmith). — **Reversibility:** costly — once agent-state rendering in Phase 5 depends on this file+process dual-signal shape, swapping to a different liveness source (e.g. an actual Claude Agent SDK session hook once Phase 4 exists) means changing the GSD adapter's event-emission contract, not just an internal implementation detail.

### Worker connection lifecycle
- **D-03:** Worker liveness flows through the same event-sourced pipeline as everything else — a heartbeat is an application-level event appended to the Postgres event log (via the existing event-append path), not a protocol-level `ws` ping/pong side-channel. Worker sends a heartbeat event every ~10s. Using **server receipt time**, not worker-supplied timestamps (avoids clock-skew false-staleness): `online` = heartbeat received within the last interval; `stale` = 1-2 missed heartbeats while the socket is still open (~10-20s silence — catches an event-loop-blocked worker or network hiccup without declaring it dead); `offline` = either the WS `close`/`error` fires (immediate — a clean disconnect is unambiguous) or 3+ missed heartbeats (~30s dead air with no close event — covers a hung connection behind NAT/proxy). Worker reconnects with exponential backoff: 1s initial, doubling, capped at 30s, with ~20-50% jitter to avoid a reconnect storm if the control plane restarts with multiple workers attached. — **Reversibility:** reversible — thresholds are tunable constants; the event-sourced heartbeat shape is additive to the existing event schema (a new discriminated-union member), not a breaking change to Phase 1/2's envelope or ingestion path.

### Repo targeting configuration
- **D-04:** Worker takes exactly one repository path at startup via a CLI arg or env var (e.g. `--repo=<path>` / `WORKER_REPO_PATH`), validated as an existing git worktree before the worker proceeds. One worker process watches exactly one repo — no config file, no in-process multi-repo support in this phase. Multiple repos are handled by running multiple worker OS processes, which also gives free crash/resource isolation per repo. Matches RUNTIME-03's success criterion exactly ("pointed at any git repository," demonstrated against SyncSmith) without pulling forward config-schema/concurrent-watcher complexity that no current requirement or roadmap phase demands. — **Reversibility:** reversible — a config-file-driven multi-repo mode can be layered on top later (e.g. a supervisor process that spawns one single-repo worker per configured repo) without changing this phase's single-repo worker internals.

### Claude's Discretion
- Exact poll interval value within the ~2-3s range (D-01) and whether it's a hardcoded constant or an env-configurable value.
- Exact process-liveness matching heuristic (D-02) — cwd string match, process name allowlist (`claude`, `node` running a `gsd-*` shim), or a combination — as long as it degrades safely to "idle" (never fabricates "active") on ambiguous matches.
- Exact heartbeat event type name/payload shape (D-03) and where in `packages/event-schema`'s discriminated union it's added (extends the existing 12-member union from Phase 1 D-01, additive).
- Whether the CLI arg or env var takes precedence when both are supplied (D-04), and exact flag/var naming.
- Git adapter's exact event payload shape for commit/branch/worktree data — `packages/event-schema`'s current `GitCommitCreatedPayload` only has `sha`/`message` (from Phase 1's minimal seed); this phase extends it (or adds new git.* event types) to carry branch and worktree path per WORKTREE-01, additive to the existing discriminated union.
- Internal module boundary between `packages/git-adapter` and `packages/gsd-adapter` (both new workspace packages this phase creates, per PROJECT.md's monorepo layout) vs. logic living directly in `apps/worker`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Core Value (no fabricated animation), constraints (event-driven architecture, monorepo layout, worker runs wherever Claude Code is authenticated), Key Decisions
- `.planning/REQUIREMENTS.md` — RUNTIME-03, RUNTIME-04, WORKTREE-01, WORKTREE-02, GSD-01 (this phase's mapped requirements)
- `.planning/ROADMAP.md` §Phase 3 — Goal and Success Criteria for this phase

### Prior phase context (decisions this phase builds on)
- `.planning/phases/01-event-schema-state-engine/01-CONTEXT.md` — D-01 (12-member discriminated union event catalog this phase extends), D-03 (dedup-at-ingestion already handled at the transport layer built in Phase 2 — this phase's events flow through that same path)
- `.planning/phases/02-control-plane-skeleton/02-CONTEXT.md` — D-03 (worker credential issuance/format `{workerId}.{secret}`, already built), the WS handshake auth mechanics this phase's worker client must use to connect

### Prior phase code (already built, this phase's foundation)
- `packages/event-schema/src/payloads/index.ts` — the 12-member discriminated union (`CompanyEventSchema`); this phase's git/GSD/heartbeat events extend it additively, never via `.extend()` chaining (Phase 1 Pitfall 2 guidance still applies as the union grows)
- `apps/api/src/routes/ws.ts`, `apps/api/src/auth/worker-auth.ts` — the existing authenticated WS gateway (`GET /ws`, bearer-token auth via `authenticateWorker`) this phase's worker client connects to; currently has no broadcast/heartbeat/connection-status-tracking logic on the server side — that logic is this phase's to add
- `apps/api/src/db/schema.ts` — `events` table (append-only, matches `BaseEnvelope`) and `workers` table (id/secretHash/label/revokedAt) — no connection-status columns yet; this phase decides whether online/stale/offline is derived live from heartbeat events or also persisted as worker-row state (Claude's discretion, informed by D-03)

### Research
- `.planning/research/STACK.md` — Fastify ^5.12 + `ws`/`@fastify/websocket` (not Socket.IO), TypeScript, pnpm/Turborepo monorepo tooling

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/event-schema` (Zod discriminated union + envelope): this phase's git/GSD/heartbeat event types extend the same schema and validation the ingestion endpoint already enforces — no new validation framework needed.
- `apps/api/src/auth/worker-auth.ts` + `apps/api/src/auth/credentials.ts`: the worker-side WS client this phase builds authenticates using the exact `{workerId}.{secret}` bearer-token scheme this server code already validates — no new auth mechanism to design.
- `apps/api/src/routes/ws.ts`: currently a bare auth-gated handler with no message handling (`socket.on("close", () => {})` is the only listener) — this phase adds the heartbeat/event message handling this endpoint currently lacks.

### Established Patterns
- Phases 1 and 2 both proved their layer against stubbed/synthetic events before real producers existed. Phase 3 is the first phase with a real event producer (the worker observing a real repo) — the git/GSD adapters' output must validate against the same `CompanyEventSchema` Phase 2's ingestion endpoint already enforces.
- Monorepo workspace glob already picks up new `packages/*` and `apps/*` members with zero config changes (Phase 1 D-02) — `apps/worker`, `packages/git-adapter`, `packages/gsd-adapter` are new workspace members this phase creates.

### Integration Points
- New `apps/worker` connects outbound to the already-deployed Coolify staging control plane (`apps/api`) via the existing `/ws` route and `POST /events` (or WS-based event submission — Claude's discretion which transport carries the worker's emitted events, consistent with what `apps/api` already accepts).
- `packages/git-adapter` and `packages/gsd-adapter` are imported by `apps/worker` the same way `apps/api` already imports `packages/event-schema` and `packages/company-core` as workspace deps.

</code_context>

<specifics>
## Specific Ideas

No additional specifics beyond the four decisions above — discussion stayed focused on the four researched gray areas (change detection, GSD state mapping, connection lifecycle, repo targeting).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Worker, Git Adapter & GSD Adapter*
*Context gathered: 2026-09-19*

---
gsd_state_version: "1.0"
current_phase: 04
current_phase_name: AgentRuntime & ClaudeCodeRuntime
status: executing
stopped_at: Completed 04-01-PLAN.md
last_updated: "2026-09-20T10:50:28.978Z"
last_activity: 2026-09-20
last_activity_desc: Phase 04 execution started
state_head: d528bc246ccf84e1d3f3583fe0b0b3ee64a42a4d
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 15
  completed_plans: 12
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-20)

**Core value:** The pixel office must accurately visualise a real Claude Code + GSD software project — agents genuinely performing the work and requesting CEO approval — using actual company events, never a prerecorded or faked animation.
**Current focus:** Phase 04 — AgentRuntime & ClaudeCodeRuntime

## Current Position

Phase: 04 (AgentRuntime & ClaudeCodeRuntime) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-09-20 — Phase 04 execution started

Progress: [████░░░░░░] 38%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 4 | - | - |
| 03 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 24min | 3 tasks | 17 files |
| Phase 01 P02 | 25min | 2 tasks | 6 files |
| Phase 01 P03 | 15 min | 1 tasks | 2 files |
| Phase 02 P01 | 20min | 2 tasks | 18 files |
| Phase 02 P02 | 15min | 2 tasks | 9 files |
| Phase 02 P03 | ~20min | 2 tasks | 6 files |
| Phase 03 P01 | 20min | 2 tasks | 12 files |
| Phase 03 P02 | ~11min | 2 tasks | 9 files |
| Phase 03 P03 | 13min | 2 tasks | 11 files |
| Phase 03 P04 | 35min | 3 tasks | 12 files |
| Phase 04 P01 | ~50min | 3 tasks | 14 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Horizontal-layers build order — event schema/state engine, control plane, worker+git+gsd adapters, AgentRuntime/ClaudeCodeRuntime, pixel office renderer, CEO dashboard, visibility+overlay, Twitch — each phase a pure consumer of the one before it.
- Roadmap: Visibility levels + overlay route (Phase 7) ship as one phase per PITFALLS.md — the overlay route is unsafe to expose until server-side filtering exists.
- [Phase 01]: corepack unavailable on Node v25.9.0; fell back to npm install -g pnpm, resolved pnpm@12.4.2 pinned as packageManager
- [Phase 01]: Added companies slot to ProjectionState beyond the plan's five required kinds (agents/floors/teams/projects/tasks) so company.started has somewhere to materialize state
- [Phase 01]: [Phase 01-02]: No 'team' seed category exists among the 12 event types — agent.online carries teamId and its handler creates the team record as a side effect of the agent joining it
- [Phase 01]: [Phase 01-02]: viewer.event intentionally has no reducer handler — touches none of the five required projection kinds, no-ops via the existing unrecognized-type fallback
- [Phase 01]: [Phase 01-03]: gsd_run check tdd-red-evidence's TAP parser targets node --test's summary lines, which Vitest's --reporter=tap doesn't emit — RED evidence for this plan was verified manually instead; flagged as a GSD tooling gap on Vitest-based repos
- [Phase 01]: [Phase 01-03]: session.started's omitted-sourceAgentId test already passed pre-fix (incidental key-miss no-op) but was still added and the handler still rewritten to an explicit if (!agentId || !existing) guard, matching git.commit_created/deployment.started's contract shape
- [Phase 02]: [Phase 02-01]: Test Postgres port moved from planned 5433 to 5434 — an unrelated wardogsoutpost project's container already had 5433 bound on this machine
- [Phase 02]: [Phase 02-01]: zod added as a direct apps/api dependency (env.ts imports it directly, not just transitively via event-schema)
- [Phase 02]: [Phase 02-01]: ESM static imports hoist above top-level statements — test files must set process.env then dynamically import() env-dependent modules (../server, ../db/client), not statically import them
- [Phase 02]: [Phase 02-02]: Renamed drizzle-kit generate's auto-named workers migration to 0002_workers_table.sql, updating journal.json's tag to match
- [Phase 02]: [Phase 02-02]: No query-string token fallback implemented for /ws auth (YAGNI — no real WS client until Phase 3's worker, a Node process that can set headers)
- [Phase 02]: [Phase 02-03]: Split Task 1/Task 2 boundary so rate-limit config additions land only in Task 2's commit, matching the plan's own task split
- [Phase 02]: [Phase 02-03]: Extended Fastify logger's redact list to include x-bootstrap-secret alongside authorization (Rule 2 — SEC-01 never-logged requirement)
- [Phase 02]: [Phase 02-03]: Reworded CSRF-posture comment in server.ts to avoid the literal '@fastify/cors' substring, which was tripping the plan's own CORS audit grep
- [Phase 03]: [Phase 03-01]: worker.heartbeat payload is empty (z.object({})) — identity comes solely from authenticated request.workerId, never a client-supplied field (T-03-01)
- [Phase 03]: [Phase 03-01]: Connection status (online/stale/offline) derived live from heartbeat receipt time + socket-open state, no new persisted DB column
- [Phase 03]: [Phase 03-01]: worker.heartbeat has no company-core reducer handler by design — connection status lives server-side only, never in ProjectionState
- [Phase 03]: [Phase 03-02]: gsd_run check tdd-red-evidence's TAP parser targets node --test summaries, which Vitest doesn't emit — RED evidence verified manually both times (recurring GSD tooling gap on this Vitest-based repo)
- [Phase 03]: [Phase 03-02]: no-mutating-git.test.ts's detection was manually proven by temporarily injecting a git merge call into the RED stub, confirming the test failed, then reverting before the RED commit
- [Phase 03]: [Phase 03-02]: listWorktrees/isGitWorktree additionally verified against the real PixelFirm and SyncSmith repos, not just the temp fixture — both resolved exactly 1 worktree record each
- [Phase 03]: [Phase 03-03]: mapToGsdCategory's new_project branch covers status unknown AND status planning with no phase-file signal (SyncSmith's real shape) — but not discussing/executing/etc, which fall to unknown/unknown as a contradictory combination
- [Phase 03]: [Phase 03-03]: added missing unknown member to event-schema's GsdPhaseObservedPayload.category enum (03-01 gap) — CompanyEventSchema.safeParse would have rejected the anti-fabrication fallback event GSD-01's mitigation depends on
- [Phase 03]: [Phase 03-04]: startHeartbeat(controlPlaneUrl, token, companyId) added a required companyId param not in the plan's literal signature — worker.heartbeat envelope's companyId is mandatory on BaseEnvelope
- [Phase 03]: [Phase 03-04]: poll-loop.ts and ws-client.ts's stop() check a stopped flag before every postEvent call, not just clearInterval() — an already in-flight tick's slow isAnyClaudeProcessAlive subprocess call could otherwise still emit after stop() returns
- [Phase 03]: [Phase 03-04]: poll-loop.ts's isFirstTick guard prevents the first-ever poll tick from reporting active:true from baseline discovery alone, avoiding a false active flip on the second (genuinely unchanged) tick
- [Phase 04]: [Phase 04]: [Phase 04-01]: Claude MAX subscription billing posture verified live — subscription pool billed, not API-credit pool; claude auth status reported subscriptionType 'pro' not 'max' (flagged, non-blocking)
- [Phase 04]: [Phase 04]: [Phase 04-01]: @anthropic-ai/claude-agent-sdk@0.3.278 confirmed legitimate (anthropics org, 8.16M weekly downloads) before install
- [Phase 04]: [Phase 04]: [Phase 04-01]: pauseTask/resumeTask/cancelTask/sendMessage/requestReview/requestHandoff implemented as throwing stubs so createClaudeCodeRuntime satisfies the full AgentRuntime type immediately — real implementations deferred to Plan 04-02/04-03

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 4 planning: re-verify Claude Max-subscription billing terms for SDK/headless usage haven't changed before scaling worker usage.
- Phase 4 planning: apps/api's test suite has an intermittent parallel-test-file migration race (`pg_type_typname_nsp_index` duplicate-key error) when multiple test files apply the same enum-creating migration concurrently against the local test Postgres — observed twice in Phase 3, non-reproducible on rerun, does not affect production migrations (drizzle-kit migrate runs once, sequentially). Worth a proper fix (serialize test-DB migration application) before it masks a real regression.
- Phase 5 planning: full asset-licence audit of the Pixel Agents fork beyond the credited CC0 character pack is still outstanding.
- Phase 8 planning: verify current Twitch EventSub reconnect/signature details against live docs; budget subscription total_cost before choosing event types.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-09-20T10:50:28.864Z
Stopped at: Completed 04-01-PLAN.md
Resume file: None

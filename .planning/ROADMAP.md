# Roadmap: PixelFirm

## Overview

PixelFirm builds strictly bottom-up: the event schema and state engine come first (proven against stubbed events, before any real infrastructure exists), then the control plane that gives that schema a durable home, then a worker that observes a real repository's real git and GSD state, then the AgentRuntime abstraction that lets Claude Code actually act, then the pixel office renderer that turns real projections into a real-looking company, then the CEO approval gate that puts a human between the company and anything risky, then the visibility/overlay layer that makes the company safely streamable, and finally Twitch integration that lets a live audience nudge the office without ever touching development tooling directly. Each phase is a pure consumer of the phase before it — nothing downstream ever becomes a second source of truth.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Event Schema & State Engine** - Typed event schema and Company State Engine proven against stubbed events, with replay (completed 2026-09-18)
- [x] **Phase 2: Control Plane Skeleton** - Durable Postgres event log behind an authenticated WS gateway with a security baseline (completed 2026-09-19)
- [x] **Phase 3: Worker, Git Adapter & GSD Adapter** - Worker observes a real repository's real git/GSD state and emits real events (completed 2026-09-20)
- [x] **Phase 4: AgentRuntime & ClaudeCodeRuntime** - Generic runtime abstraction with Claude Code as the first real implementation (completed 2026-09-21)
- [ ] **Phase 5: Pixel Office Renderer** - Forked Pixel Agents office renders real state, never a fabricated animation
- [ ] **Phase 6: CEO Dashboard & Approval Workflow** - Human approval gate that nothing sensitive can bypass
- [ ] **Phase 7: Stream-Safe Visibility & Overlay Route** - Server-side visibility filtering plus the public OBS overlay route
- [ ] **Phase 8: Twitch EventSub Integration** - Real viewer activity safely drives real office reactions

## Phase Details

### Phase 1: Event Schema & State Engine

**Goal**: A typed event schema and Company State Engine exist and correctly produce/rebuild projections from a stream of events, before any real infrastructure depends on them.
**Depends on**: Nothing (first phase)
**Requirements**: EVENT-01, EVENT-03, EVENT-04
**Success Criteria** (what must be TRUE):

  1. Every event type (company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer) validates against a single typed schema carrying event ID, timestamp, company/floor/project/task, source/destination agent, payload, and visibility level — malformed events are rejected.
  2. Feeding a sequence of stubbed events into the state engine produces correct materialized projections (agent/floor/team/project/task state) that are read-only to downstream consumers.
  3. Replaying the same event sequence from the start reproduces identical projections, proving state can be rebuilt without manual patching.

**Plans:** 3/3 plans complete

Plans:

- [x] 01-03-PLAN.md

**Wave 1**

- [x] 01-01-PLAN.md — Bootstrap monorepo workspace + tracer: one event type validated, reduced, and proven replay-deterministic

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Expand to all 12 seeded event categories with full projection coverage and replay-determinism at scale

### Phase 2: Control Plane Skeleton

**Goal**: The control plane exists as real, deployable infrastructure — a durable event log behind an authenticated gateway that rejects abuse by default.
**Depends on**: Phase 1
**Requirements**: EVENT-02, SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):

  1. Events sent to the control plane are durably appended to a Postgres event log ingesting from Claude Code/Git/CI/GSD sources — append-only, with no update/delete path.
  2. A WebSocket client cannot connect without valid, unique, per-worker credentials, and those credentials can be revoked.
  3. Stored OAuth tokens and other credentials are protected server-side and encrypted at rest.
  4. No control-plane endpoint allows arbitrary remote shell/command execution, and endpoints validate input, rate-limit requests, and apply CSRF protection.

**Plans:** 4/4 plans complete

Plans:

- [x] 02-01-PLAN.md — Tracer: apps/api scaffold + durable, deduped POST /events end-to-end (EVENT-02, D-04)
- [x] 02-02-PLAN.md — Authenticated WS gateway + credential hash/verify primitives (SEC-02, D-03)
- [x] 02-03-PLAN.md — Admin credential routes + rate limiting + CSRF header posture (SEC-01, SEC-03, SEC-04)
- [x] 02-04-PLAN.md — Coolify staging deployment + Playwright e2e verification (D-01, D-02)

**Wave 1**

- [x] 02-01-PLAN.md — Tracer: durable, deduped event ingestion end-to-end

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Authenticated WS gateway + credential primitives

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Admin credential routes + rate limiting + CSRF posture

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-04-PLAN.md — Coolify staging deployment + Playwright e2e verification

### Phase 3: Worker, Git Adapter & GSD Adapter

**Goal**: A worker observes a real, user-chosen git repository's real GSD workflow state and turns it into company events — proving the system can see the truth before it can act on it.
**Depends on**: Phase 2
**Requirements**: RUNTIME-03, RUNTIME-04, WORKTREE-01, WORKTREE-02, GSD-01
**Success Criteria** (what must be TRUE):

  1. The worker connects outbound-only to the control plane and can be pointed at any git repository the user chooses (demonstrated against SyncSmith), not hardcoded to one project.
  2. Worker online/offline/stale connection status is visible in company state as the worker starts, disconnects, and reconnects.
  3. For each active task the system records the real repository, branch, worktree path, and owning agent/session, and never automatically merges a worktree's branch.
  4. The GSD adapter observes SyncSmith's real GSD workflow state (new project/research/requirements/planning/execution/verification/review/approval/deployment) and maps it onto company events and role assignments, preferring observed state over guessed state.

**Plans:** 4/4 plans complete

Plans:

- [x] 03-01-PLAN.md — Tracer: worker.heartbeat flows through POST /events, control plane derives live online/stale/offline status (RUNTIME-04)
- [x] 03-02-PLAN.md — git-adapter: worktree/commit observation + process-liveness + read-only guarantee (WORKTREE-01, WORKTREE-02)
- [x] 03-03-PLAN.md — gsd-adapter: STATE.md/phase-file observation + role mapping (GSD-01)
- [x] 03-04-PLAN.md — apps/worker: full poll-diff loop wiring both adapters + live SyncSmith demo (RUNTIME-03, RUNTIME-04, WORKTREE-01, GSD-01)

**Wave 1**

- [x] 03-01-PLAN.md — Tracer: worker.heartbeat flows through POST /events, control plane derives live online/stale/offline status

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — git-adapter: worktree/commit observation + process-liveness + read-only guarantee
- [x] 03-03-PLAN.md — gsd-adapter: STATE.md/phase-file observation + role mapping

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — apps/worker: full poll-diff loop wiring both adapters + live SyncSmith demo

### Phase 4: AgentRuntime & ClaudeCodeRuntime

**Goal**: Agents can actually be driven through a runtime abstraction, with Claude Code as the first real implementation, running on Claude MAX subscription auth alone.
**Depends on**: Phase 3
**Requirements**: RUNTIME-01, RUNTIME-02
**Success Criteria** (what must be TRUE):

  1. An AgentRuntime interface (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff) exists and is callable independent of any specific coding-agent implementation.
  2. ClaudeCodeRuntime starts, pauses, resumes, and cancels a real Claude Code task using Claude MAX subscription auth, with no ANTHROPIC_API_KEY required.

**Plans:** 4/4 plans complete

Plans:

- [x] 04-01-PLAN.md — Tracer: verify Claude MAX billing posture + package legitimacy, scaffold orchestration-adapter + claude-adapter, wire startTask/getStatus to a real task.status_changed event (RUNTIME-01, RUNTIME-02)
- [x] 04-02-PLAN.md — pauseTask/resumeTask/sendMessage via session capture + cancelTask graceful-then-hard-kill + watchdog (D-03, D-04)
- [x] 04-03-PLAN.md — requestReview/requestHandoff signal detection, reusing gsd-adapter (D-08)
- [x] 04-04-PLAN.md — Real SyncSmith demo: disposable worktree, live GSD task, evidence, cleanup (D-05, D-06, D-07)

**Wave 1**

- [x] 04-01-PLAN.md — Tracer: scaffold AgentRuntime/ClaudeCodeRuntime, real startTask/getStatus end-to-end

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — pauseTask/resumeTask/sendMessage/cancelTask + watchdog

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md — requestReview/requestHandoff signal detection

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-04-PLAN.md — Real SyncSmith demo + cleanup

### Phase 5: Pixel Office Renderer

**Goal**: The forked Pixel Agents office renders real company state on screen as a pure consumer of projections — never a fabricated animation.
**Depends on**: Phase 4
**Requirements**: OFFICE-01, OFFICE-02, OFFICE-03, HANDOFF-01, HANDOFF-02
**Success Criteria** (what must be TRUE):

  1. Agents are visible on screen on one floor, with sprites/animations matching their real current state (offline/idle/planning/researching/coding/reading/testing/reviewing/discussing/deploying/blocked/waiting_for_agent/waiting_for_ceo/failed/completed).
  2. A blocked or waiting-for-input agent is visually distinguishable at a glance from an active agent.
  3. When one agent hands off work to another, the office shows the first agent walking over, a task icon appearing, and the second agent accepting it and moving to work — using deterministic, template-based dialogue, never LLM-generated at render time.
  4. Pixel Agents attribution and licence notices remain visible and preserved in the fork.

**Plans:** 14/16 plans executed (gaps found a third time — 4 further gap-closure plans added 2026-09-22 per third --gaps re-plan)

Plans:

- [x] 05-01-PLAN.md — Tracer: AgentStatus contract + browser Broadcast Hub (auth/snapshot/relay) + forked Canvas2D engine + apps/web, one real agent's status end-to-end
- [x] 05-02-PLAN.md — Exhaustive 15-value AgentStatus visual mapping + blocked/waiting signal (OFFICE-01/03) + asset-licence audit + in-app attribution (OFFICE-02)
- [x] 05-03-PLAN.md — agent.handoff_completed/fromAgentId schema + agentId threading through ClaudeCodeRuntime + real per-agent AgentStatus derivation
- [x] 05-04-PLAN.md — Handoff choreography FSM (walk-to-desk, findPath) + deterministic dialogue templates (HANDOFF-01/02)
- [x] 05-05-PLAN.md — Gap closure: wire-path integrity fixes (CR-01/CR-02/WR-01/WR-02) + REQUIREMENTS.md doc-sync
- [x] 05-06-PLAN.md — Gap closure: real MetroCity sprite pixel data (closes invisible-sprite gap)
- [x] 05-07-PLAN.md — Gap closure: bubble/badge overlay render pass + 3 missing icon assets
- [x] 05-08-PLAN.md — Gap closure: live end-to-end proof (real dev servers + Playwright canvas sampling)
- [x] 05-09-PLAN.md — Gap closure 2: live Character path in apps/web via company-core reduce (CR-01) + wired attribution test (OFFICE-02)
- [x] 05-10-PLAN.md — Gap closure 2: owner-bound glyph placement + desk headroom (CR-02) + per-agent identity pixels (WR-08) + IN-04/IN-06
- [x] 05-11-PLAN.md — Gap closure 2: role-vs-agent-id at the producer (CR-04) + buffered browser-socket registration (CR-03) + WR-01 accepted threat *(not autonomous — opens with a `checkpoint:decision` on D-04 scope impact)*
- [x] 05-12-PLAN.md — Gap closure 2: honest live proof (no reload, no pre-seed) + licence-audit/footer claim correction (WR-09)
- [x] 05-13-PLAN.md — Gap closure 3: handoff dialogue draw pass (owner-bound, glyphs on top) + title/name caps + FSM clears dialogue and ignores re-delivered requests (gap 1, CR-01 advisory)
- [x] 05-14-PLAN.md — Gap closure 3: desk reclamation on despawn + collision-avoiding identity hue + corrected deferral record and unowned HANDOFF-01 trigger pointer (gaps 2, 3, advisory 4)
- [ ] 05-15-PLAN.md — Gap closure 3: per-invocation ownership token in ClaudeCodeRuntime.runQuery (gap 4, review CR-02)
- [ ] 05-16-PLAN.md — Gap closure 3: live-canvas TRUTH 5 for handoff dialogue + UI-SPEC dialogue contract (gap 1 pixel evidence)

**Wave 1**

- [x] 05-01-PLAN.md — Tracer: browser Broadcast Hub + forked engine + apps/web, one real agent renders end-to-end

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — Exhaustive status-mapping fidelity + licensing/attribution
- [x] 05-03-PLAN.md — Event-schema handoff additions + real per-agent status derivation

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-04-PLAN.md — Handoff choreography + dialogue templates

**Wave 4** *(gap closure — parallel, no file overlap)*

- [x] 05-05-PLAN.md — Wire-path integrity fixes (CR-01/CR-02/WR-01/WR-02) + REQUIREMENTS.md doc-sync
- [x] 05-06-PLAN.md — Real MetroCity sprite pixel data
- [x] 05-07-PLAN.md — Bubble/badge overlay render pass + 3 missing icon assets

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 05-08-PLAN.md — Live end-to-end proof (real dev servers + Playwright canvas sampling)

**Wave 6** *(second gap-closure round — parallel, no file overlap)*

- [x] 05-09-PLAN.md — Live Character path in apps/web (CR-01) + wired attribution test
- [x] 05-10-PLAN.md — Owner-bound glyph placement + desk headroom (CR-02) + per-agent identity pixels (WR-08)
- [x] 05-11-PLAN.md — Role-vs-agent-id at the producer (CR-04) + buffered socket registration (CR-03)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 05-12-PLAN.md — Honest live proof + licence-audit/footer claim correction

**Wave 8** *(third gap-closure round — no file overlap; sequential on main since use_worktrees=false)*

- [x] 05-13-PLAN.md — Handoff dialogue draw pass + caps + FSM idempotence
- [ ] 05-14-PLAN.md — Desk reclamation + identity hue + deferral record
- [ ] 05-15-PLAN.md — runQuery ownership token

**Wave 9** *(blocked on 05-13 and 05-14)*

- [ ] 05-16-PLAN.md — Live TRUTH 5 (dialogue pixels) + UI-SPEC contract

**UI hint**: yes

### Phase 6: CEO Dashboard & Approval Workflow

**Goal**: Every decision that needs a human is visibly routed to the CEO, and nothing sensitive ever proceeds without an explicit human decision.
**Depends on**: Phase 5
**Requirements**: CEO-01, CEO-02, CEO-03, CEO-04, CEO-05
**Success Criteria** (what must be TRUE):

  1. An agent requiring human input walks to a CEO office location and enters a visible waiting state.
  2. The CEO dashboard lists every pending decision with title, context, the requesting agent's recommendation, and relevant links/diffs.
  3. The CEO can Approve, Reject, Discuss, Request Changes, or Request More Research on any pending decision, and the choice actually controls the AgentRuntime, not just the on-screen animation.
  4. No CEO-gated operation (deploy, destructive op, production change, major dependency change, security/pricing/architecture/legal decision) is ever auto-approved because an agent requested it, and every approval/rejection is recorded in an audit log.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Stream-Safe Visibility & Overlay Route

**Goal**: Company data is classified and filtered by visibility level before it leaves the server, so a public overlay can exist without ever leaking private data.
**Depends on**: Phase 6
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04
**Success Criteria** (what must be TRUE):

  1. Every event and field carries a visibility level (PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC), defaulting to PRIVATE for anything derived from prompts, source code, env vars, terminal output, secrets, configuration, or private repo content.
  2. A public-facing connection never receives PRIVATE/INTERNAL data — filtering happens server-side at the data layer, never by relying on the client to hide fields it already received.
  3. `/stream/company/:companyId` renders a controls-free, 1920x1080, transparent-where-practical page showing only STREAM_SAFE/PUBLIC data, suitable for OBS Browser Source.
  4. Tokens/credentials used by the public stream route are scoped to STREAM_SAFE data only and never appear in URLs, logs, or client-visible history.

**Plans**: TBD
**UI hint**: yes

### Phase 8: Twitch EventSub Integration

**Goal**: Real activity on the user's live Twitch channel safely drives real, harmless reactions in the office, through the same event pipeline as everything else.
**Depends on**: Phase 7
**Requirements**: TWITCH-01, TWITCH-02, TWITCH-03, TWITCH-04
**Success Criteria** (what must be TRUE):

  1. The Twitch EventSub WebSocket connection correctly handles session-welcome/keepalive/reconnect and verifies signatures against the untouched raw request body.
  2. Real Twitch events (message, follow, subscription, gifted sub, cheer/bits, raid, channel point redemption) are normalized into a shared ViewerEvent schema.
  3. At least one ViewerEvent type triggers a rate-limited, deterministic office reaction (e.g. coffee delivery, lights, celebration animation).
  4. Chat content is sanitized before rendering, and no viewer event can directly execute commands or reach development tooling without explicit CEO approval.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Event Schema & State Engine | 3/3 | Complete    | 2026-09-18 |
| 2. Control Plane Skeleton | 4/4 | Complete    | 2026-09-19 |
| 3. Worker, Git Adapter & GSD Adapter | 4/4 | Complete    | 2026-09-20 |
| 4. AgentRuntime & ClaudeCodeRuntime | 4/4 | Complete    | 2026-09-21 |
| 5. Pixel Office Renderer | 14/16 | In Progress|  |
| 6. CEO Dashboard & Approval Workflow | 0/TBD | Not started | - |
| 7. Stream-Safe Visibility & Overlay Route | 0/TBD | Not started | - |
| 8. Twitch EventSub Integration | 0/TBD | Not started | - |

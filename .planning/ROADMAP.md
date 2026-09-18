# Roadmap: PixelFirm

## Overview

PixelFirm builds strictly bottom-up: the event schema and state engine come first (proven against stubbed events, before any real infrastructure exists), then the control plane that gives that schema a durable home, then a worker that observes a real repository's real git and GSD state, then the AgentRuntime abstraction that lets Claude Code actually act, then the pixel office renderer that turns real projections into a real-looking company, then the CEO approval gate that puts a human between the company and anything risky, then the visibility/overlay layer that makes the company safely streamable, and finally Twitch integration that lets a live audience nudge the office without ever touching development tooling directly. Each phase is a pure consumer of the phase before it — nothing downstream ever becomes a second source of truth.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Event Schema & State Engine** - Typed event schema and Company State Engine proven against stubbed events, with replay (completed 2026-09-18)
- [ ] **Phase 2: Control Plane Skeleton** - Durable Postgres event log behind an authenticated WS gateway with a security baseline
- [ ] **Phase 3: Worker, Git Adapter & GSD Adapter** - Worker observes a real repository's real git/GSD state and emits real events
- [ ] **Phase 4: AgentRuntime & ClaudeCodeRuntime** - Generic runtime abstraction with Claude Code as the first real implementation
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

**Plans:** 3/4 plans executed

Plans:

- [x] 02-01-PLAN.md — Tracer: apps/api scaffold + durable, deduped POST /events end-to-end (EVENT-02, D-04)
- [x] 02-02-PLAN.md — Authenticated WS gateway + credential hash/verify primitives (SEC-02, D-03)
- [x] 02-03-PLAN.md — Admin credential routes + rate limiting + CSRF header posture (SEC-01, SEC-03, SEC-04)
- [ ] 02-04-PLAN.md — Coolify staging deployment + Playwright e2e verification (D-01, D-02)

**Wave 1**

- [x] 02-01-PLAN.md — Tracer: durable, deduped event ingestion end-to-end

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Authenticated WS gateway + credential primitives

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-03-PLAN.md — Admin credential routes + rate limiting + CSRF posture

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 02-04-PLAN.md — Coolify staging deployment + Playwright e2e verification

### Phase 3: Worker, Git Adapter & GSD Adapter

**Goal**: A worker observes a real, user-chosen git repository's real GSD workflow state and turns it into company events — proving the system can see the truth before it can act on it.
**Depends on**: Phase 2
**Requirements**: RUNTIME-03, RUNTIME-04, WORKTREE-01, WORKTREE-02, GSD-01
**Success Criteria** (what must be TRUE):

  1. The worker connects outbound-only to the control plane and can be pointed at any git repository the user chooses (demonstrated against SyncSmith), not hardcoded to one project.
  2. Worker online/offline/stale connection status is visible in company state as the worker starts, disconnects, and reconnects.
  3. For each active task the system records the real repository, branch, worktree path, and owning agent/session, and never automatically merges a worktree's branch.
  4. The GSD adapter observes SyncSmith's real GSD workflow state (new project/research/requirements/planning/execution/verification/review/approval/deployment) and maps it onto company events and role assignments, preferring observed state over guessed state.

**Plans**: TBD

### Phase 4: AgentRuntime & ClaudeCodeRuntime

**Goal**: Agents can actually be driven through a runtime abstraction, with Claude Code as the first real implementation, running on Claude MAX subscription auth alone.
**Depends on**: Phase 3
**Requirements**: RUNTIME-01, RUNTIME-02
**Success Criteria** (what must be TRUE):

  1. An AgentRuntime interface (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff) exists and is callable independent of any specific coding-agent implementation.
  2. ClaudeCodeRuntime starts, pauses, resumes, and cancels a real Claude Code task using Claude MAX subscription auth, with no ANTHROPIC_API_KEY required.

**Plans**: TBD

### Phase 5: Pixel Office Renderer

**Goal**: The forked Pixel Agents office renders real company state on screen as a pure consumer of projections — never a fabricated animation.
**Depends on**: Phase 4
**Requirements**: OFFICE-01, OFFICE-02, OFFICE-03, HANDOFF-01, HANDOFF-02
**Success Criteria** (what must be TRUE):

  1. Agents are visible on screen on one floor, with sprites/animations matching their real current state (offline/idle/planning/researching/coding/reading/testing/reviewing/discussing/deploying/blocked/waiting_for_agent/waiting_for_ceo/failed/completed).
  2. A blocked or waiting-for-input agent is visually distinguishable at a glance from an active agent.
  3. When one agent hands off work to another, the office shows the first agent walking over, a task icon appearing, and the second agent accepting it and moving to work — using deterministic, template-based dialogue, never LLM-generated at render time.
  4. Pixel Agents attribution and licence notices remain visible and preserved in the fork.

**Plans**: TBD
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
| 2. Control Plane Skeleton | 3/4 | In Progress|  |
| 3. Worker, Git Adapter & GSD Adapter | 0/TBD | Not started | - |
| 4. AgentRuntime & ClaudeCodeRuntime | 0/TBD | Not started | - |
| 5. Pixel Office Renderer | 0/TBD | Not started | - |
| 6. CEO Dashboard & Approval Workflow | 0/TBD | Not started | - |
| 7. Stream-Safe Visibility & Overlay Route | 0/TBD | Not started | - |
| 8. Twitch EventSub Integration | 0/TBD | Not started | - |

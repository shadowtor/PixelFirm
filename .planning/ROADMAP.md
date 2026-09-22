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
  5. The office floor is furnished — MetroCity floor and wall tiles, desks with monitors grouped in pods with walking lanes — agents sit at desk seats and never walk through furniture or another seated agent.

**Plans:** 31/35 plans executed (UAT round 2 2026-09-22 diagnosed 6 polish gaps G-05-P1..P6 — 5 gap-closure plans 05-31..05-35 added)

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
- [x] 05-15-PLAN.md — Gap closure 3: per-invocation ownership token in ClaudeCodeRuntime.runQuery (gap 4, review CR-02)
- [x] 05-16-PLAN.md — Gap closure 3: live-canvas TRUTH 5 for handoff dialogue + UI-SPEC dialogue contract (gap 1 pixel evidence)
- [x] 05-17-PLAN.md — Gap closure 4: handoff robustness — status updates never stop a walk, every record exit retires its lines, real-loop tests + positive accepted-line live assertion (gap 1 / WR-02, WR-10)
- [x] 05-18-PLAN.md — Gap closure 4: runQuery claims its token before the preemption await; pause/cancel claim a fresh token (gap 2 / CR-01)
- [x] 05-19-PLAN.md — Gap closure 5: arrival = not walking, single rest-pose writer that never interrupts WALK, at-target walk (review CR-01 paths a/b/c, IN-03) + one record per sender, sender identity, icon across glyph-less statuses (WR-01/WR-03/WR-02)
- [x] 05-20-PLAN.md — Gap closure 6: stored status glyph (statusBubble) + single display writer applyBubble (frozen glyph > task icon while waiting > status glyph), restored on completion/retire (review CR-01) + sender identity in every phase incl. ICON_VISIBLE and completion (WR-01)
- [x] 05-21-PLAN.md — UAT gap closure: minimum integer display scale (>= 3x) via engine zoom, pixelated, live scale truth (G-05-1a)
- [x] 05-22-PLAN.md — UAT gap closure: MetroCity Interior sheets committed + reproducible decode to office-metrocity.json + ASSET-LICENSES provenance/credit and link-2 outfit-layer upgrade (G-05-1e)
- [x] 05-23-PLAN.md — UAT gap closure: frozen-state glyphs re-authored with closed black outline + contrast/shape guard tests (G-05-2)
- [x] 05-24-PLAN.md — UAT gap closure: furnished office render — layout file, MetroCity floor/wall/desks/monitors/decor z-sorted with characters, sprite cache (G-05-1e)
- [x] 05-25-PLAN.md — UAT gap closure: seat model — agents take layout desk seats, standing overflow, rebased seat tests, seated offset only at own desk (G-05-1e)
- [x] 05-26-PLAN.md — UAT gap closure: live harness rebased on layout/office data + furnished and frame-rate truths, floor-texture glyph contrast, UI-SPEC/ROADMAP/footer credit sync (G-05-1e, G-05-2)
- [x] 05-27-PLAN.md — UAT gap closure: handoff interaction tile on the receiver's seat row + occupancy/furniture-aware walks, sender faces receiver, live sender-visible check (G-05-1d, G-05-1e)
- [x] 05-28-PLAN.md — UAT gap closure: compact tailed speech bubble under the speaker spanning sender to receiver, floor-clamped, layout-data guard, live TRUTH 5 (G-05-4, G-05-1b)
- [x] 05-29-PLAN.md — UAT gap closure: short deterministic handoff templates + caps, UI-SPEC typography/colour/copy (G-05-1b)
- [x] 05-30-PLAN.md — UAT gap closure: status glyphs anchored 1 px above the owner's visible head, on the floor, live TRUTH 4 (G-05-1c)
- [x] 05-31-PLAN.md — UAT polish: office sized from the full viewport (1280x720 -> 4x, 1920x1080 -> 6x), WALL_COLOR surround, footer overlaid on the bottom wall, live no-black TRUTH 0 (G-05-P6)
- [ ] 05-32-PLAN.md — UAT polish: every agent resting on its own seat drawn seated, only off-seat agents stand; true-hourglass waiting glyph with 1x silhouette test (G-05-P3, G-05-P5)
- [ ] 05-33-PLAN.md — UAT polish: speech bubble picks the safest of four candidates (never over a glyph or off the floor, desks only when unavoidable), tail to the speaker, live TRUTH 5 (G-05-P1)
- [ ] 05-34-PLAN.md — UAT polish: fixed handoff interaction slots on the central aisle from layout data, no shoulder-to-shoulder, ink-separation sweep (G-05-P2)
- [ ] 05-35-PLAN.md — UAT polish: getActiveHandoffs() host read path (full title, participants, phase, bubble rect), 12-char cap kept (G-05-P4)

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
- [x] 05-14-PLAN.md — Desk reclamation + identity hue + deferral record
- [x] 05-15-PLAN.md — runQuery ownership token

**Wave 9** *(blocked on 05-13 and 05-14)*

- [x] 05-16-PLAN.md — Live TRUTH 5 (dialogue pixels) + UI-SPEC contract

**Wave 10** *(fourth gap-closure round — no file overlap; sequential on main since use_worktrees=false)*

- [x] 05-17-PLAN.md — Handoff robustness under interruption (real update loop) + accepted-line live assertion
- [x] 05-18-PLAN.md — runQuery claim-before-await + pause/cancel token

**Wave 11** *(fifth gap-closure round — blocked on 05-17)*

- [x] 05-19-PLAN.md — Handoff FSM: no stranding through any writer, one record per sender (CR-01, IN-03, WR-01/02/03)

**Wave 12** *(sixth gap-closure round — blocked on 05-19)*

- [x] 05-20-PLAN.md — Status glyph survives a handoff (CR-01) + sender identity in every phase (WR-01)

**Wave 13** *(UAT gap-closure round — parallel, no file overlap; only 05-21 runs the live harness)*

- [x] 05-21-PLAN.md — Minimum integer display scale (G-05-1a)
- [x] 05-22-PLAN.md — MetroCity Interior asset pipeline + licences (G-05-1e)

**Wave 14** *(blocked on Wave 13 — parallel, no file overlap, neither runs the live harness)*

- [x] 05-23-PLAN.md — Frozen-glyph outline and contrast (G-05-2)
- [x] 05-24-PLAN.md — Furnished office render + sprite cache (G-05-1e)

**Wave 15** *(blocked on 05-24)*

- [x] 05-25-PLAN.md — Seat model + seated offset (G-05-1e)

**Wave 16** *(blocked on 05-23 and 05-25)*

- [x] 05-26-PLAN.md — Live harness rebase + furnished truths + docs (G-05-1e, G-05-2)

**Wave 17** *(blocked on 05-26)*

- [x] 05-27-PLAN.md — Handoff interaction tile + blocked walks (G-05-1d, G-05-1e)

**Wave 18** *(blocked on 05-27)*

- [x] 05-28-PLAN.md — Attributed compact handoff bubble + layout guard (G-05-4, G-05-1b)

**Wave 19** *(blocked on 05-28)*

- [x] 05-29-PLAN.md — Short handoff templates + UI-SPEC (G-05-1b)

**Wave 20** *(blocked on 05-29)*

- [x] 05-30-PLAN.md — Head-anchored status glyphs (G-05-1c)

**Wave 21** *(UAT round 2 polish — each wave touches the live harness and UI-SPEC, so the chain is sequential)*

- [ ] 05-31-PLAN.md — Full-viewport sizing, border-colour surround, footer overlay (G-05-P6)

**Wave 22** *(blocked on 05-31)*

- [ ] 05-32-PLAN.md — Seated at own desk whatever the status + hourglass silhouette (G-05-P3, G-05-P5)

**Wave 23** *(blocked on 05-32)*

- [ ] 05-33-PLAN.md — Safe bubble placement with obstacle scoring (G-05-P1)

**Wave 24** *(blocked on 05-33)*

- [ ] 05-34-PLAN.md — Fixed aisle interaction slots (G-05-P2)

**Wave 25** *(blocked on 05-33 and 05-34)*

- [ ] 05-35-PLAN.md — Host read path for full handoff titles (G-05-P4)

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
| 5. Pixel Office Renderer | 31/35 | In Progress|  |
| 6. CEO Dashboard & Approval Workflow | 0/TBD | Not started | - |
| 7. Stream-Safe Visibility & Overlay Route | 0/TBD | Not started | - |
| 8. Twitch EventSub Integration | 0/TBD | Not started | - |

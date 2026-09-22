# Requirements: PixelFirm

**Defined:** 2026-09-18
**Core Value:** The pixel office must accurately visualise a real Claude Code + GSD software project — agents genuinely performing the work and requesting CEO approval — using actual company events, never a prerecorded or faked animation.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Event Pipeline & State

- [x] **EVENT-01**: Typed event schema exists for company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer events, each carrying event ID, timestamp, company, floor, project, task, source agent, destination agent, payload, and visibility level
- [x] **EVENT-02**: Company Event Bus ingests events from Claude Code, Git, CI, and GSD into an append-only Postgres event log
- [x] **EVENT-03**: Company State Engine builds materialized projections (agent/floor/team/project/task state) that the renderer, dashboard, and overlay read — never write to directly
- [x] **EVENT-04**: State projections can be rebuilt/replayed from the event log without manual patching, so drift is detectable and correctable

### Agent Runtime

- [x] **RUNTIME-01**: An AgentRuntime interface (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff) exists independent of any specific coding-agent implementation
- [x] **RUNTIME-02**: ClaudeCodeRuntime implements AgentRuntime using the Claude Agent SDK, authenticated via Claude MAX subscription, with no ANTHROPIC_API_KEY required
- [x] **RUNTIME-03**: A worker component runs wherever Claude Code is authenticated, connects outbound-only to the control plane, and can be pointed at any git repository the user chooses — not hardcoded to one project
- [x] **RUNTIME-04**: Worker online/offline/stale connection status is visible in company state

### Worktree Model

- [x] **WORKTREE-01**: Each active development task records its repository, branch, worktree path, and owning agent/session
- [x] **WORKTREE-02**: The system never automatically merges a worktree's branch

### Pixel Office

- [x] **OFFICE-01**: The Pixel Agents renderer is forked/extended (not rebuilt) to render one floor with agents whose sprites/animations reflect their current state (offline/idle/planning/researching/coding/reading/testing/reviewing/discussing/deploying/blocked/waiting_for_agent/waiting_for_ceo/failed/completed)
- [ ] **OFFICE-02**: Attribution and licence notices from the Pixel Agents fork are preserved
- [x] **OFFICE-03**: Blocked or waiting-for-input agents show a clear visual signal at a glance

### CEO Approval

- [ ] **CEO-01**: A CEO office exists; agents requiring human input walk there and enter a visible waiting state
- [ ] **CEO-02**: A CEO dashboard lists pending decisions with title, context, the requesting agent's recommendation, and relevant links/diffs
- [ ] **CEO-03**: The CEO can Approve, Reject, Discuss, Request Changes, or Request More Research on each pending decision
- [ ] **CEO-04**: No CEO-gated operation (deploy, destructive op, production change, major dependency change, security/pricing/architecture/legal decision) is ever auto-approved because an agent requested it
- [ ] **CEO-05**: Every CEO approval/rejection is recorded in an audit log

### Handoffs

- [x] **HANDOFF-01**: When an agent completes work destined for another agent, the pixel office shows a physical handoff: the first agent walks over, a task icon appears, the second agent accepts it and moves to work
- [ ] **HANDOFF-02**: Handoff dialogue is deterministic/template-based, never LLM-generated at render time

### GSD Adapter

- [x] **GSD-01**: A GSD adapter observes real GSD workflow state (new project, research, requirements, planning, execution, verification, review, approval, deployment) from a pointed-at repository and maps it onto company events and role assignments (PM, Research Agent, Architect, Engineering, QA, Reviewer, CEO, DevOps), preferring observed state over guessed state

### Stream Safety & Overlay

- [ ] **SAFE-01**: Every event and field is tagged with a visibility level (PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC), defaulting to PRIVATE for anything derived from prompts, source code, env vars, terminal output, secrets, configuration, or private repo content
- [ ] **SAFE-02**: Visibility filtering happens server-side before any data is sent to a stream-facing connection — never relies on the client to hide fields it already received
- [ ] **SAFE-03**: A `/stream/company/:companyId` (or `/stream/floor/:floorId`) route renders a controls-free, 1920x1080, transparent-where-practical page suitable for OBS Browser Source, showing only STREAM_SAFE/PUBLIC data
- [ ] **SAFE-04**: Tokens/credentials used by the public stream route are scoped to STREAM_SAFE data only and never appear in URLs, logs, or client-visible history

### Twitch Integration

- [ ] **TWITCH-01**: Twitch EventSub (WebSocket transport) is integrated with correct session-welcome/keepalive/reconnect handling and raw-body signature verification
- [ ] **TWITCH-02**: Twitch events (message, follow, subscription, gifted sub, cheer/bits, raid, channel point redemption) are normalized into a shared ViewerEvent schema
- [ ] **TWITCH-03**: At least one ViewerEvent type triggers a harmless, rate-limited, deterministic office animation (e.g. coffee delivery, lights, celebration)
- [ ] **TWITCH-04**: Chat content is sanitized before any rendering; viewer events never directly execute commands or reach development tooling without explicit CEO approval

### Security

- [x] **SEC-01**: OAuth tokens and other credentials are stored/protected server-side only and encrypted at rest where applicable
- [x] **SEC-02**: WebSocket connections are authenticated; per-worker credentials are unique and revocable
- [x] **SEC-03**: No endpoint allows arbitrary remote shell/command execution
- [x] **SEC-04**: Input from chat/viewer events is validated and rate-limited; CSRF protection is applied to control-plane endpoints

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Streaming

- **YOUTUBE-01**: YouTube Live chat/events are integrated (polling `liveChatMessages.list`) and normalized into the same ViewerEvent schema as Twitch, after Twitch integration is stable

### Progression

- **PROG-01**: Data-driven progression triggers (desks, rooms, decorations, break room, meeting rooms, additional floor, server room) unlock based on real events (projects completed, deployments, milestones) — trigger table is data, not hardcoded

### Orchestration

- **RUNTIME-05**: A second AgentRuntime implementation (e.g. Codex or Maestro) is added behind the existing abstraction without changing the company model

### Office

- **OFFICE-04**: A second floor is rendered when multi-project/multi-team usage actually occurs

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 3D office / 3D graphics | Product stays strictly 2D pixel-art; DeskRPG is UX reference only, never a dependency or asset source |
| Mobile apps | Web-first via browser/OBS source for MVP |
| Public SaaS multi-tenancy and billing | Personal/internal use first; architecture shouldn't preclude it later, but not built now |
| Marketplace, complex permissions system | Not needed for a single-CEO personal deployment |
| Multiple simultaneous AI providers/runtimes | ClaudeCodeRuntime only for MVP; AgentRuntime abstraction exists so others can be added later without rework |
| Automatic production merges / autonomous deployment without CEO gate | CEO approval is a hard, permanent safety boundary, not a velocity optimization target |
| Sophisticated economy / advanced RPG mechanics (currency, shops, stats-grinding) | Conflicts with "simple, data-driven, tied to real milestones" progression design |
| Custom pixel art pipeline / procedural building generation | Reuse Pixel Agents assets, generated assets, recolouring/iconography; minimal human design effort for MVP |
| Multiple visible floors simultaneously | DB/domain must support multiple floors, but MVP renders exactly one |
| Redis | Not introduced unless a demonstrated requirement emerges |
| LLM-generated agent chatter/dialogue | Breaks the Core Value (fabricated, not real); adds LLM cost/latency/moderation risk on a stream-facing feature |
| Free-text viewer chat directly driving in-world actions or code execution | Direct prompt-injection / abuse path against a system that controls real git operations |
| ANTHROPIC_API_KEY / direct API billing dependency | Must work purely on Claude Code + Claude MAX subscription auth |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EVENT-01 | Phase 1 | Complete |
| EVENT-03 | Phase 1 | Complete |
| EVENT-04 | Phase 1 | Complete |
| EVENT-02 | Phase 2 | Complete |
| SEC-01 | Phase 2 | Complete |
| SEC-02 | Phase 2 | Complete |
| SEC-03 | Phase 2 | Complete |
| SEC-04 | Phase 2 | Complete |
| RUNTIME-03 | Phase 3 | Complete |
| RUNTIME-04 | Phase 3 | Complete |
| WORKTREE-01 | Phase 3 | Complete |
| WORKTREE-02 | Phase 3 | Complete |
| GSD-01 | Phase 3 | Complete |
| RUNTIME-01 | Phase 4 | Complete |
| RUNTIME-02 | Phase 4 | Complete |
| OFFICE-01 | Phase 5 | Complete |
| OFFICE-02 | Phase 5 | Gaps Found |
| OFFICE-03 | Phase 5 | Complete |
| HANDOFF-01 | Phase 5 | Complete |
| HANDOFF-02 | Phase 5 | Gaps Found |
| CEO-01 | Phase 6 | Pending |
| CEO-02 | Phase 6 | Pending |
| CEO-03 | Phase 6 | Pending |
| CEO-04 | Phase 6 | Pending |
| CEO-05 | Phase 6 | Pending |
| SAFE-01 | Phase 7 | Pending |
| SAFE-02 | Phase 7 | Pending |
| SAFE-03 | Phase 7 | Pending |
| SAFE-04 | Phase 7 | Pending |
| TWITCH-01 | Phase 8 | Pending |
| TWITCH-02 | Phase 8 | Pending |
| TWITCH-03 | Phase 8 | Pending |
| TWITCH-04 | Phase 8 | Pending |

**Coverage:**

- v1 requirements: 33 total (corrected from an earlier miscount of 32; recount of the list above yields 33 IDs)
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-09-18*
*Last updated: 2026-09-18 after roadmap creation (8 phases, full traceability)*

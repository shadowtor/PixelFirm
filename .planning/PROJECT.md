# PixelFirm

## What This Is

PixelFirm is a self-hostable, pixel-art AI software company simulator and development orchestration interface. It visualises real Claude Code + GSD development activity — running against any of the user's git repositories, not just itself — as employees working inside a virtual pixel office. It's built for personal/internal use first (the user is the CEO of the in-universe company) but architected so it could later become a self-hosted or hosted product, and to double as engaging Twitch/YouTube stream content.

## Core Value

The pixel office must accurately visualise a real Claude Code + GSD software project — agents genuinely performing the work and requesting CEO approval — using actual company events, never a prerecorded or faked animation. If the visualisation ever drifts from real state, the product has failed at its one job.

## Requirements

### Validated

- ✓ Worker connects from wherever Claude Code is authenticated and can point at any git repository/worktree the user chooses via `--repo`/`WORKER_REPO_PATH`, not hardcoded to one project — Phase 3 (proven live against the separate SyncSmith repo; read-only git + GSD state observation, no mutation). Process/build/test execution (running Claude Code sessions, GSD commands) remains Active below — Phase 3 built observation only.
- ✓ GSD adapter mapping observed GSD workflow state onto company events, observed rather than guessed where possible — Phase 3 (explicit fallback to `unknown`/`unknown` when signals don't clearly support a category; never fabricates a pipeline stage/role)
- ✓ ClaudeCodeRuntime implementing an AgentRuntime abstraction (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff) so other orchestrators (Maestro, Codex, etc.) can be added later without changing the company model — Phase 4 (zero `@anthropic-ai/` import anywhere in `orchestration-adapter`, structurally enforced; `ClaudeCodeRuntime` drives a real Claude Code session on subscription auth alone, no `ANTHROPIC_API_KEY` fallback, verified live against a real disposable-worktree demo and real pause/cancel subprocess termination — not just unit-tested against a mock)
- ✓ Pixel Agents fork integrated as the office renderer/movement/character base (attribution and licence notices preserved) — Phase 5 (pinned fork `3537e140`, MetroCity sprites, credit-only footer, full ASSET-LICENSES audit; live proof TRUTH 0-7 on a real canvas)
- ✓ Visual, physically-represented handoffs between agents using deterministic/canned dialogue templates, not LLM-generated chatter — Phase 5 (event-driven handoff FSM + static templates with a zero-network test). The production *trigger* (multi-agent orchestration / role-to-agent registry) still has no owning roadmap phase.

### Active

- [ ] Company/event domain model: Company → Buildings → Floors → Teams → Agents → Projects, with typed event schema flowing Claude Code / Git / CI / GSD → Company Event Bus → Company State Engine → Pixel Office → Stream Overlay/Dashboard
- [ ] Worker handles Claude Code process management, GSD command execution, and builds/tests (beyond Phase 3's read-only git/GSD observation)
- [ ] Control plane (web app, API, Postgres, WebSocket/event gateway, stream overlay, auth, activity history) deployable via Docker to the user's existing Coolify server, with worker connecting to it without the control plane needing direct filesystem access to worker repos
- [ ] Persistent agent/employee model (id, name, role, title, team, floor, sprite, personality, status, current project/task/session/worktree, availability, stats, history) with pixel animation reflecting standardised agent states (offline/idle/planning/researching/coding/reading/testing/reviewing/discussing/deploying/blocked/waiting_for_agent/waiting_for_ceo/failed/completed)
- [ ] CEO office and approval workflow: agents needing human input physically walk to the CEO office and wait; CEO dashboard shows decision title, context, agent recommendation, relevant links/diffs, and Approve/Reject/Discuss/Request Changes/Request More Research actions. The system must never auto-approve a CEO-gated operation just because an agent requested it.
- [ ] Git worktree model prepared for parallel agents (repository/branch/worktree/task/session per agent) — no unsafe automated merging in MVP
- [ ] MVP end-to-end flow, demonstrated against a real GSD project (starting with SyncSmith as the first demo project, but the worker/company model must generalise to any project the user points it at): CEO creates project → PM receives it → planning → developer implements → hands off to reviewer → QA runs → CEO approves → DevOps marks deployment complete, all events real and visible in the office
- [ ] Twitch integration via EventSub (message, follow, subscription, gifted sub, cheer/bits, raid, channel point redemption) against the user's already-live channel, normalized into a ViewerEvent schema, driving at least one harmless deterministic office interaction (e.g. coffee delivery, office lights, celebration animation) — rate-limited, moderation-aware, chat sanitised before any rendering
- [ ] Stream-safe visibility levels (PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC) enforced so prompts, source code, env vars, terminal output, secrets, and file paths default to PRIVATE and never reach the public stream feed
- [ ] `/stream/company/:companyId` (or `/stream/floor/:floorId`) route suitable for OBS Browser Source, 1920x1080, controls hidden, transparent background where practical
- [ ] Multi-floor domain/database support from the start (even though MVP only visually renders one floor) — floor id/name/team/project/agent assignment, layout, unlock state
- [ ] Data-driven office progression system (desks/employees/rooms/decorations/break room/meeting rooms/additional floors/server room unlocked by triggers like projects completed, deployments, milestones) — rules data-driven, not hardcoded
- [ ] YouTube Live integration (chat, member events, Super Chat) against the user's already-live channel, normalized into the same ViewerEvent schema as Twitch — after Twitch integration is working
- [ ] Security baseline: no secrets in stream events, OAuth tokens protected server-side, encrypted-at-rest credentials, strict input validation, sanitised chat, rate limits, Twitch/YouTube signature validation, CSRF protection, secure WebSocket auth, per-worker revocable credentials, audit log for CEO approvals, no remote arbitrary shell endpoint

### Out of Scope

- 3D office / 3D graphics — product stays strictly 2D pixel-art (DeskRPG is UX reference only, never a dependency or source-copy)
- Mobile apps — web-first via browser/OBS source
- Public SaaS multi-tenancy and billing — personal/internal use first; architecture shouldn't preclude it later, but not built now
- Marketplace, complex permissions system — not needed for a single-CEO personal deployment
- Multiple simultaneous AI providers/runtimes — ClaudeCodeRuntime only for MVP; AgentRuntime abstraction exists so Maestro/Codex/OpenCode runtimes can be added later without rework
- Automatic production merges / autonomous deployment without CEO gate — every sensitive operation (deploy, destructive op, major dependency change, security/legal/pricing/architecture decision) requires explicit CEO approval, never auto-approved
- Sophisticated economy / advanced RPG mechanics — progression stays simple and data-driven, tied to real business/dev milestones
- Custom pixel art pipeline / procedural building generation — reuse Pixel Agents assets, generated assets, recolouring/iconography; minimal human design effort for MVP
- Multiple visible floors simultaneously — DB/domain must support multiple floors, but MVP renders exactly one
- Redis — not introduced unless a demonstrated requirement emerges
- ANTHROPIC_API_KEY / direct API billing dependency — must work purely on Claude Code + Claude MAX subscription auth

## Context

- This repo (PixelFirm) holds the tool's own code and backend. It does not observe itself for the MVP demo — that would be self-referential (agents building the thing rendering them).
- The first project the worker points at / visualises is `syncsmith`, a sibling repo at `F:/Sidegigs/syncsmith` already using GSD (PROJECT.md, REQUIREMENTS.md, a 7-phase ROADMAP.md, and research already committed, no phases executed yet). The worker/company model must be built so it can later be pointed at any other repo, not hardcoded to SyncSmith — SyncSmith is just the first real workflow available to dogfood against.
- The user already streams on both Twitch and YouTube with live channels — integration should target real accounts, not placeholder auth, once those phases are reached.
- A Coolify server is already running and reachable — the control plane should be built to deploy there via Docker from early on, not deferred.
- The production domain for this project is `pixelfirm.dev`.
- Primary technical/visual base to fork/extend: https://github.com/pixel-agents-hq/pixel-agents (MIT-licensed repo; graphical assets need independent licence audit before any commercial distribution — do not assume the repo licence covers every asset).
- Secondary UX reference only (concepts, not code or assets): https://github.com/dandacompany/deskrpg — has licensing that may restrict commercial use; ideas reimplemented independently.
- Orchestration pattern reference (not a dependency): research existing Maestro-style AI coding orchestration projects (isolated git worktrees, parallel Claude Code sessions, persistent agent sessions, branch ownership, review/merge workflows) for architectural patterns only.
- Initial development environment is Claude Code authenticated via Claude MAX subscription — must not require direct Anthropic API billing.
- GSD remains the primary project planning/development methodology for both PixelFirm itself and the projects it visualises — PixelFirm adapts/observes GSD state, it does not replace or reimplement it.

## Constraints

- **Architecture**: Strict separation of development execution, company/workflow state, visualisation, and viewer interaction via an event-driven architecture (Claude Code/Git/CI/GSD → Company Event Bus → Company State Engine → Pixel Office → Stream Overlay/Dashboard). The pixel office must never become the source of truth for development state.
- **Tech stack**: TypeScript across the stack where practical; Node.js, React, PostgreSQL, WebSockets, Docker, Playwright, Vitest. Monorepo layout: `apps/{web,api,stream-overlay,worker}`, `packages/{company-core,event-schema,pixel-office,claude-adapter,git-adapter,gsd-adapter,twitch-adapter,youtube-adapter,orchestration-adapter,shared-ui}`, `infra/{docker,migrations,deployment}`, `references/` (notes only).
- **Deployment**: Hybrid — control plane runs continuously on the self-hosted server (Docker/Coolify-deployable: web, API, Postgres, WS gateway, Twitch/YouTube connectors, company/project state, stream overlay, auth, activity history); worker runs wherever Claude Code is authenticated (initially the user's workstation) and connects securely to the control plane, which must never need direct filesystem access to worker repos.
- **Hardware**: No GPU required anywhere in the core app (Claude Code inference is remote). Worker target ~8 CPU cores / 16GB RAM min (32GB preferred), SSD/NVMe. Control plane target ~2-4 vCPU / 4-8GB RAM, Postgres, no GPU.
- **AI provider**: Claude Code with Claude MAX subscription auth only for MVP — no ANTHROPIC_API_KEY dependency.
- **Delivery method**: Built as a GSD project itself — research/architecture precede implementation, work proceeds phase by phase per the roadmap below, no jumping to advanced UI/product features before the core company/event architecture is proven.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork/extend Pixel Agents rather than building the office renderer from scratch | Avoid rebuilding movement/character/office systems; brief explicitly directs reuse over rebuild | ✓ Phase 5 — forked engine pinned at `3537e140`, extended with event-driven status glyphs and handoff choreography |
| SyncSmith is the first demo project, but worker/company model must generalise to any repo | User wants to point PixelFirm at multiple/any project over time, not just one fixed demo | — Pending |
| PixelFirm's own repo is not the MVP demo target (no dogfooding on itself for the demo flow) | Avoids self-referential confusion; SyncSmith already has a real GSD roadmap ready to observe | — Pending |
| Twitch integration targets real, already-live channel from the start (not placeholder auth) | User is already streaming; no need to stub auth before that phase | — Pending |
| Control plane targets the user's existing Coolify server from early phases | Infra already exists; no need to defer deployment design | — Pending |
| AgentRuntime abstraction (ClaudeCodeRuntime first) instead of hardcoding Claude Code into the company model | Brief requires future support for Maestro/Codex/OpenCode without rearchitecting | ✓ Phase 4 — interface ships with zero SDK dependency, `ClaudeCodeRuntime` is its only implementation so far |
| No automated/unsafe merging or autonomous deployment in MVP | Brief treats this as a privileged dev-control system; CEO gate is a hard safety boundary | — Pending |
| Worker observes pointed-at repos read-only via poll-diff (git-adapter/gsd-adapter), structurally guaranteed to never issue a mutating git command | Worker can safely be pointed at any of the user's real repos without risk of corrupting them — matches the "no unsafe automated merging" constraint and the control-plane's no-filesystem-access design | ✓ Phase 3 |
| `query()`'s subprocess `env` is always explicitly built (never left to default inheritance), actively stripping `ANTHROPIC_API_KEY` | The SDK inherits the full host `process.env` when `env` is omitted — a stray API key anywhere in the host shell would silently leak into the subprocess and violate the no-API-key-billing requirement with zero detection; caught by code review, not by the original implementation | ✓ Phase 4 |
| Real (non-mocked) OS-subprocess termination proof for pauseTask/cancelTask, not just mocked-SDK unit tests | The SDK's own `interrupt()` is documented as streaming-input-only and may no-op for this codebase's plain-string-prompt call shape — the actual termination guarantee (`AbortController.abort()` hard-kill) had never been observed against a real spawned process; added as permanent gated (`CLAUDE_CODE_INTEGRATION_TEST=1`) regression coverage via real `claude.exe` OS-PID snapshotting | ✓ Phase 4 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-23 after Phase 5*

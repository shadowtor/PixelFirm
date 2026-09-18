# Architecture Research

**Domain:** Event-driven AI dev-orchestration + real-time pixel-art visualization (control-plane/worker split, stream overlay)
**Researched:** 2026-09-18
**Confidence:** MEDIUM (industry-standard patterns cross-checked across multiple independent sources; no single source is authoritative-official for this exact combination, so treat structural shape as high-confidence and specific tool/library choices as your own judgment call)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  WORKER (runs where Claude Code is authenticated — user's workstation)   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                │
│  │ ClaudeCode     │  │ GitAdapter     │  │ GsdAdapter     │                │
│  │ Runtime        │  │ (worktrees,    │  │ (observes GSD  │                │
│  │ (AgentRuntime  │  │  branches,     │  │  state files,  │                │
│  │  impl)         │  │  commits)      │  │  phase status) │                │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘                │
│          └──────────────┬────┴──────────────┬────┘                        │
│                  ┌───────▼────────┐   ┌──────▼───────┐                    │
│                  │ Event Emitter   │   │ Outbound WS/  │                    │
│                  │ (raw observed   │   │ HTTPS client  │                    │
│                  │  facts)         │   │ to control    │                    │
│                  └────────┬────────┘   │ plane         │                    │
│                           └────────────►(long-lived,    │                    │
│                                        outbound-only)   │                    │
└──────────────────────────────────────────┬───────────────────────────────┘
                                            │ typed Company Events (versioned schema)
                                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (always-on, Docker/Coolify)                               │
│  ┌───────────────┐                                                       │
│  │ WS/Event       │  auth, per-worker revocable creds, event validation   │
│  │ Gateway (API)  │                                                       │
│  └───────┬────────┘                                                       │
│          ▼                                                                │
│  ┌───────────────┐   ┌────────────────┐   ┌─────────────────┐           │
│  │ Company Event  │──►│ Company State   │──►│ Postgres         │           │
│  │ Bus (append-   │   │ Engine          │   │ (event log +     │           │
│  │ only log)      │   │ (projections:   │   │  projections)    │           │
│  └───────┬────────┘   │  Agent, Task,   │   └─────────────────┘           │
│          │             │  Project,       │                                │
│          │             │  Approval,      │                                │
│          │             │  Floor state)   │                                │
│          │             └───────┬────────┘                                 │
│          │                     │ state diffs / subscribe                  │
│          │             ┌───────▼────────┐   ┌─────────────────┐          │
│          │             │ Broadcast Hub   │──►│ Web App (CEO     │          │
│          │             │ (WS fanout,     │   │ dashboard,       │          │
│          │             │ visibility-     │   │ approvals)       │          │
│          │             │ filtered)       │   └─────────────────┘          │
│          │             │                 │──►┌─────────────────┐          │
│          │             │                 │   │ Stream Overlay   │          │
│          │             │                 │   │ (/stream/company/│          │
│          │             │                 │   │  :id, OBS source)│          │
│          │             │                 │   └─────────────────┘          │
│          │             └────────────────┘                                 │
│  ┌───────▼────────┐                                                       │
│  │ Twitch/YouTube  │  EventSub / Live Chat → ViewerEvent → Company Event  │
│  │ Connectors      │  Bus (same bus, different producer)                 │
│  └────────────────┘                                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

The single organizing rule: **events flow one direction, left to right, source → bus → state → render.** Nothing downstream (state engine, renderer, overlay) is ever allowed to write back into the source of truth (git, Claude Code, GSD files). The pixel office and stream overlay are pure read-side consumers of projected state — this is what makes "never becomes the source of truth" enforceable rather than aspirational.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| AgentRuntime (interface) | Abstract contract for driving any AI coding tool: `startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff` | TS interface in `packages/orchestration-adapter`; `ClaudeCodeRuntime` is the sole MVP implementation, wraps Claude Code CLI/SDK as a subprocess |
| GitAdapter | Own worktree/branch lifecycle per agent/task, expose commit/diff facts as events, never auto-merge | `packages/git-adapter`, shells out to `git worktree add/remove`, reads refs/log, emits `WorktreeCreated`, `CommitPushed`, etc. |
| GsdAdapter | Translate observed GSD file/state changes (phase status, ROADMAP.md, PLAN.md, verification results) into company events, mapped onto the fixed role pipeline (PM→Research→PM→Architect→Engineering→QA→Reviewer→CEO→DevOps) | `packages/gsd-adapter`, file-watcher + parser over `.planning/`, no GSD reimplementation — pure observation |
| Worker process | Host the three adapters above plus the event emitter and the outbound connection; runs wherever Claude Code is authenticated | `apps/worker`, long-running Node process, one per machine, can target any repo/worktree the user selects |
| Company Event Bus | Durable, ordered, append-only log of every typed event from every worker/connector; single ingestion point | Simplest viable: Postgres table (`events` with `id, type, version, payload, occurred_at, causation_id, correlation_id, visibility`) + `LISTEN/NOTIFY` for fanout. No Kafka/Redis needed at this scale (per PROJECT.md, Redis explicitly deferred) |
| Company State Engine | Fold the event log into current-state projections (Company, Buildings, Floors, Teams, Agents, Projects, Approvals) that the renderer and dashboard actually query | `packages/company-core`, pure reducer functions over events → projection tables/materialized views in Postgres; rebuildable by replay |
| Broadcast Hub / WS Gateway | Authenticate workers and browser clients, validate inbound events against schema, fan out state diffs to subscribed clients, enforce visibility levels (PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC) per connection type | `apps/api`, one WS gateway shared by dashboard and stream overlay, filters payload per subscriber class before send |
| Pixel Office (renderer) | Pure rendering/animation layer: consumes state projections + diffs, drives Pixel Agents fork's movement/character/office systems, never originates domain facts | `packages/pixel-office`, subscribes to Broadcast Hub, maps `AgentStatus` enum to sprite/animation state, canned dialogue templates for handoffs |
| Stream Overlay | Read-only, STREAM_SAFE-filtered view of Pixel Office for OBS Browser Source | `apps/stream-overlay`, transparent-background route, no controls, own WS subscription scoped to public visibility tier |
| CEO Dashboard | Read-write view for the human: approvals, project creation, decision context | `apps/web`, subscribes to INTERNAL-tier state, posts Approve/Reject/Discuss commands back through the API (commands, not events — see Patterns) |
| Twitch/YouTube Connectors | Normalize platform-specific events (EventSub, Live Chat API) into a single `ViewerEvent` schema, feed into the same Company Event Bus as a distinct producer | `packages/twitch-adapter`, `packages/youtube-adapter`, live inside control plane (not worker) since they need always-on connectivity independent of the user's workstation |

## Recommended Project Structure

```
apps/
├── worker/              # Runs on user's workstation; hosts adapters + outbound WS client
│   └── src/
│       ├── runtimes/     # ClaudeCodeRuntime (AgentRuntime impl)
│       ├── watchers/     # GSD file watcher, git watcher
│       └── transport/    # outbound connection to control plane, reconnect/backoff
├── api/                 # Control plane: WS gateway, REST, auth, event ingestion
│   └── src/
│       ├── ingest/       # validate + append events to bus
│       ├── projections/  # subscribe to bus, update read models
│       └── broadcast/    # visibility-filtered fanout to web/overlay
├── web/                 # CEO dashboard (Next.js/Vite + React)
├── stream-overlay/       # OBS-only route, STREAM_SAFE tier, no auth UI
packages/
├── event-schema/         # Typed event definitions + versioning, shared by worker & api
├── company-core/         # Domain model + reducers (Company→Buildings→Floors→Teams→Agents→Projects) — the state engine
├── pixel-office/          # Fork of Pixel Agents renderer, state-driven not scripted
├── claude-adapter/        # ClaudeCodeRuntime implementation
├── git-adapter/           # Worktree/branch/commit observation
├── gsd-adapter/            # GSD workflow state → company event mapping
├── orchestration-adapter/  # AgentRuntime interface + registry (future: MaestroRuntime, CodexRuntime)
├── twitch-adapter/         # EventSub → ViewerEvent
├── youtube-adapter/        # Live Chat/Data API → ViewerEvent
└── shared-ui/              # Cross-app React components (dashboard + overlay share little; keep this thin)
infra/
├── docker/               # Per-app Dockerfiles, docker-compose for local dev
├── migrations/            # Postgres schema + projection migrations
└── deployment/            # Coolify-targeted compose/env templates
```

### Structure Rationale

- **`apps/worker` is separate from everything else** because it is the only piece that must run on the user's machine and hold Claude Code auth; everything else is stateless-deployable to Coolify. Keeping it a thin shell over `packages/*-adapter` means the actual logic is testable without a live Claude Code session.
- **`packages/event-schema` has zero dependents other than "define the contract"** — both worker and control plane import it, so a schema change is a single-package version bump, not a synchronized deploy.
- **`packages/company-core` contains no rendering or transport code** — it is the domain model and event-folding logic only. This is what "never becomes source of truth" is protecting: if `pixel-office` imports directly from `git-adapter` instead of subscribing through `company-core`, the boundary is broken.
- **`packages/orchestration-adapter` exists even though only `claude-adapter` is implemented for MVP** — this is the seam PROJECT.md requires for Maestro/Codex later; it costs one interface file now versus a rewrite later.

## Architectural Patterns

### Pattern 1: Event Sourcing with Materialized Projections (not full CQRS command stack)

**What:** Every fact worth knowing (task started, commit pushed, approval requested, phase completed, viewer followed) is appended as an immutable event to a single ordered log. The Company State Engine folds this log into queryable projection tables (current agent status, current floor layout, current approval queue). The renderer and dashboard only ever read projections, never the raw log directly.

**When to use:** Any system where "what actually happened" must be reconstructable and auditable (PROJECT.md's audit log requirement for CEO approvals falls out of this for free), and where multiple independent consumers (renderer, overlay, dashboard, future analytics) need the same facts without coupling to each other.

**Trade-offs:** Full CQRS (separate write/read databases, command bus, sagas) is overkill for this scale — a single Postgres instance with an `events` table plus projection tables covers it, per the project's own "no Redis unless demonstrated need" constraint. Skip the command bus; a lightweight `dispatchCommand()` function in the API layer that validates and appends is enough. Do keep the write/read separation conceptually (commands mutate via events only, nothing writes directly to a projection table) even without separate infrastructure — that discipline is what prevents projection drift.

**Example:**
```typescript
// packages/event-schema
export interface CompanyEvent<T = unknown> {
  id: string;              // uuid
  type: string;             // "TaskStatusChanged", "ApprovalRequested", ...
  version: number;          // schema version for this type
  occurredAt: string;       // ISO timestamp, from source system if known
  correlationId: string;    // ties events in one workflow together
  causationId?: string;     // the event/command that caused this one
  visibility: 'PRIVATE' | 'INTERNAL' | 'STREAM_SAFE' | 'PUBLIC';
  payload: T;
}

// packages/company-core — a reducer, not a service call
function applyTaskStatusChanged(state: AgentProjection, e: CompanyEvent<TaskStatusChangedPayload>) {
  return { ...state, status: e.payload.newStatus, currentTaskId: e.payload.taskId };
}
```

### Pattern 2: Orchestrator-per-worktree, PR-gated merge (Maestro-style)

**What:** The worker never lets two agents touch the same files concurrently. Each task gets its own git worktree and branch, one Claude Code session drives it via `ClaudeCodeRuntime`, and completion produces a diff for human/CEO review rather than an automatic merge.

**When to use:** Any AI-coding-agent orchestration system doing more than a single linear session — this is now the consensus pattern across the Claude-Code-parallel-agent tooling ecosystem (worktree isolation + PR-per-agent review).

**Trade-offs:** More filesystem/process overhead per task than a single shared working directory, but it's what makes "no unsafe automated merging" (an explicit PROJECT.md constraint) enforceable rather than a policy nobody checks. At MVP scale (1 demo project, likely 1-2 concurrent agents) the overhead is negligible; this pattern is chosen for correctness/safety, not performance.

### Pattern 3: Outbound-only worker-to-control-plane connection

**What:** The worker (on the user's workstation, behind NAT/no public IP) always initiates the connection to the control plane and holds it open (WebSocket or long-poll), sending events and receiving commands (e.g., "cancel task," approval decisions) over that same channel. The control plane never dials into the worker.

**When to use:** Any hybrid control-plane/worker split where the worker runs somewhere the operator doesn't want to expose inbound ports — this is the standard shape for self-hosted CI runners and Claude Code's own self-hosted environments. It's exactly what PROJECT.md's constraint ("control plane must never need direct filesystem access to worker repos") is asking for architecturally.

**Trade-offs:** Requires a reconnect/backoff strategy and a heartbeat (polling doubles as liveness signal) since the worker can silently drop off (laptop sleeps, network blips) — build `worker.status: online/offline/stale` into the Agent projection from day one rather than assuming always-connected.

## Data Flow

### Primary Event Flow

```
Claude Code / Git / CI / GSD (worker, observed facts)
    ↓ (adapter translates raw signal → typed CompanyEvent)
Worker Event Emitter
    ↓ (outbound WS, worker-initiated, authenticated per-worker credential)
Control Plane: WS Gateway → validate schema/version → append
    ↓
Company Event Bus (Postgres events table, append-only)
    ↓ (subscribed reducers, same process or LISTEN/NOTIFY)
Company State Engine → projection tables (Agent, Task, Project, Approval, Floor)
    ↓ (diffed, visibility-filtered)
Broadcast Hub (WS fanout)
    ├──► CEO Dashboard (INTERNAL+ tier: full context, diffs, links)
    ├──► Pixel Office renderer → Stream Overlay (STREAM_SAFE tier only)
    └──► (future) Analytics/history views
```

### Command / Approval Flow (the one reverse-direction path)

```
CEO Dashboard: Approve/Reject/Discuss/Request Changes/Request More Research
    ↓ (HTTP command, authenticated as CEO)
Control Plane API: validates → appends ApprovalDecisionMade event to bus
    ↓ (event, not a fire-and-forget RPC)
Company State Engine updates Approval projection
    ↓ (event delivered to originating worker over its persistent connection)
Worker: AgentRuntime.resumeTask() / cancelTask() invoked on ClaudeCodeRuntime
```

Note this is still event-sourced: the CEO's decision is itself appended as an event before anything acts on it, preserving the audit trail requirement and keeping the worker a pure consumer of commands-as-events rather than a second source of truth.

### Key Data Flows

1. **Development activity → office animation:** GsdAdapter/GitAdapter observe real state changes on the worker, emit events, which fold into an `AgentStatus` enum value in the projection; `pixel-office` maps that enum to a sprite animation. The renderer has no independent notion of "what the agent is doing" — it only ever reflects the projection.
2. **CEO approval gate:** Any event tagged as requiring approval (deploy, destructive op, major dependency change, security/legal/pricing/architecture decision) creates an `ApprovalRequested` event and an Approval projection row with `status: pending`; the agent's runtime blocks (via `AgentRuntime.getStatus()` returning `waiting_for_ceo`) until an `ApprovalDecisionMade` event resolves it. No code path auto-transitions `pending → approved`.
3. **Stream viewer interaction:** Twitch/YouTube connectors normalize platform events into `ViewerEvent`, appended to the same bus with `visibility: PUBLIC`-eligible payloads only (chat text sanitized before it ever becomes an event payload, not sanitized-on-render), which a small rules table maps to a harmless deterministic office animation (coffee delivery, lights) — never routed anywhere near agent/task state.

## Scaling Considerations

Realistic scale for this project (per PROJECT.md: single CEO, personal/internal use first, one demo project, architecture that shouldn't preclude more later):

| Scale | Architecture Adjustments |
|-------|--------------------------|
| MVP (1 worker, 1 project, 1 floor rendered, small stream audience) | Single Postgres instance covers event log + projections + auth. Single API process handles WS gateway + broadcast. No queue, no Redis, no horizontal scaling. This is very close to a modular monolith with clear internal package boundaries — that's correct at this scale, don't split into microservices prematurely. |
| Growth (multiple workers/projects pointed at the same control plane, multiple floors actually rendered, larger concurrent stream audience) | Broadcast Hub becomes the first real bottleneck (WS fanout to many overlay/dashboard clients) — move fanout to a pub/sub layer (Postgres LISTEN/NOTIFY is fine well past hundreds of connections; only reach for Redis/NATS if demonstrated, per the project's own explicit deferral). Projection rebuild-by-replay should be tested at this point since the event log is now large enough that a full replay is non-trivial. |
| Hypothetical multi-tenant SaaS (explicitly out of scope now) | Would require per-company event bus partitioning and auth tenancy — the event-sourced design doesn't block this later, but nothing should be built for it now. |

### Scaling Priorities

1. **First bottleneck: WS fanout under many overlay/dashboard viewers.** Fix by moving broadcast filtering/subscription logic out of the request path into a dedicated hub that pre-computes per-visibility-tier message payloads once and reuses them across subscribers, rather than re-filtering per connection.
2. **Second bottleneck: projection rebuild time as the event log grows.** Fix with periodic snapshotting of projections (store a `snapshot_at_event_id` checkpoint) so replay only needs to process events since the last snapshot, not the entire history.

## Anti-Patterns

### Anti-Pattern 1: Letting the renderer or dashboard query git/GSD/Claude Code state directly

**What people do:** Add a "quick" direct call from `pixel-office` or `apps/web` to read a file, run `git log`, or hit the Claude Code session directly, bypassing the event bus "just this once" for a feature that needs low latency.
**Why it's wrong:** This is exactly the failure mode PROJECT.md's Core Value section calls out — if the visualization can read real state through a side channel, it will inevitably drift from what the event log says happened, and there is no longer one source of truth to reconcile against. It also silently breaks the worker/control-plane network boundary (control plane reaching into worker filesystem).
**Do this instead:** If latency is the actual problem, fix it in the event pipeline (faster ingestion, smaller event payloads, snapshot-based projections) — never add a bypass read path.

### Anti-Pattern 2: Auto-approving or auto-merging because "the agent is confident" or "the diff is small"

**What people do:** Add a heuristic (e.g., "auto-approve if diff < 5 lines" or "auto-merge if tests pass") to reduce CEO friction.
**Why it's wrong:** PROJECT.md is explicit and absolute here — "the system must never auto-approve a CEO-gated operation just because an agent requested it," and "no unsafe automated merging" is a named safety boundary, not a performance target to optimize away.
**Do this instead:** If approval friction is a real UX problem, solve it with better decision context in the CEO dashboard (clearer diffs, agent recommendation, relevant links) so a human decision is fast, not by removing the human from the loop.

### Anti-Pattern 3: Coupling the AgentRuntime interface to Claude Code's specific capabilities

**What people do:** Design `startTask/pauseTask/...` around whatever Claude Code's SDK happens to expose today (e.g., a Claude-Code-specific session ID format, or a method that only makes sense for subprocess-based tools).
**Why it's wrong:** PROJECT.md requires this interface to later support Maestro/Codex/OpenCode "without changing the company model" — if the interface leaks Claude-Code-specific shape, every future runtime implementation has to fake fields that don't apply to it.
**Do this instead:** Keep `AgentRuntime` verbs generic (task lifecycle + status + messaging + review/handoff requests) and push all Claude-Code-specific detail (subprocess management, hook wiring, session file format) inside `ClaudeCodeRuntime`, never in the interface or in `company-core`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code (subprocess/SDK) | `ClaudeCodeRuntime` wraps CLI/SDK invocation on the worker, auth via existing Claude MAX session (no ANTHROPIC_API_KEY) | Runs only on the worker, never the control plane — control plane never needs Claude Code auth |
| Git / GitHub-style worktrees | `git-adapter` shells out to `git worktree`/`git log`/`git diff` on the worker | No remote git service dependency required for MVP; purely local worktree observation |
| GSD (`.planning/` files) | `gsd-adapter` file-watches and parses `.planning/` artifacts on the worker's target repo | Read-only observation; PixelFirm never writes back into another project's `.planning/` |
| Twitch EventSub | Control-plane connector, webhook or EventSub WebSocket subscription against the user's live channel | Signature/HMAC validation is a hard security requirement (PROJECT.md), lives entirely in control plane since it needs always-on connectivity independent of the worker/workstation |
| YouTube Live (chat, Data API) | Control-plane connector, OAuth against the user's channel, phased in after Twitch | Same `ViewerEvent` schema as Twitch — normalize at the adapter boundary, not downstream |
| Coolify (deployment target) | Docker Compose services deployed to existing Coolify server; worker is the one component explicitly *not* deployed there | Control plane is the only thing Coolify manages; worker lifecycle is separate (runs on workstation) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| worker ↔ control plane | Typed events over persistent outbound WS/HTTPS, worker-initiated, per-worker revocable credential | The only network boundary crossing the "workstation vs server" trust line; validate every inbound event against `event-schema` before append |
| company-core ↔ pixel-office | Subscribe to projection diffs via Broadcast Hub; pixel-office never calls company-core functions directly for writes | Enforces "renderer is not source of truth" — pixel-office is a pure consumer package |
| API (commands) ↔ Company Event Bus | Commands validated then appended as events; nothing in the API layer writes directly to a projection table | Preserves single-writer-to-projections discipline even without full CQRS infra |
| Broadcast Hub ↔ Dashboard / Stream Overlay | Same WS mechanism, different visibility-tier filter applied per connection type at send time, not at render time | Filtering at the source (before the message leaves the server) is what makes PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC actually enforceable — never rely on the client to hide fields it received |
| orchestration-adapter ↔ worker runtimes | Registry pattern: worker selects a runtime implementation by project config, all implement `AgentRuntime` | Adding `MaestroRuntime` later means implementing the interface, not touching `company-core` or `event-schema` |

## Sources

- [Event Bus Architecture for Coordinating Distributed Agents](https://www.auxiliobits.com/blog/event-bus-architectures-for-coordinating-distributed-agents/) — MEDIUM
- [Event-Driven Architecture (EDA): A Complete Introduction — Confluent](https://www.confluent.io/learn/event-driven-architecture/) — MEDIUM
- [Event-driven architecture with CQRS & event sourcing — Medium](https://medium.com/techartifact-technology-learning/event-driven-architecture-with-cqrs-event-sourcing-bdded2f3c595) — MEDIUM
- [I Built a Parallel Agent Orchestrator. Here is the Architecture. — DEV Community](https://dev.to/mexiter/claude-code-parallel-agent-driven-worktrees-orchestration-5bf0) — MEDIUM
- [The Code Agent Orchestra — AddyOsmani.com](https://addyosmani.com/blog/code-agent-orchestra/) — MEDIUM
- [Parallel Agentic Development With Git Worktrees: A Practical Playbook — MindStudio](https://www.mindstudio.ai/blog/parallel-agentic-development-git-worktrees) — MEDIUM
- [Building Real-Time Dashboards with WebSockets and Frontend Frameworks — Sencha](https://www.sencha.com/blog/building-real-time-dashboards-with-websockets-and-frontend-frameworks/) — MEDIUM
- [How to Build Real-Time Dashboards with Dapr Pub/Sub — OneUptime](https://oneuptime.com/blog/post/2026-03-31-dapr-real-time-dashboards-pubsub/view) — MEDIUM
- [GitHub - filiphanes/websocket-overlays](https://github.com/filiphanes/websocket-overlays) — MEDIUM
- [Build a TikTok LIVE Stream Overlay for OBS with Node.js — DEV Community](https://dev.to/tiktool/build-a-tiktok-live-stream-overlay-for-obs-with-nodejs-jm3) — MEDIUM
- [Self-hosted environments — Claude Code Docs](https://code.claude.com/docs/en/self-hosted-environments) — MEDIUM (official Claude Code docs, directly relevant to the worker/control-plane split)
- [How do you set up a self-hosted software factory — Warp](https://www.warp.dev/articles/how-to-set-up-self-hosted-software-factory) — MEDIUM
- [Simple patterns for events schema versioning — Event-Driven.io](https://event-driven.io/en/simple_events_versioning_patterns/) — MEDIUM
- [Event versioning strategies for event-driven architectures — theburningmonk.com](https://theburningmonk.com/2025/04/event-versioning-strategies-for-event-driven-architectures/) — MEDIUM
- [Events, Schemas and Payloads: The Backbone of EDA Systems — Solace](https://solace.com/blog/events-schemas-payloads/) — MEDIUM

---
*Architecture research for: event-driven AI dev-orchestration + pixel-art visualization systems*
*Researched: 2026-09-18*

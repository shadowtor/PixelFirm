# Feature Research

**Domain:** Pixel-art AI dev-team visualization / agent-orchestration streaming tool (PixelFirm)
**Researched:** 2026-09-18
**Confidence:** MEDIUM — strong single-source data on named competitors (official repos/docs), broader ecosystem claims are websearch-synthesized and cross-checked across 2-3 sources but not independently verified against primary docs in every case.

## Feature Landscape

This space is really three converging categories PixelFirm sits at the intersection of:
1. **Pixel-office AI visualizers** (Pixel Agents and forks, DeskRPG) — render agent activity as characters in an office.
2. **Agent orchestration dashboards** (Kanban/board tools, Maestro/Conductor-style worktree managers) — manage parallel coding-agent sessions and approvals.
3. **Streaming overlay tools** (Twitch/YouTube EventSub-driven OBS overlays) — turn viewer actions into on-screen events.

No single product found combines all three with a *real* (non-simulated) backing workflow and a hard CEO-approval gate — that combination is PixelFirm's actual differentiation, not any individual feature.

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-agent activity state + animation (idle/coding/reading/testing/blocked) | Every pixel-office visualizer (Pixel Agents, agent-office, ai-office-simulator, DeskRPG) leads with this; it's the category's core promise | MEDIUM | PixelFirm's PROJECT.md already lists 14 states — matches or exceeds Pixel Agents' ~5-6 observed states |
| Real event source, not simulated/scripted movement | Pixel Agents and DeskRPG both derive character behavior from actual hook/session events, not canned animation loops; a faked version reads as a toy | HIGH | This is PixelFirm's stated Core Value — get it wrong and the product has "failed at its one job" per PROJECT.md |
| Blocked/waiting-for-input visual signal (speech bubble or equivalent) | Pixel Agents flags stuck agents visually by design; users need to spot stalls at a glance | LOW | Cheap, high payoff — do this early |
| Task/session board showing what each agent is doing right now | Every orchestration dashboard surveyed (Agent Kanban, Hermes Kanban, Operator, AgentsRoom) has a live board; it's the non-visual fallback when the pixel view isn't enough | MEDIUM | CEO dashboard in PROJECT.md already covers this for approvals; a general "what's everyone doing" view is a natural companion |
| Approval queue for risky/irreversible actions | Universal pattern across HITL literature: agent proposes, human approves/rejects before execution; "autonomy on reads, gate on writes" is the accepted rule of thumb | MEDIUM | PROJECT.md's CEO office/approval workflow matches this pattern closely already |
| Show the actual diff/context/recommendation at approval time, nothing hidden | HITL UX consensus: approval screens that hide the real action produce rubber-stamping and erode trust | LOW–MEDIUM | Directly maps to PROJECT.md's "decision title, context, agent recommendation, relevant links/diffs" requirement |
| OBS-friendly overlay route (transparent bg, no chrome, fixed resolution) | Every stream-overlay tool in this space assumes Browser Source consumption | LOW | PROJECT.md already specifies `/stream/company/:id`, 1920x1080, transparent |
| Rate-limited, sanitized viewer-to-visual pipeline | Every Twitch/EventSub overlay pattern maps one reward → one deterministic visual action, never free text into anything executable | MEDIUM | Prevents chat/redemption abuse from ever touching real system state |
| Persistent history/audit trail of what happened | Kanban-style boards (Hermes Kanban, Agent Kanban) keep full run history for crash recovery and trust; DeskRPG posts structured completion notices | MEDIUM | PROJECT.md's "activity history" and "audit log for CEO approvals" already cover this |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable — and should align with Core Value (real, not faked, visualization).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Physically-represented human approval gate as a hard architectural boundary (never auto-approved) | No competitor found treats CEO/human approval as a non-bypassable system invariant with an audit log — most orchestration tools optimize for autonomy, not for a permanent human veto | MEDIUM | This is PixelFirm's clearest differentiator versus both Pixel Agents (observation-only, no approval loop) and Maestro-style tools (optimize for autonomous merge) |
| Git-worktree-per-agent model wired into the *visual* layer (agent walks to a worktree/desk tied to a real branch) | Worktree-per-agent is common in orchestration backends (Conductor, Claude Squad, Vibe Kanban) but none of them render it as a physical space; pairing it with the office metaphor is novel | HIGH | Needs the AgentRuntime + worktree/branch/task/session model from PROJECT.md before any visual payoff is possible — sequence accordingly |
| Viewer-interaction-driven office events (Twitch/YouTube → real office animation) | Overlay tools trigger generic alerts/scene changes; none observed inject viewer actions into a living simulated *workplace* with characters reacting | MEDIUM | Cheap first version: map a handful of channel-point rewards to one-shot deterministic animations (coffee delivery, lights, celebratory confetti) — matches PROJECT.md's MVP scope exactly |
| Progression/unlocks tied to *real* business/dev milestones (deployments, project completions) rather than points/currency | DeskRPG has no progression system at all; generic gamification tools use arbitrary XP/currency, not real event triggers | MEDIUM | Data-driven trigger table (event type → unlock) keeps this from becoming a second RPG-economy project; PROJECT.md already scopes this correctly ("simple and data-driven") |
| AgentRuntime abstraction enabling multi-provider agents later (Claude Code first, Maestro/Codex/OpenCode later) without rearchitecting | Competing visualizers are single-tool-coupled (Pixel Agents = Claude Code hooks only, DeskRPG = its own "Hermes" gateway only) | MEDIUM | Purely an architecture decision now, zero extra runtime cost if the interface is narrow (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff, per PROJECT.md) |
| Generalizes to any repo the user points it at, not hardcoded to one demo project | Every reviewed tool assumes a fixed, single connected workspace; none advertise "point me at any git repo" | LOW–MEDIUM | Mostly a config/adapter concern (GSD adapter observing state, not guessing it) rather than new UI |
| Multi-floor/company domain model from day one (even if only one floor renders) | No competitor scopes for a "company" with multiple floors/teams/buildings; they're single shared-space simulators | LOW (schema only, MVP) | Cheap to model now, expensive to retrofit later — matches PROJECT.md's explicit early investment here |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific product.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| LLM-generated agent chatter/dialogue | Feels "alive," other pixel-office toys (agent-office, ai-office-simulator) lean into chatty NPCs for charm | Breaks the Core Value: any generated text not tied to a real event is fabrication, and it's an added LLM-cost + latency + moderation surface for a stream-facing feature | Deterministic dialogue templates keyed to real event types (PROJECT.md already made this call) |
| Free-text viewer chat directly driving in-world actions or code execution | Twitch chat commands are a beloved streamer feature, viewers will ask for it | Direct path to prompt-injection / abuse against a system that controls real git operations; catastrophic if it ever reaches an agent or the CEO queue | Fixed, curated set of channel-point-redemption → deterministic-animation mappings, never free text into anything that executes |
| Auto-merge / autonomous deploy once "confidence is high enough" | Every orchestration tool eventually gets asked for "just let it merge when tests pass" for velocity | PROJECT.md treats the CEO gate as a hard safety boundary; auto-merge undermines the entire premise of the product (a *human*-approved dev company) | Keep the approval queue permanently in the loop for deploy/destructive/major-dependency/architecture decisions; optimize approval *speed* (good diffs, clear context) instead of removing approval |
| 3D office / full RPG movement and economy (inventory, currency, shops) | DeskRPG uses Three.js 3D and it looks appealing; RPG progression is a well-understood genre players enjoy | Massive scope and asset-production increase for zero contribution to the Core Value (accurate dev visualization); 3D pixel art in particular is a different skill/pipeline than 2D sprite work | Stay 2D pixel-art via Pixel Agents fork; keep progression data-driven and tied only to real milestones, not a simulated economy |
| Public multi-tenant SaaS with billing from the start | Natural "what if others want this too" scope creep once the personal tool works | Adds auth/tenancy/billing/marketplace complexity that has nothing to do with proving the core visualization loop; PROJECT.md explicitly defers this | Build the control-plane/worker split so multi-tenancy *could* be added later, but ship single-CEO personal deployment first |
| Arbitrary/general remote shell or command endpoint on the worker | Convenient for "just let me run any command from the dashboard" during development | A remote arbitrary-shell endpoint on a component that already runs real git/build/test operations is a critical security hole, especially once a public stream/viewer surface exists nearby | Fixed, typed AgentRuntime operations only (start/pause/resume/cancel/status/message/review/handoff) — no generic exec passthrough |

## Feature Dependencies

```
Typed event schema (Claude Code/Git/CI/GSD -> Company Event Bus)
    └──requires──> Company State Engine (agent/floor/team/project state)
                       └──requires──> Pixel Office renderer (Pixel Agents fork)
                       └──requires──> CEO approval queue UI
                       └──requires──> Stream overlay route

AgentRuntime abstraction (ClaudeCodeRuntime)
    └──requires──> GSD adapter (maps GSD workflow states to company events)
    └──enables──> Git-worktree-per-agent visual model (worktree/branch/task/session)

CEO approval gate (never auto-approved)
    └──requires──> Typed event schema + Company State Engine
    └──enhances──> Trust/credibility of "real, not faked" visualization

Stream-safe visibility levels (PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC)
    └──requires──> before ──> Public stream overlay route
    └──requires──> before ──> Twitch/YouTube viewer-event integration

Twitch EventSub integration
    └──requires──> ViewerEvent schema + rate limiting + chat sanitization
    └──enables──> Viewer-interaction-driven office events
    └──precedes──> YouTube Live integration (same ViewerEvent schema, second platform)

Progression/unlock system
    └──requires──> Company Event Bus history (projects completed, deployments, milestones)
    └──conflicts with──> Sophisticated economy/RPG mechanics (deliberately out of scope)

Multi-floor domain model (DB/schema only for MVP)
    └──enhances──> future multi-floor rendering (post-MVP)
    └──does NOT require──> multi-floor renderer for MVP (schema-only investment now)
```

### Dependency Notes

- **CEO approval gate requires the event schema + state engine first:** there's no meaningful "walk to CEO office and wait" without a real event driving it — this is why PROJECT.md sequences architecture before UI polish.
- **Git-worktree visual model requires AgentRuntime abstraction:** rendering a worktree-per-agent office only makes sense once tasks/sessions/worktrees are first-class in the runtime layer, not bolted onto the renderer.
- **Stream-safe visibility levels must exist *before* any public overlay or viewer integration ships:** building the overlay route first and adding redaction later is the direction most likely to leak secrets/paths onto a live stream.
- **Twitch precedes YouTube by design (per PROJECT.md), not by feature necessity:** both consume the same ViewerEvent schema, so the second platform is materially cheaper once the first exists — sequence for cost savings, not because YouTube depends on Twitch.
- **Progression/unlocks conflict with a real economy system:** resist requests to add currency, shops, or stats-grinding — that's a different (RPG) product and actively works against "simple, data-driven, tied to real milestones."

## MVP Definition

### Launch With (v1)

Minimum viable product — matches PROJECT.md's Active requirements almost exactly; listed here for feature-landscape validation, not as a new proposal.

- [ ] Real event pipeline (Claude Code/Git/GSD → event bus → state engine) — without this nothing else is trustworthy
- [ ] Pixel Agents fork rendering agent states (idle/coding/blocked/etc.) for one floor, one demo project
- [ ] CEO approval queue with full context (diff, recommendation, links) and a hard non-bypassable gate
- [ ] Deterministic handoff visuals (walk-to-desk, hand off task icon) — no generated dialogue
- [ ] Git worktree model in the data layer (repo/branch/worktree/task/session per agent) — no unsafe auto-merge
- [ ] Stream-safe visibility levels enforced end-to-end before any public route ships
- [ ] `/stream/...` OBS-ready overlay route
- [ ] One live Twitch integration mapping a handful of events to harmless deterministic office animations

### Add After Validation (v1.x)

Features to add once core loop (real event → visible office → CEO approval) is proven trustworthy.

- [ ] YouTube Live integration on the same ViewerEvent schema — trigger: Twitch integration stable and generalized ViewerEvent schema already proven
- [ ] Data-driven progression/unlock triggers (desks, rooms, decorations) — trigger: enough real milestone event history exists to make unlocks feel earned, not arbitrary
- [ ] Second AgentRuntime (e.g., Codex/Maestro) behind the existing abstraction — trigger: abstraction has been exercised long enough by ClaudeCodeRuntime to trust its boundaries
- [ ] Second rendered floor — trigger: multi-project/multi-team usage actually happens, not just schema-supported

### Future Consideration (v2+)

Features to defer until the personal/internal tool has proven itself and self-hosted/hosted distribution is actually being pursued.

- [ ] Multi-tenant SaaS + billing — defer until there's a concrete second user/customer, not speculative demand
- [ ] Marketplace / permissions system beyond single-CEO — defer until multi-tenant need is real
- [ ] Richer economy/RPG mechanics — deliberately capped; revisit only if data shows the simple progression system feels flat *and* the team wants to lean further into "game" over "dev tool"

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Real event pipeline + state engine | HIGH | HIGH | P1 |
| Pixel office renderer (agent states) | HIGH | MEDIUM | P1 |
| CEO approval gate + dashboard | HIGH | MEDIUM | P1 |
| Stream-safe visibility levels | HIGH | MEDIUM | P1 |
| Git worktree data model | MEDIUM | MEDIUM | P1 |
| Stream overlay route | MEDIUM | LOW | P1 |
| Twitch viewer-event integration | MEDIUM | MEDIUM | P1 |
| Deterministic handoff visuals | MEDIUM | LOW | P1 |
| YouTube integration | MEDIUM | LOW (once Twitch exists) | P2 |
| Progression/unlock system | MEDIUM | MEDIUM | P2 |
| Second AgentRuntime provider | LOW (now) / HIGH (later) | MEDIUM | P3 |
| Second rendered floor | LOW | MEDIUM | P3 |
| Multi-tenant SaaS/billing | LOW (now) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Pixel Agents (pixel-agents-hq) | DeskRPG (dandacompany) | Orchestration dashboards (Agent Kanban / Hermes Kanban / Operator) | PixelFirm's Approach |
|---------|--------------------------------|--------------------------|----------------------------------------------------------------------|-----------------------|
| Activity source | Claude Code hooks (SessionStart/PreToolUse/PermissionRequest/Stop) + JSONL transcript fallback | External "Hermes" agent gateway via authenticated REST | Agents claim tasks and push structured logs via HTTP API / SSE | Full typed event bus from Claude Code + Git + CI + GSD, observed not guessed, feeding a persistent Company State Engine |
| Human approval | None observed — purely observational, no gate | None observed — task board only, no approval step | None observed — autonomy-first boards, humans watch, don't gate | Hard CEO approval gate, never auto-approved, full audit log — the clearest gap in the market this fills |
| Visual style | 2D pixel-art, Canvas 2D, MIT-licensed, VS Code extension + CLI | 2D pixel sprites rendered via Three.js (3D engine) + Phaser sim | None (text/board UI, no office visualization) | 2D pixel-art only (forked from Pixel Agents), explicitly avoiding 3D scope |
| Parallel-agent/worktree model | Not a first-class concept (one character per terminal, not per worktree) | Not present | Present in backend tools (Conductor, Claude Squad) but not paired with any visualization | Worktree/branch/task/session as first-class data model, visually represented via desk/office assignment |
| Streaming/viewer integration | None observed | None observed (multiplayer for coworkers, not stream viewers) | None observed | Twitch (then YouTube) EventSub → sanitized, rate-limited ViewerEvent → deterministic office animation |
| Progression/unlocks | None observed | None observed (confirmed no progression system in docs) | None (task boards don't gamify) | Data-driven, tied strictly to real business/dev milestones — no arbitrary XP/currency |
| Multi-provider agent support | Claude-Code-hook-specific by design | Coupled to its own Hermes gateway | Varies by tool, generally single-workflow-coupled | AgentRuntime abstraction, ClaudeCodeRuntime first, others addable without rearchitecture |

## Sources

- [Pixel Agents (pixel-agents-hq/pixel-agents)](https://github.com/pixel-agents-hq/pixel-agents) — primary fork target, MIT license, direct repo read
- [DeskRPG (dandacompany/deskrpg)](https://github.com/dandacompany/deskrpg) — UX reference only, direct repo read
- [agent-office (Pixel-Process-UG)](https://github.com/Pixel-Process-UG/agent-office)
- [ai-office-simulator (itachiuchihadev)](https://github.com/itachiuchihadev/ai-office-simulator)
- [agent-office (harishkotra) / "How I Built AgentOffice" (DEV Community)](https://dev.to/harishkotra/how-i-built-agentoffice-self-growing-ai-teams-in-a-pixel-art-virtual-office-4o0p)
- [Git Worktrees + Claude Code: The 2026 Playbook (Developers Digest)](https://www.developersdigest.tech/blog/git-worktrees-claude-code-parallel-agents-guide)
- [From Conductor to Orchestrator: A Practical Guide to Multi-Agent Coding in 2026](https://htdocs.dev/posts/from-conductor-to-orchestrator-a-practical-guide-to-multi-agent-coding-in-2026/)
- [Maestro (RunMaestro/Maestro)](https://github.com/RunMaestro/Maestro)
- [The Code Agent Orchestra (AddyOsmani.com)](https://addyosmani.com/blog/code-agent-orchestra/)
- [How to Build Human-in-the-Loop Approval Gates for AI Coding Agents (DEV Community)](https://dev.to/sahil_kat/how-to-build-human-in-the-loop-approval-gates-for-ai-coding-agents-fo6)
- [Human-in-the-Loop Patterns for High-Stakes AI Agent Decisions (DEV Community)](https://dev.to/omnithium/human-in-the-loop-patterns-for-high-stakes-ai-agent-decisions-1fg6)
- [Human-in-the-Loop AI Agents: How to Design Approval Workflows (StackAI)](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)
- [Twitch EventSub channel point redemption discussion (Twitch Developer Forums)](https://discuss.dev.twitch.com/t/receiving-data-from-channel-point-redeems-via-eventsub/63558)
- [Control OBS with Twitch channel points (BetterStreams)](https://betterstreams.tv/obs-channel-points)
- [agent-kanban-board (riazrahaman)](https://github.com/riazrahaman/agent-kanban-board)
- [Hermes Kanban: A Complete Guide to Multi-Agent Task Orchestration](https://magnus919.com/2026/05/the-hermes-kanban-a-complete-guide-to-multi-agent-task-orchestration/)
- [Operator (untra/operator)](https://github.com/untra/operator)
- [awesome-agent-orchestrators (andyrewlee)](https://github.com/andyrewlee/awesome-agent-orchestrators)
- `.planning/PROJECT.md` (PixelFirm project context — scope, constraints, out-of-scope decisions)

---
*Feature research for: Pixel-art AI dev-team visualization / streaming orchestration tools*
*Researched: 2026-09-18*

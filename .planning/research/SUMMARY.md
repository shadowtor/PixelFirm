# Project Research Summary

**Project:** PixelFirm
**Domain:** Event-driven AI dev-team visualization / streaming orchestration control plane (pixel-art office renderer + Claude Code worker + Twitch/YouTube integration)
**Researched:** 2026-09-18
**Confidence:** MEDIUM

## Executive Summary

PixelFirm sits at the intersection of three existing categories — pixel-office AI visualizers (Pixel Agents, DeskRPG), agent-orchestration dashboards (Kanban/worktree managers), and Twitch/YouTube streaming overlays — but no competitor combines all three with a *real* (non-simulated) backing workflow and a hard, non-bypassable human-approval gate. That combination is the product's actual differentiation. Experts build this shape as a control-plane/worker split: a worker process runs on the user's workstation (where Claude Code auth lives), observes real facts from Claude Code, git, and GSD, and emits them as typed events over an outbound-only WebSocket to an always-on control plane (Postgres event log → state-engine projections → visibility-filtered WS broadcast to a CEO dashboard and a public OBS overlay). Recommended stack: TypeScript everywhere, Phaser 4 (matching the Pixel Agents fork target), Fastify + Drizzle + Postgres for the control plane, ws for broadcast (no Socket.IO/Redis at this scale), the Claude Agent SDK to drive Claude Code (not a hand-rolled CLI wrapper), and Twurple/googleapis for Twitch/YouTube.

The single biggest risk, called out consistently across all four research files, is projection drift: the pixel office looking alive while no longer reflecting real Claude Code/git/GSD state. This is the exact failure PROJECT.md defines as "the product has failed at its one job," so the Company Event Bus / State Engine must be built first, treated as replayable/disposable, and instrumented with lag detection before any rendering work begins. Secondary risks cluster around the two public-facing surfaces: Twitch EventSub (reconnect/dedup handling, raw-body HMAC signature verification) and the stream overlay route (visibility-tier leakage via URL tokens, unsanitized viewer chat XSS) — both need security controls built in from their first phase, not retrofitted. A third, lower-severity risk is asset licensing on the Pixel Agents fork: the credited character pack is verified CC0, but other bundled assets need individual audit before public distribution.

Recommended approach: build strictly in dependency order — event schema and state engine first (nothing else is trustworthy without it), then the AgentRuntime/ClaudeCodeRuntime and Git worktree model, then the CEO approval gate (which depends on both), then the pixel renderer (a pure consumer of state), then visibility levels and the stream overlay (shipped together, since the route is unsafe until filtering is server-side), then Twitch (with its security/reliability pitfalls addressed inline), then YouTube as a cheap follow-on using the same ViewerEvent schema.

## Key Findings

### Recommended Stack

TypeScript across the whole monorepo (pnpm + Turborepo, apps/{web,api,stream-overlay,worker} + packages/*), deployed to Coolify via per-app Dockerfiles. Confidence is capped at MEDIUM because two areas move fast and are policy-sensitive: Phaser's v3 to v4 jump (stable since Apr 2026, low migration risk but recent) and Claude Max-subscription billing terms for SDK/headless usage (an announced billing change was paused mid-2026 but isn't guaranteed to stay paused — re-check before scaling worker usage).

**Core technologies:**
- Phaser ^4.2 — pixel office renderer (sprites, scenes, tilemap physics, pathing); matches the Pixel Agents fork target
- Node.js 22 LTS + TypeScript ^5.7 — runtime/language across API, worker, WS gateway
- PostgreSQL 18.x — single source of truth for event log + projections (no Kafka/Redis needed at this scale)
- Fastify ^5.12 + Drizzle ORM ^0.45 — control-plane API and Postgres access layer
- ws ^8.21 — WebSocket broadcast (chosen over Socket.IO: no rooms/presence complexity needed yet)
- @anthropic-ai/claude-agent-sdk ^0.3 — official, maintained way to drive Claude Code (query/resume/hooks/canUseTool), not a hand-rolled subprocess wrapper
- Twurple (@twurple/eventsub-ws, @twurple/auth) — Twitch EventSub WebSocket, handles session lifecycle correctly
- googleapis (youtube v3) — YouTube Live chat via polling (no push transport exists for YouTube chat)
- Zod ^4.6 — runtime validation for the shared event schema, the seam every component depends on
- React ^19.3 + Vite ^8 — CEO dashboard and stream-overlay apps

**Explicitly avoid:** direct Anthropic API billing (Max-subscription-only per PROJECT.md), Phaser 3 for new code, Socket.IO as default, Nixpacks on Coolify for this monorepo, Redis (deferred), hand-rolled Twitch EventSub protocol handling.

### Expected Features

No single competitor combines real event-driven visualization + hard human approval gate + streaming integration — that combination is PixelFirm's differentiation, not any individual feature.

**Must have (table stakes):**
- Per-agent activity state + animation (idle/coding/blocked/etc.) driven by real events, never simulated
- Blocked/waiting-for-input visual signal
- Task/session board mirroring the pixel view
- Approval queue for risky/irreversible actions, showing full diff/context/recommendation (never hidden)
- OBS-friendly overlay route (transparent bg, fixed resolution, no chrome)
- Rate-limited, sanitized viewer-to-visual pipeline (one redemption → one deterministic animation, never free text → execution)
- Persistent history/audit trail

**Should have (differentiators):**
- Hard, non-bypassable CEO approval gate with audit log — no competitor treats human approval as a system invariant
- Git-worktree-per-agent rendered as a physical space (walk to desk tied to a real branch)
- Viewer-interaction-driven office events (Twitch/YouTube → real office animation)
- Data-driven progression tied to real milestones, not arbitrary XP/currency
- AgentRuntime abstraction enabling multi-provider agents later without rearchitecting
- Multi-floor/company domain model in schema from day one (even if only one floor renders)

**Defer (v2+):**
- 3D office / RPG economy mechanics (out of scope — stay 2D pixel art)
- Free-text viewer chat driving in-world actions (prompt-injection risk)
- Auto-merge/auto-approve "when confident" (undermines the core safety boundary)
- Multi-tenant SaaS + billing (no concrete second user yet)
- Second rendered floor, second AgentRuntime provider — until real multi-project/multi-provider usage exists

### Architecture Approach

Event-driven, one-directional data flow: source (Claude Code/git/GSD, worker-side) → typed Company Events → append-only Postgres event log → Company State Engine projections → visibility-filtered WS broadcast → renderer/dashboard/overlay (pure read-side consumers). The one reverse-direction path is CEO approval decisions, which are themselves appended as events before anything acts on them, preserving the audit trail. This is event sourcing with materialized projections (not full CQRS) — a single Postgres instance is sufficient at this scale, matching PROJECT.md's explicit Redis deferral.

**Major components:**
1. **Worker** (apps/worker, runs on user's workstation) — hosts ClaudeCodeRuntime (AgentRuntime impl), GitAdapter (worktrees/branches/commits), GsdAdapter (observes .planning/ state), and the outbound-only connection to the control plane
2. **Control Plane** (apps/api, Coolify-deployed) — WS/event gateway, Company Event Bus (Postgres append-only log), Company State Engine (event-folding reducers → projections), Broadcast Hub (visibility-filtered WS fanout)
3. **Pixel Office renderer** (packages/pixel-office) — pure consumer of state projections, drives the Pixel Agents fork; never originates domain facts
4. **CEO Dashboard** (apps/web) — INTERNAL-tier read-write view; posts Approve/Reject/Discuss as commands-as-events
5. **Stream Overlay** (apps/stream-overlay) — STREAM_SAFE-only read view for OBS Browser Source
6. **Twitch/YouTube Connectors** — normalize platform events into a shared ViewerEvent schema feeding the same bus

Critical invariant: nothing downstream (renderer, dashboard, overlay) is ever allowed to write back into the source of truth (git, Claude Code, GSD files), and no component bypasses the event bus to read git/GSD/Claude Code state directly — this is what makes "never drifts from real state" enforceable rather than aspirational.

### Critical Pitfalls

1. **Pixel office state silently drifts from real Claude Code/git/GSD state** — the single most severe risk, matching PROJECT.md's defined failure condition. Avoid by treating projections as disposable/replayable, tracking event-bus-to-projection lag explicitly, making every handler idempotent, and preferring reset-and-replay over patching state in place. Verify by killing the worker mid-task and confirming the office freezes visibly or recovers via replay — never keeps animating as if nothing happened.
2. **Stream-safe visibility levels leak via URL query params or UI-only filtering** — never put credentials/tokens in the overlay route's query string; enforce visibility server-side at the data-query layer (never rely on the client to hide fields); ship visibility enforcement and the public route together, not sequentially.
3. **Twitch EventSub websocket reconnect drops or duplicates events** — implement explicit keepalive-timeout detection and correct session_reconnect handling (open new socket, wait for session_welcome, only then close old); make office reactions idempotent per Twitch event ID.
4. **Twitch signature verification against the wrong bytes** — must verify against the untouched raw request body (preserved before JSON-parsing middleware) with constant-time HMAC comparison and a replay-window timestamp check; a common failure mode across frameworks that parse-then-verify.
5. **Unsanitized viewer chat rendered into the office (XSS)** — sanitize at ViewerEvent ingestion (server-side) and again at render (textContent, never innerHTML with viewer-sourced strings).
6. **Claude Code headless/subagent integration hangs silently** — pin working directory per task, pass explicit session/task IDs, cap subagent fan-out with backoff on 429s, and ensure AgentRuntime.getStatus() surfaces a bounded-timeout failed/blocked state rather than letting the office freeze an agent "coding" forever.
7. **Fork's MIT license doesn't cover every bundled asset** — the credited MetroCity character pack is confirmed CC0, but other assets need individual verification before public/commercial distribution.

## Implications for Roadmap

Based on combined research, the dependency chain is unusually strict: almost every differentiating feature (CEO gate, worktree visualization, stream overlay) requires the event schema and state engine to exist first, and the two public-facing surfaces (stream overlay, Twitch) each carry security pitfalls that must ship with their first phase, not after.

### Phase 1: Company Event Bus & State Engine
**Rationale:** Foundational seam every other component depends on; PITFALLS.md's top risk (projection drift) is prevented or created here.
**Delivers:** Typed/versioned event schema (Zod), Postgres event log, state-engine reducers/projections (Agent/Task/Project/Approval/Floor), replay/lag-detection capability.
**Addresses:** "Real event source, not simulated" table-stakes feature.
**Avoids:** Pitfall — projection drift (verify via kill-worker-mid-task test).

### Phase 2: AgentRuntime / ClaudeCodeRuntime + Git Worktree Model
**Rationale:** Second dependency layer — CEO approval and worktree visualization both require this before they have anything real to gate/render.
**Delivers:** AgentRuntime interface (generic, SDK-agnostic) + ClaudeCodeRuntime impl via Claude Agent SDK; GitAdapter managing worktree-per-task, no auto-merge.
**Uses:** Claude Agent SDK, execa/simple-git.
**Implements:** Orchestrator-per-worktree pattern (Pattern 2 in ARCHITECTURE.md).
**Avoids:** Pitfall — headless/subagent hangs (verify via hang/kill test surfacing a bounded failed/blocked event).

### Phase 3: CEO Approval Gate
**Rationale:** Depends on event schema + state engine (Phase 1) and needs real task/agent state (Phase 2) to gate meaningfully.
**Delivers:** Approval queue UI showing full diff/context/recommendation, hard non-bypassable gate, audit log, Approve/Reject/Discuss/Request-Changes wired to actually control AgentRuntime (not just animate the UI).
**Addresses:** Table-stakes approval queue + PixelFirm's clearest differentiator (non-bypassable human gate).
**Avoids:** Anti-pattern — auto-approving/auto-merging "because confident."

### Phase 4: Pixel Office Renderer (Pixel Agents fork integration)
**Rationale:** Pure consumer of state — only makes sense once Phases 1-3 produce real, meaningful state to render.
**Delivers:** Forked Pixel Agents renderer wired to state projections (agent states, worktree/desk assignment, handoff visuals), asset-license audit document.
**Uses:** Phaser ^4.2.
**Avoids:** Pitfall — asset licensing gaps (verify per-asset source before this phase's work is considered done, re-check again before public overlay ships).

### Phase 5: Stream-Safe Visibility Levels + /stream/company/:id Overlay Route
**Rationale:** These two must ship together per PITFALLS.md — the route is unsafe to expose until server-side visibility filtering exists; sequencing them apart is the most common mistake in this space.
**Delivers:** PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC enforcement at the query layer, route-scoped non-URL-leaking token, OBS-ready transparent overlay route.
**Avoids:** Pitfalls — token leakage via URL, UI-only visibility enforcement.

### Phase 6: Twitch EventSub Integration
**Rationale:** First viewer-facing integration; PROJECT.md sequences Twitch before YouTube by design since both consume the same ViewerEvent schema.
**Delivers:** ViewerEvent schema, Twurple-based EventSub WS connector, sanitized/rate-limited mapping to deterministic office animations, raw-body HMAC signature verification.
**Addresses:** Viewer-interaction-driven office events (differentiator).
**Avoids:** Pitfalls — reconnect/dedup bugs, signature verification against wrong bytes, unsanitized chat XSS.

### Phase 7: YouTube Live Integration
**Rationale:** Materially cheaper once Twitch/ViewerEvent exists; same schema, second producer.
**Delivers:** googleapis-based polling connector respecting pollingIntervalMillis and quota budget.
**Avoids:** Pitfall — quota exhaustion from aggressive polling during multi-hour streams.

### Phase Ordering Rationale

- Phases 1-2-3 are a strict dependency chain (schema → runtime → gate) called out identically in FEATURES.md's dependency graph and ARCHITECTURE.md's component responsibilities.
- Phase 4 (renderer) is deliberately after the gate, not before, so the visualization has real state worth rendering from day one — avoids ever building a "faked" version that later needs a rework.
- Phase 5 bundles visibility + overlay route as one unit per an explicit PITFALLS.md recommendation ("these should ship together, not sequentially").
- Phases 6-7 follow PROJECT.md's own sequencing (Twitch before YouTube) and FEATURES.md's dependency note that this is for cost savings, not technical necessity.

### Research Flags

Needs research during planning (--research-phase):
- **Phase 2 (AgentRuntime/ClaudeCodeRuntime):** Claude Agent SDK subagent/session-resume behavior and Max-subscription billing status are fast-moving and policy-sensitive — verify current SDK API shape and billing terms at planning time, not from this research alone.
- **Phase 6 (Twitch EventSub):** Protocol-level reconnect/signature details are easy to get subtly wrong; verify against current Twitch Developer docs at implementation time.
- **Phase 7 (YouTube Live):** Confirm current quota limits and pollingIntervalMillis behavior against live API docs.

Standard patterns (skip research-phase):
- **Phase 1 (Event Bus/State Engine):** Event sourcing + materialized projections is a well-documented, established pattern (Postgres event log + reducers).
- **Phase 3 (CEO Approval Gate):** HITL approval-queue UX is a well-documented pattern across the researched competitor set.
- **Phase 5 (Visibility/Overlay):** Server-side authorization filtering is a standard security pattern; the specific pitfalls are already documented above.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core tooling (monorepo, API/ORM/WS choices) is HIGH-MEDIUM and cross-checked against live npm registry data; Phaser v4 and Claude Max-subscription billing terms are recent/policy-sensitive and cap overall confidence |
| Features | MEDIUM | Named competitors (Pixel Agents, DeskRPG) verified via direct repo reads (HIGH); broader ecosystem/HITL-pattern claims are web-search-synthesized across 2-3 sources (LOW-MEDIUM) |
| Architecture | MEDIUM | Structural shape (event sourcing, outbound-only worker connection, worktree-per-agent) is industry-standard and cross-checked across multiple independent sources; no single authoritative source for this exact combination |
| Pitfalls | MEDIUM | Cross-checked against official Twitch/Google/Anthropic docs and the actual pixel-agents-hq repo + credited asset pack (HIGH for those specifics); integration-specific claims are pattern-level, not verified against PixelFirm's own future code |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Claude Max-subscription billing risk:** Anthropic paused an announced billing change (mid-2026) that would move SDK/headless usage to a separate paid credit pool — re-verify this is still paused before scaling worker usage in Phase 2 planning.
- **Coolify's managed Postgres version:** STACK.md recommends Postgres 18.x but flags verifying Coolify's actual offering at infra setup time — confirm during Phase 1 planning.
- **Phaser 4 migration specifics:** Sourced from three official Phaser.io posts (LOW source-tier individually, but internally consistent) — worth a quick doc check at Phase 4 planning since it's a recent major-version jump.
- **Full asset audit for the Pixel Agents fork:** Only the character sprite pack is verified CC0; other bundled assets (tilesets, UI icons, sound) are unaudited — this needs to become a concrete checklist item in Phase 4, not deferred.
- **Twitch EventSub subscription cost budget:** total_cost/max_total_cost tracking wasn't scoped in detail — needs concrete budgeting once the specific event types for Phase 6 are chosen.

## Sources

### Primary (HIGH confidence)
- npm view (live registry) — exact current published versions for phaser, pixi.js, @twurple/eventsub-ws, @anthropic-ai/claude-agent-sdk, ws, fastify, drizzle-orm, googleapis, turbo, react, vite, zod
- pixel-agents-hq/pixel-agents (GitHub) — direct repo read, MIT license + MetroCity sprite credit confirmed
- MetroCity Free Topdown Character Pack (itch.io) — confirmed CC0 1.0 Universal
- Self-hosted environments — Claude Code Docs
- Handling WebSocket/Webhook Events — Twitch Developers
- YouTube Live Streaming API docs — developers.google.com
- .planning/PROJECT.md (PixelFirm project context)

### Secondary (MEDIUM confidence)
- Context7 /phaserjs/phaser, /websites/pixijs_8_x, /websites/code_claude_en_agent-sdk — API/renderer/SDK details, version metadata stale but cross-checked
- Event-driven architecture / event sourcing sources (Confluent, Event-Driven.io, Architecture Weekly) — architectural pattern validation
- Multiple orchestration-tool comparisons (Conductor, Claude Squad, Vibe Kanban, Maestro, Agent Kanban) — feature landscape

### Tertiary (LOW confidence)
- Web-search aggregated blog consensus: Turborepo vs Nx, ws vs Socket.IO, Drizzle vs Prisma, Fastify vs Hono comparisons
- Claude Max-subscription billing status (genaiunplugged.substack.com, techtimes.com) — flagged explicitly as a live policy risk, not settled fact

---
*Research completed: 2026-09-18*
*Ready for roadmap: yes*

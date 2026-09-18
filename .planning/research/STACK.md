# Stack Research

**Domain:** Event-driven pixel-art dev-team visualization / streaming control-plane (browser game renderer + Node.js worker driving Claude Code + Twitch/YouTube live integration)
**Researched:** 2026-09-18
**Confidence:** MEDIUM

Confidence is capped at MEDIUM overall because two load-bearing areas move fast and are policy-sensitive: Phaser's major-version jump (v3 → v4, stable since April 2026) and Anthropic's Claude Agent SDK / Max-subscription billing terms (an announced billing change was paused mid-2026 but is not guaranteed to stay paused). Everything else (monorepo tooling, API/ORM/WebSocket choices, Twitch/YouTube libraries) is HIGH-MEDIUM confidence, cross-checked against multiple 2026-dated sources.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Phaser | ^4.2 (stable since v4.1.0, Apr 2026) | Pixel office renderer: sprites, scenes, tilemaps, Arcade Physics, pathing | Phaser is a full game framework, not just a renderer — physics, tilemap collision, scene manager, animation, and pathfinding plugins ship in or bolt cleanly onto it. For a top-down office sim with NPCs walking desk-to-desk, that's most of the hard part solved for free. v4 is a ground-up WebGL renderer rewrite but keeps the v3 API for standard Sprite/Tilemap/Physics usage — low migration risk, and starting on v4 avoids inheriting v3's deprecated renderer. Pixel Agents (the fork target named in PROJECT.md) is itself Phaser-based, so this also matches the reuse mandate. |
| TypeScript | ^5.7 | Language across the whole stack | Already mandated by PROJECT.md constraints; also the native language of the Claude Agent SDK, Fastify, Drizzle, and Twurple — no cross-language glue needed anywhere in the stack. |
| Node.js | 22 LTS | Runtime for API, worker, WS gateway | Current Active LTS; required by `@anthropic-ai/claude-agent-sdk` and all chosen libraries. Avoid Node 24 (not yet LTS) for the control-plane/worker until it reaches LTS status. |
| PostgreSQL | 18.x | Company/event state, activity history | Current stable major (18.6 as of Aug 2026); PROJECT.md already mandates Postgres. No reason to pin to 17 unless Coolify's managed Postgres image lags — verify the Coolify Postgres service offering at infra setup time. |
| pnpm | ^9 | Package manager / workspace linking | Fastest installs, strict dependency resolution (catches phantom deps early — valuable in a multi-package monorepo with `apps/*` and `packages/*`), native workspace protocol that Turborepo is built to sit on top of. |
| Turborepo | ^2.10 | Monorepo task runner/cache | 2026 consensus for small teams (3-20 devs) on pure TS/JS: pnpm workspaces + Turborepo, not Nx. Turborepo (Vercel-owned, Rust engine since 2024) layers content-hash caching and task graphs on top of the workspace layout PROJECT.md already specifies (`apps/{web,api,stream-overlay,worker}`, `packages/*`) with near-zero config. Nx's generators/affected-detection/module-boundary enforcement solve problems a single-CEO personal project doesn't have yet. |
| Fastify | ^5.12 | Control-plane API framework | 2-3x Express throughput with built-in JSON-schema request/response validation and a plugin lifecycle that maps cleanly onto the monorepo's `packages/*` adapters (twitch-adapter, youtube-adapter, gsd-adapter each register as a Fastify plugin). Express is fine for legacy code but offers nothing this project needs; Hono's edge/multi-runtime strength is irrelevant since the control plane runs on one Coolify-hosted Node process. |
| Drizzle ORM | ^0.45 | Postgres access layer | TS-native schema (no codegen step), minimal runtime/bundle overhead, plain-SQL-shaped query builder — a good fit for an event-sourced-ish schema (companies/buildings/floors/agents/events) where you want full control over the SQL Postgres actually runs. Prisma is the safer pick only if the team using it grows and wants Prisma Studio's visual browser; not a driving need for a single-operator project. |
| ws | ^8.21 | WebSocket gateway (control-plane → pixel office / overlay / dashboard) | 2026 guidance: start with `ws` for a broadcast/fan-out topology (one control plane pushing company-state events to many browser subscribers) — leaner and higher-throughput than Socket.IO. Socket.IO's rooms/presence/auto-reconnect abstractions aren't needed when you already have a structured event schema and a single event bus; add Socket.IO later only if you need those specific abstractions. No Redis pub/sub needed unless the WS gateway is horizontally scaled — PROJECT.md explicitly defers Redis. |
| React | ^19.3 | Web app (CEO dashboard) and stream-overlay app | Matches PROJECT.md's mandated stack; React 19's use of Suspense/Actions is stable enough by 2026 to build the dashboard's approval-workflow UI without fighting the framework. |
| Vite | ^8 (with `@vitejs/plugin-react`) | Build tool for `apps/web` and `apps/stream-overlay` | Standard 2026 pairing with React; fast dev server matters for iterating on the stream-overlay's OBS Browser Source output, which you'll be visually checking constantly. |
| `@anthropic-ai/claude-agent-sdk` | ^0.3 (0.3.275 current) | Worker's controllable Claude Code session (ClaudeCodeRuntime) | This is the official, maintained way to drive Claude Code programmatically from TypeScript — not a bespoke subprocess wrapper around the CLI. It exposes exactly the primitives ClaudeCodeRuntime needs: `query()` async-iterator streaming, `resume`/`continue`/`InMemorySessionStore` for session resume, `agents` + the `Agent` tool for subagents, `PreToolUse`/`PostToolUse` hooks, `canUseTool` for CEO-gated permission interception, and `includePartialMessages` for streaming-JSON tool-input deltas (useful for live "typing" animation of what an agent is doing). Building this by hand by shelling out to `claude -p` and hand-parsing stdout would reimplement all of this worse. |
| Twurple (`@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws`) | ^8.2 | Twitch EventSub over WebSocket transport | The standard, actively maintained TS Twitch library in 2026. `@twurple/eventsub-ws` handles the EventSub WebSocket session lifecycle (welcome/keepalive/reconnect frames) that you'd otherwise hand-roll against Twitch's raw protocol; `@twurple/auth` handles the user-token refresh flow EventSub websocket subscriptions require. Covers every event type PROJECT.md lists (follow, sub, gifted sub, cheer, raid, channel-point redemption) as first-class typed events. |
| `googleapis` (`youtube` v3) | ^181 | YouTube Live chat/events | There is no YouTube equivalent of EventSub — live chat is polling-based via `liveChatMessages.list`, using the `pollingIntervalMillis` the API itself returns to pace requests. `googleapis` is Google's own generated TS client; no meaningful third-party alternative exists that isn't a thinner wrapper around the same REST surface. Budget quota: default 10,000 units/day, list calls are cheap, request a quota increase if the channel is high-traffic before this phase ships. |
| Zod | ^4.6 | Runtime validation for the shared event schema (`packages/event-schema`) | The Company Event Bus is the architectural seam every other component depends on (Claude Code/Git/CI/GSD → bus → state engine → office → overlay). Validating events at that seam with Zod schemas — shared as TS types across `apps/*` and `packages/*` via the monorepo — is what makes "never drifts from real state" enforceable in code, not just in intent. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `simple-git` or `execa` | latest | Worker: driving `git`, GSD CLI commands, build/test commands in a repo/worktree | `execa` for general subprocess control (better stdio/streaming ergonomics than Node's raw `child_process`); `simple-git` if you want a typed git porcelain instead of shelling out to `git` directly. Both are fine — pick one, don't use both. |
| `@fastify/websocket` | latest | If the WS gateway shares a process with the Fastify API | Only if you decide to co-locate the WebSocket gateway inside the API process rather than as its own `apps/*` service; otherwise run a standalone `ws` server as its own small Node process/Coolify resource per the monorepo layout (`apps/api` vs a dedicated WS gateway). |
| `pino` | latest (Fastify's default) | Structured logging across control plane + worker | Fastify ships Pino by default; reuse it in the worker too so control-plane and worker logs share one structured format — useful once you're correlating worker Claude Code sessions with control-plane events. |
| `Vitest` | latest | Unit/integration tests | Already mandated by PROJECT.md; pairs natively with Vite-built apps and works fine for the Node-only packages too. |
| `Playwright` | latest | E2E tests, including OBS Browser Source route (`/stream/...`) rendering checks | Already mandated by PROJECT.md; also your tool for verifying the stream-safe visibility filtering actually holds (screenshot/DOM-diff the stream route vs the internal dashboard route). |
| `dotenv` / `@fastify/env` | latest | Env/config loading, secrets | Standard; pair with Coolify's own env-var injection at deploy time rather than committing `.env` files. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker (multi-stage builds) | Packaging every `apps/*` service for Coolify | One multi-stage Dockerfile per deployable app (`apps/web`, `apps/api`, `apps/stream-overlay`), sharing a base stage for monorepo deps; build context at repo root so shared `packages/*` are reachable. Copy `package.json`/lockfiles before source to preserve Docker layer caching. Aggressive `.dockerignore` (exclude `node_modules`, other apps' build output) to keep build context small. |
| Coolify (Dockerfile build pack) | Deployment target for control plane | PROJECT.md already specifies this. Use Coolify's "Dockerfile" build pack (not Nixpacks) for predictable monorepo builds — Nixpacks' auto-detection fights monorepos with multiple deployable apps in one repo. Deploy `web`, `api`, `stream-overlay`, and Postgres as separate Coolify resources from the same git repo, each pointed at its own Dockerfile path. |
| Turborepo remote cache (self-hosted or Vercel) | Speeding up CI/local builds across the monorepo | Optional but cheap to add once the monorepo has more than 2-3 packages; skip for MVP, revisit if build times become annoying. |

## Installation

```bash
# Workspace root
pnpm init
pnpm add -D turbo typescript vitest @playwright/test

# apps/web, apps/stream-overlay (React + Vite)
pnpm --filter web add react react-dom
pnpm --filter web add -D vite @vitejs/plugin-react

# apps/api (Fastify control plane)
pnpm --filter api add fastify @fastify/websocket zod pino
pnpm --filter api add drizzle-orm pg
pnpm --filter api add -D drizzle-kit @types/pg

# apps/worker (Claude Code driver)
pnpm --filter worker add @anthropic-ai/claude-agent-sdk execa

# packages/twitch-adapter
pnpm --filter twitch-adapter add @twurple/auth @twurple/api @twurple/eventsub-ws

# packages/youtube-adapter
pnpm --filter youtube-adapter add googleapis

# packages/event-schema
pnpm --filter event-schema add zod

# apps/*/renderer (pixel office, Phaser)
pnpm --filter stream-overlay add phaser
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|--------------|-------------|--------------------------|
| Phaser 4 | PixiJS 8 | If you're confident you want to hand-build scene management, input, tilemap collision, and pathfinding yourself in exchange for PixiJS's leaner raw-renderer performance. Given PROJECT.md's reuse-Pixel-Agents mandate (a Phaser project), and that a top-down office sim needs exactly what Phaser ships out of the box, this isn't the right tradeoff here. |
| pnpm + Turborepo | Nx | If the team grows past ~10-20 contributors and you need enforced module boundaries, code generators, or affected-only CI across a much larger package graph. Not this project's shape today. |
| Fastify | Hono | If a service needs to run on Cloudflare Workers/edge/Bun rather than a long-running Coolify-hosted Node process. Nothing in PROJECT.md's deployment model needs edge runtimes. |
| Fastify | NestJS | If you want enforced DI/module structure for a larger engineering team. Adds ceremony a single-CEO personal project doesn't need. |
| Drizzle ORM | Prisma | If you want Prisma Studio's visual data browser or you're more comfortable with Prisma's higher-level API than writing closer-to-SQL Drizzle queries. Either is a legitimate choice; Drizzle is picked here for leanness, not because Prisma is wrong. |
| ws | Socket.IO | If you later need per-client rooms (e.g. per-floor or per-company WS namespaces once multi-floor rendering ships), presence tracking, or automatic reconnection out of the box, and don't want to build those primitives yourself on top of `ws`. |
| Twurple (`eventsub-ws`) | Raw Twitch EventSub WebSocket protocol by hand | Never, for this project — Twurple's session lifecycle handling (welcome/keepalive/reconnect) is exactly the kind of protocol plumbing not worth reimplementing. |
| `@anthropic-ai/claude-agent-sdk` | Shelling out to `claude -p --output-format stream-json` directly via `execa` and hand-parsing | Only if the SDK is missing a specific low-level control you need (unlikely — the SDK wraps this exact CLI interface) or if a future non-Claude `AgentRuntime` (Maestro/Codex) needs a common process-wrapper shape that the SDK's abstractions don't fit. Since AgentRuntime is meant to generalize across runtimes, it may be worth defining ClaudeCodeRuntime's internal contract so a future CodexRuntime could still shell out directly even though ClaudeCodeRuntime itself uses the SDK. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `ANTHROPIC_API_KEY` / direct Anthropic API billing for the worker | PROJECT.md hard-constrains this project to Claude MAX subscription auth only. As of Sept 2026, `@anthropic-ai/claude-agent-sdk` and `claude -p` authenticate via OAuth credentials at `~/.claude/` and draw from subscription usage limits, not API billing — this works today, but Anthropic announced (then paused, as of mid-2026) a billing change that would move SDK/headless usage to a separate paid credit pool. Treat this as a live risk to re-check before scaling worker usage, not a settled fact. |
| Phaser 3 for new code | Superseded by Phaser 4 (stable since April 2026) — a ground-up WebGL renderer rewrite that's still API-compatible for standard Sprite/Tilemap/Physics usage. Starting on 3 in 2026 means an unnecessary migration later; starting on 4 costs nothing extra for standard usage. | Phaser 4.x |
| Socket.IO as the default WS choice | Its framing/handshake overhead and abstraction layer (rooms, namespaces, auto-reconnect) solve problems this project doesn't have yet, at a throughput cost, for a straightforward one-to-many event broadcast (control plane → office/overlay/dashboard). | `ws`, add Socket.IO later only if rooms/presence become a real need |
| Nixpacks build pack on Coolify for this monorepo | Auto-detection struggles with multiple deployable apps sharing one repo and shared `packages/*` — you'll fight it more than you'll save time. | Coolify's Dockerfile build pack, one Dockerfile per deployable app |
| Redis | PROJECT.md explicitly defers this — don't introduce it speculatively for WS scaling or caching before there's a demonstrated need (single control-plane process, MVP scale). | Nothing — revisit only if/when horizontally scaling the WS gateway |
| YouTube "live chat websocket" libraries claiming push-based delivery | YouTube Live Streaming API has no websocket/push transport for chat — anything claiming otherwise is polling under the hood or unmaintained/misleading. | `googleapis` `youtube.liveChatMessages.list` polling loop, paced by the API's own `pollingIntervalMillis` |
| Hand-rolled Twitch EventSub WebSocket client | Twitch's EventSub WS protocol has real state-machine complexity (welcome message with session ID, keepalive timeout handling, reconnect message with a grace-period dual-connection swap) that's easy to get subtly wrong under real network conditions — exactly the kind of thing to not build yourself for a project whose actual value is elsewhere. | Twurple (`@twurple/eventsub-ws`) |

## Stack Patterns by Variant

**If OBS Browser Source performance becomes a concern at 1920x1080 with many animated sprites (multi-floor rendering later):**
- Use Phaser's `cacheAsTexture`-equivalent optimizations (static layer batching, spritesheet atlases, capped sprite counts per floor) and confirm the render target stays within Phaser's WebGL batching limits (batches of up to 16 textures depending on hardware).
- Because OBS Browser Source is effectively a headless Chromium render target — same performance rules as any WebGL canvas, but with zero user-facing tolerance for dropped frames on stream.

**If the WS gateway needs to scale beyond one Node process:**
- Add Redis pub/sub between `ws` server instances (each process subscribes to a Redis channel, republishes to its local clients).
- Because this is the point PROJECT.md's explicit Redis deferral stops applying — a single control-plane process is the stated MVP target.

**If a second AgentRuntime (Maestro/Codex/OpenCode) is added post-MVP:**
- Keep `@anthropic-ai/claude-agent-sdk` fully encapsulated inside `packages/claude-adapter`'s `ClaudeCodeRuntime` implementation; define the `AgentRuntime` interface (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff) in `packages/company-core` with zero SDK types leaking across the boundary.
- Because a future `CodexRuntime` will almost certainly need a different process-control shape (no equivalent TS SDK), and the interface needs to already be SDK-agnostic when that happens.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| Phaser 4.x | Vite ^5-8 | Phaser ships ESM builds; no special Vite config needed beyond standard asset handling for spritesheets/tilemaps. |
| `@anthropic-ai/claude-agent-sdk` ^0.3 | Node 18+ (Node 22 LTS recommended) | SDK shells out to the `claude` CLI under the hood on some code paths — verify the worker's target machine has Claude Code CLI installed and authenticated via `claude login` (Max subscription), not just the npm package installed. |
| Drizzle ORM ^0.45 | PostgreSQL 14-18, `pg` driver | No version friction; Drizzle tracks Postgres feature support closely. |
| Fastify ^5 | Node 20+ | Fastify 5 dropped Node 18 support — Node 22 LTS satisfies this comfortably. |
| Twurple ^8.2 | Node 18+, requires a Twitch user access token with EventSub-relevant scopes for WebSocket transport (not an app access token) | Confirm which scopes each subscribed event type needs (e.g. `channel:read:redemptions` for channel points) during the Twitch integration phase. |
| React 19 + Vite 8 | `@vitejs/plugin-react` matching major | Standard pairing, no known incompatibilities as of Sept 2026. |

## Sources

- Context7 `/phaserjs/phaser` — Arcade Physics, tilemap collision, scene management APIs (MEDIUM confidence; version metadata was stale, cross-checked against phaser.io news posts for the v4 release date)
- Context7 `/websites/pixijs_8_x` — cacheAsTexture, ParticleContainer, sprite batching performance guidance (MEDIUM confidence)
- Context7 `/websites/code_claude_en_agent-sdk` — `query()`, session resume/`InMemorySessionStore`, subagents, `PreToolUse`/`PostToolUse` hooks, `canUseTool`, streaming JSON tool-input deltas (MEDIUM confidence, official Anthropic docs source)
- phaser.io news: "Phaser v4 Release Candidate 7" (Mar 2026), "Phaser 3 vs Phaser 4" (May 2026), "Migrating from Phaser 3 to Phaser 4" (Apr 2026) — v4.1.0 stable release date, migration scope (LOW confidence per source tier, but internally consistent across three official posts)
- Web search: Phaser vs PixiJS comparisons (Medium, generalistprogrammer.com, dev.to) — architectural tradeoffs (LOW confidence, community sources, cross-checked across 4+ independent write-ups reaching the same conclusion)
- Web search: Turborepo vs Nx vs pnpm workspaces 2026 guides — monorepo tooling recommendation (LOW confidence, aggregated blog consensus)
- Web search: Coolify Dockerfile build pack docs + community monorepo deployment threads (coollabsio/coolify GitHub discussion #2716) — deployment pattern (LOW confidence)
- Web search: Claude Code Max subscription billing (genaiunplugged.substack.com, techtimes.com, Anthropic Help Center article "Use the Claude Agent SDK with your Claude plan") — subscription-vs-credit-pool billing status as of Sept 2026 (LOW confidence, policy area in flux — flagged as a risk, not a settled fact)
- Web search: Twurple official docs (twurple.js.org) + npm — EventSub WebSocket library (LOW-MEDIUM confidence, official project docs found via web search)
- Web search: YouTube Live Streaming API docs (developers.google.com) — `liveChatMessages.list`/`streamList`, quota costs (MEDIUM confidence, official Google docs found via web search)
- Web search: ws vs Socket.IO 2026 guides (velt.dev, pkgpulse.com) — WebSocket library recommendation (LOW confidence, aggregated blog consensus)
- Web search: Drizzle vs Prisma 2026 comparisons (bytebase.com, encore.dev, makerkit.dev) — ORM tradeoffs (LOW confidence, aggregated blog consensus, directionally consistent across sources)
- Web search: Fastify vs Hono vs Express 2026 benchmarks (fastify.dev/benchmarks, betterstack.com, encore.dev) — API framework recommendation (LOW-MEDIUM confidence, includes official Fastify benchmark data)
- `npm view` (registry, live query) — exact current published versions for phaser, pixi.js, @twurple/eventsub-ws, @twurple/auth, @anthropic-ai/claude-agent-sdk, ws, fastify, drizzle-orm, googleapis, turbo, react, vite, zod (HIGH confidence — live registry data, not training data)
- Web search: PostgreSQL version status (postgresql.org news, endoflife.date) — current stable major version 18.x (MEDIUM confidence, official project source)

---
*Stack research for: Pixel-art AI dev-team visualization / streaming orchestration control plane + worker*
*Researched: 2026-09-18*

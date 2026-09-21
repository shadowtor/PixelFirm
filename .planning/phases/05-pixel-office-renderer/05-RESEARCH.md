# Phase 5: Pixel Office Renderer - Research

**Researched:** 2026-09-21
**Domain:** Forking a real (non-Phaser) Canvas2D pixel-art office renderer to consume event-sourced company state; deterministic handoff choreography; AI/procedural sprite sourcing
**Confidence:** MEDIUM — the single most load-bearing prior assumption in this project's research (that the Pixel Agents fork is Phaser-based) is corrected here with direct, verbatim-quoted evidence from the fork's own source. Everything built on that correction (stack, pathfinding, project structure) is HIGH confidence for *what the fork actually contains*, MEDIUM for *how best to integrate it into PixelFirm's monorepo* (a judgment call, not yet proven in this codebase).

## Summary

**Correction to prior research — read this first.** `.planning/research/STACK.md` and `.planning/research/ARCHITECTURE.md` both assumed the Pixel Agents fork target (`pixel-agents-hq/pixel-agents`) is Phaser-based ("Pixel Agents ... is itself Phaser-based" — STACK.md, tagged there as a web-search-derived, uncited claim). This is **incorrect**. Directly fetching the fork's own `package.json`, `webview-ui/src/office/types.ts`, `webview-ui/src/office/engine/characters.ts`, `webview-ui/src/office/engine/gameLoop.ts`, and `webview-ui/src/office/layout/tileMap.ts` from GitHub confirms the fork is a **VS Code extension** (`"engines": {"vscode": "^1.105.0"}`, `"extensionKind": ["workspace"]`) whose webview UI is a hand-rolled **React 19 + Vite + raw Canvas 2D** rendering engine — no Phaser, no PixiJS, no game framework at all. It ships its own `requestAnimationFrame` game loop, its own grid-based BFS pathfinder (`findPath` in `tileMap.ts`), its own sprite cache, and its own tile/furniture/character rendering — all plain TypeScript over `CanvasRenderingContext2D`.

This changes the phase's foundational technical decision. Per PROJECT.md's explicit "fork/extend rather than rebuild" mandate, the correct move is **not** to introduce Phaser fresh (dropping STACK.md's Phaser ^4.2 recommendation and the EasyStar.js pathfinding-plugin option from 05-CONTEXT.md's Claude's Discretion) but to **fork the fork's actual Canvas2D engine modules** (`webview-ui/src/office/{engine,sprites,layout,types.ts,constants.ts}` plus the shared types in `core/src/schemas.ts`) into `packages/pixel-office`, strip the VS Code/hook-specific wiring (`server/`, `adapters/vscode/`), and drive the existing `Character` finite-state machine from PixelFirm's own Broadcast Hub event diffs instead of the fork's local Claude Code hook stream. This is a genuine simplification: one fewer major dependency, no v3→v4 Phaser migration risk, and direct reuse of a pathfinder that already does exactly what D-04's walk choreography needs.

A second correction: **the phase's target state count is 15, not 14.** PROJECT.md's and REQUIREMENTS.md's own AgentStatus list (`offline/idle/planning/researching/coding/reading/testing/reviewing/discussing/deploying/blocked/waiting_for_agent/waiting_for_ceo/failed/completed`) enumerates 15 distinct values when counted, not 14 — see Common Pitfalls below. 05-CONTEXT.md's D-01 ("literal 14:1 mapping") and the phase's Success Criteria both inherited the miscount.

A third finding, independently verified against this repo's own source (not the fork's): `agent.handoff_completed` **does not exist yet** in `packages/event-schema`'s 16-member discriminated union — only `agent.handoff_requested` was built in Phase 4, and its payload carries no `fromAgentId` at all. A browser-facing Broadcast Hub (WS fanout to `apps/web`/renderer clients) also does not exist yet — `apps/api/src/ws/` only handles worker connections. Both are must-build scope items for this phase, not integration details to skip past.

**Primary recommendation:** Fork the actual Canvas2D engine from `pixel-agents-hq/pixel-agents` (not Phaser) into `packages/pixel-office`; reuse its existing `findPath` BFS pathfinder unmodified for D-04's walk choreography; cover most of the 15-state gap via the fork's existing speech-bubble-icon overlay pattern (2 of the target states already have a near-exact bundled icon) rather than new hand-drawn or AI-generated character poses; stand up a minimal `apps/web` now (not a throwaway harness) that Phase 6 extends for the CEO dashboard; add `agent.handoff_completed` + a `fromAgentId` field to the event schema in this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AgentStatus → sprite/animation mapping | Frontend (packages/pixel-office, runs inside apps/web) | — | Pure rendering logic; must never compute status itself, only map an already-projected value (Anti-Pattern 1, ARCHITECTURE.md) |
| Office state subscription (WS client) | Frontend (apps/web) | API / Broadcast Hub (control plane) | Renderer is a pure consumer; the Broadcast Hub (does not exist yet — must be built this phase) owns fanout and diffing |
| Handoff choreography (walk/icon/accept sequence) | Frontend (packages/pixel-office) | API (event schema: `agent.handoff_completed`) | Animation timing must stay tied to real event pairs; the *existence* of the completing event is a backend/schema concern |
| `agent.handoff_completed` event + `fromAgentId` | API (packages/event-schema, packages/company-core reducer) | Worker (packages/claude-adapter, emits it) | New wire contract; must exist before the renderer can drive HANDOFF-01/02 off real signals |
| Pathfinding (walk-to-desk grid path) | Frontend (packages/pixel-office, forked `findPath`) | — | Pure client-side visual concern; no server involvement, matches the fork's existing architecture |
| Asset licence tracking | Repo-level (`references/ASSET-LICENSES.md`) | — | Documentation artifact, not a runtime tier |

## User Constraints

<user_constraints>
### Locked Decisions

- **D-01:** Every one of the 14 (see Common Pitfalls: actually 15) canonical `AgentStatus` values gets its own visually distinct animation (a literal mapping), not a grouped/shared-pose approach — the user explicitly chose full fidelity over the researched "5-6 native poses + overlay" recommendation. Reversible — the mapping table can be collapsed later without touching the interface contract.
- **D-02:** Sourcing the animations beyond the fork's native set, in this explicit priority order (triage, try each before falling back to the next): (1) check the fork/dependencies for already-existing unused animation states; (2) investigate AI-assisted pixel-art generation platforms — present findings before committing spend; (3) test whether procedural variation (tint/speed/effect layered on existing animations) reads acceptably distinct — a real fallback if it looks good; (4) only as a last resort, commission/hand-draw matching MetroCity's style. Must be tried top-down, no skipping ahead. Reversible per-tier.
- **D-03:** Blocked/waiting agent = icon overlay (distinct glyph per state — `waiting_for_agent` vs `waiting_for_ceo` get different icons) + frozen pose (idle-loop suppressed). Chosen over color-tint/glow because tints get lost on compressed stream video and don't stop the sprite reading as active. Reversible — additive to the D-01/D-02 mapping table.
- **D-04:** Handoffs use the full choreographed walk-to-desk sequence (stand up → walk to receiving agent → task icon appears → receiving agent accepts → return to idle/desk → receiving agent moves to their desk and starts work) — chosen over a cheaper icon-fade/transfer, accepting the added movement/pathfinding scope. Dialogue stays deterministic/template-based (HANDOFF-02), never LLM-generated — fixed, not open for reconsideration. Costly to reverse — collapsing back to icon-transfer later means removing a shipped movement system.
- **D-05:** Asset-licence audit is scoped to only what this phase's MVP actually wires in (one rendered floor, office layout, whichever animation assets D-02 lands on) — not every asset bundled with the fork. Unused assets are tracked as explicitly deferred in `references/ASSET-LICENSES.md`, re-audited when actually used or before commercial distribution. Reversible — expanding the audit later is additive.

### Claude's Discretion

- Which specific AI-assisted pixel-art generation platform/service to evaluate for D-02 tier 2 — present findings/options before committing spend or wiring generated art into the pipeline. (Addressed below: PixelLab, Retro Diffusion.)
- Exact pathfinding/movement mechanism for D-04 (e.g. Phaser pathfinding plugin, hand-rolled waypoint system, Arcade Physics) — pick whichever keeps the walk deterministically tied to real `agent.handoff_requested`/`agent.handoff_completed` event timing. **Moot as originally framed** — there is no Phaser in this codebase (see Summary). Addressed below: reuse the fork's own BFS `findPath`.
- Exact icon/glyph assets for D-03's per-state overlay — reuse a bundled icon if the fork ships one, otherwise source/create simple icons consistent with D-02's triage. (Addressed below: 2 of 3 already exist bundled.)
- Exact `references/ASSET-LICENSES.md` structure/format for D-05.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope (05-CONTEXT.md).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFFICE-01 | Renderer forked/extended (not rebuilt), one floor, agents' sprites/animations reflect current state across all AgentStatus values | Forked-engine identification (Summary), AgentStatus→pose mapping table (Code Examples), state-count correction (Common Pitfalls) |
| OFFICE-02 | Attribution and licence notices from the fork preserved | Package Legitimacy Audit + Asset licence findings (verified: only the MetroCity character pack is credited in the fork's own README; furniture/floor/wall/carpet/pet assets carry no separate credit) |
| OFFICE-03 | Blocked/waiting agents show a clear visual signal at a glance | D-03 icon-overlay mapping — `waiting_for_ceo`/`waiting_for_agent` reuse existing bundled bubble sprites almost verbatim; `blocked` needs one new glyph in the same format |
| HANDOFF-01 | Physical handoff: first agent walks over, task icon appears, second agent accepts and moves to work | Reused `findPath` BFS pathfinder (Architecture Patterns), missing `agent.handoff_completed`/`fromAgentId` schema gap (Common Pitfalls) |
| HANDOFF-02 | Handoff dialogue deterministic/template-based, never LLM-generated at render time | Existing bubble-sprite JSON pattern extends cleanly to canned dialogue/icon templates — no LLM call path exists anywhere in the forked render code |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| React | ^19.3 (matches fork's `^19.2.5`, project's existing STACK.md pin) | `apps/web` shell + forked office UI components | Already the project's mandated web framework; the fork's own webview UI is React 19, so forking it in is a version-compatible lift, not a rewrite |
| Vite | ^8 (fork uses `^8.0.8`, matching project's STACK.md pin) | Build tool for `apps/web` hosting the renderer | Already mandated; the fork's own `webview-ui` build is Vite, so its build config largely transplants |
| Canvas 2D (native browser API) | — (no package) | Actual sprite/tile/character rendering | This is what the fork uses — `ctx.imageSmoothingEnabled = false` + `requestAnimationFrame` loop in `gameLoop.ts` [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/engine/gameLoop.ts — `const ctx = canvas.getContext('2d')!;` / `ctx.imageSmoothingEnabled = false;`]. No rendering library needed at all. |
| TypeScript | ^5.7 (fork uses `^5.9.3`) | Language | Already mandated; fork is TS throughout |
| `ws` | ^8.21 (already in STACK.md) | Browser-facing Broadcast Hub fanout (new — does not exist yet) | Already the project's chosen WS library on the control-plane side (`apps/api`); extending it to a second, browser-facing route is additive, not a new dependency |

### Explicitly NOT adopted this phase (correcting STACK.md)

| Library | STACK.md said | This research found |
|---------|---------------|----------------------|
| Phaser ^4.2 | "Pixel Agents ... is itself Phaser-based" [was tagged MEDIUM/uncited web-search claim in STACK.md] | **False.** [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/package.json — no `phaser` in `dependencies`/`devDependencies`; `"engines": {"vscode": "^1.105.0"}`, `"extensionKind": ["workspace"]`]. Do not add Phaser to `packages/pixel-office`. If a later phase (e.g. progression/multi-floor) independently justifies a game framework, that is a fresh decision, not a continuation of this one. |
| EasyStar.js (Claude's Discretion example, 05-CONTEXT.md) | Suggested as "a Phaser pathfinding plugin like EasyStar.js" | Moot — no Phaser scene graph to plug it into. The fork already ships an equivalent, purpose-fit grid pathfinder (`findPath`, `tileMap.ts`) — reuse it (see Architecture Patterns). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pngjs` | ^7.0.0 (fork's own pin) | Decoding bundled character/furniture PNG sprite sheets into pixel-array `SpriteData` at build/load time | Only if forking the fork's own asset-loading pipeline (`core/src/assets/pngDecoder.ts`) verbatim — otherwise Canvas `drawImage` can consume PNGs directly at runtime without a decode step; evaluate during implementation whether the fork's pixel-array approach (which enables its hue/palette-shift colorization) is worth the extra dependency, or whether `apps/web` can draw PNGs directly and skip per-agent recoloring for the MVP |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Forking the Canvas2D engine | Building fresh on Phaser 4 (STACK.md's original plan) | Violates PROJECT.md's explicit "fork/extend rather than rebuild the pixel office renderer, movement, characters and office system" directive; also throws away a working, tested pathfinder/state-machine/sprite-cache for no verified benefit — reject |
| Reusing the fork's BFS `findPath` | A weighted A* implementation | The office grid is small (`DEFAULT_COLS`/`DEFAULT_ROWS` = 20×11, `MAX_COLS`/`MAX_ROWS` = 64×64 [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/constants.ts]) — unweighted BFS is already the fork's own production choice at this scale; A* only pays off with weighted terrain, which this office model doesn't have |
| Icon-overlay reuse for most of the 15-state gap | Full AI-generated or hand-commissioned frame per missing state | Per D-02's own tier order, icon overlay is the cheapest tier that "reads as visually distinct" and should be exhausted before spending on tier 2/4 — see Code Examples for the concrete per-state mapping |

**Installation:** No new runtime dependencies for the core renderer this phase. `apps/web` needs scaffolding (`pnpm --filter web add react react-dom` / `pnpm --filter web add -D vite @vitejs/plugin-react`, per STACK.md's existing installation block — this workspace does not exist yet, confirmed via `ls apps/` returning only `api` and `worker`).

**Version verification:** Not run against the live npm registry this session (no new packages recommended). If `pngjs` is adopted, verify `npm view pngjs version` at implementation time — fork pins `^7.0.0`.

## Package Legitimacy Audit

No new external runtime packages are recommended by this research. The renderer is sourced by **forking code** from `pixel-agents-hq/pixel-agents` (copying specific TypeScript modules into `packages/pixel-office`, per PROJECT.md's fork/extend directive), not by `npm install`-ing it as a dependency — the published `pixel-agents` npm package is a VS Code extension CLI [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/package.json — `"bin": {"pixel-agents": "./dist/cli.js"}`], not a library API PixelFirm would import.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none recommended) | — | — | — | — | — | N/A |

**If D-02 tier 2 (AI-assisted generation) is pursued and a client SDK/npm package is chosen for PixelLab or Retro Diffusion integration**, that package must be run through `gsd_run query package-legitimacy check` at that time — this research only evaluated the services' web-facing pricing/licensing (see Architecture Patterns → AI-Assisted Generation Options), not any specific npm client. Gate behind a `checkpoint:human-verify` task before any spend.

## Architecture Patterns

### System Architecture Diagram

```
Broadcast Hub (control plane, apps/api — browser-facing WS route, DOES NOT EXIST YET)
    │  visibility-filtered projection diffs (AgentState, TaskState, handoff pairs)
    ▼
apps/web (new — Vite + React shell, minimal for this phase)
    │  mounts <OfficeCanvas/> from packages/pixel-office
    ▼
packages/pixel-office (forked Canvas2D engine)
    ├── engine/officeState.ts    — office-wide state (tiles, seats, agents, pets)
    ├── engine/characters.ts     — per-agent Character FSM (state, dir, path, frame)
    ├── engine/gameLoop.ts       — requestAnimationFrame update/render loop
    ├── engine/renderer.ts       — draws tiles → furniture → characters → bubbles, z-sorted
    ├── layout/tileMap.ts        — grid + findPath (BFS pathfinder, reused unmodified)
    ├── sprites/spriteData.ts    — CharacterSprites (walk/typing/reading × 4 directions)
    ├── sprites/*.json           — bubble-permission.json, bubble-waiting.json (icon overlays)
    └── types.ts, constants.ts   — CharacterState, Direction, TileType, frame timings
         │
         │  status/handoff mapping (NEW — this phase's actual work)
         ▼
    AgentStatus (15 values, packages/event-schema — NEW type, does not exist yet)
         ▲
         │  reducer maps: agent.online / task.status_changed / gsd.phase_observed /
         │  agent.handoff_requested / agent.handoff_completed (NEW event) → AgentStatus
    packages/company-core/src/reducer.ts (extend, additive per existing pattern)
```

A reader tracing "developer finishes work, hands off to reviewer" follows: `ClaudeCodeRuntime.requestHandoff()` (Phase 4, exists) → `agent.handoff_requested` event → (NEW: some producer emits `agent.handoff_completed` once the receiving agent's `AgentRuntime` actually picks up the task) → reducer updates both agents' `AgentState.status` → Broadcast Hub diffs the projection → `apps/web`'s WS client receives the diff → `packages/pixel-office` maps the new statuses onto `Character.state`/`bubbleType`/`path`, and `findPath` computes the walk route to animate.

### Recommended Project Structure

```
apps/
├── web/                        # NEW this phase — minimal Vite+React shell
│   └── src/
│       ├── ws-client.ts        # browser-facing WS subscription to Broadcast Hub
│       └── App.tsx             # mounts <OfficeCanvas/>
packages/
├── pixel-office/                # NEW this phase — forked from pixel-agents-hq/pixel-agents
│   └── src/
│       ├── engine/              # forked verbatim where possible: officeState, characters,
│       │                        # gameLoop, renderer, seatPlacement, petEntity
│       ├── layout/               # forked verbatim: tileMap.ts (findPath), furnitureCatalog
│       ├── sprites/              # forked verbatim: spriteData.ts, bubble-*.json, spriteCache
│       ├── status/               # NEW — AgentStatus → CharacterState/bubbleType mapping
│       │                        # (the actual net-new logic this phase writes)
│       ├── handoff/              # NEW — walk-to-desk choreography driven by
│       │                        # agent.handoff_requested/completed event pairs
│       └── types.ts, constants.ts  # forked verbatim
```

### Pattern 1: Reuse the fork's existing grid BFS pathfinder for D-04

**What:** `findPath(startCol, startRow, endCol, endRow, tileMap, blockedTiles)` — a plain breadth-first search over 4-directional grid neighbors, already used by the fork's own idle-wander and seat-return logic.

**When to use:** Any time an agent needs to walk from its current tile to a target tile (its desk, another agent's desk for a handoff, the CEO office in a later phase) — this is exactly D-04's requirement.

**Example:**
```typescript
// Source: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/layout/tileMap.ts
export function findPath(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  tileMap: TileType[][],
  blockedTiles: Set<string>,
): Array<{ col: number; row: number }> {
  if (startCol === endCol && startRow === endRow) return [];
  // ... BFS over 4-directional neighbors (up/down/left/right), returns
  // reconstructed path as an ordered array of {col, row} tile coordinates
}
```
Driving a handoff walk is then: on `agent.handoff_requested`, set `Character.state = WALK`, `Character.path = findPath(fromAgent.tileCol, fromAgent.tileRow, toAgent.seatCol, toAgent.seatRow, ...)`; on path completion, show the task icon bubble; on `agent.handoff_completed`, transition the receiving agent's `Character.state` back to `TYPE` at their own seat. This is the same `IDLE → findPath → WALK → arrive → TYPE` cycle the fork already runs for its own seat-return behavior [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/engine/characters.ts — the `CharacterState.IDLE` case's wander-return branch calls `findPath(...)` then sets `ch.state = CharacterState.WALK`].

### Pattern 2: AgentStatus → visual mapping — exhaust icon-overlay reuse before new art (D-02 tiers 1 and 3, reframed)

**What:** D-02 tier 1 asked whether the fork ships unused animation states. It does not — verified: the fork's entire animatable vocabulary is `CharacterState = { IDLE: 'idle', WALK: 'walk', TYPE: 'type' }` [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/types.ts — `export const CharacterState = { IDLE: 'idle', WALK: 'walk', TYPE: 'type' } as const;`], plus a `TYPE`-state variant selected by `currentTool` (typing vs. reading frames), plus two speech-bubble overlays: `bubbleType: 'permission' | 'waiting' | null` [VERIFIED: same file — `bubbleType: 'permission' | 'waiting' | null;`]. That is 4 visual primitives total (idle, walk, typing, reading) plus 2 overlays — fewer than STACK.md's guessed "5-6 native poses," and every one is already wired up and in active use (no unused states to reclaim). Tier 1 is exhausted quickly and comes up shorter than the discretion assumed.

D-02 tier 3 ("procedural variation... tint/speed/effect") needs one correction before use: **hue/tint is already claimed.** `Character.hueShift` + `Character.palette` drive per-agent identity coloring via `adjustSprite()`/`colorizeSprite()` [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/colorize.ts — `colorizeSprite(sprite, color)` / `adjustSprite(sprite, color)`, both keyed by `ColorValue{h,s,b,c}`]. Reusing tint to signal *state* would visually collide with each agent's own identity color — reject tint-based state signaling for this fork.

What *does* work, and is the actual recommendation: the fork's **speech-bubble overlay pattern** is a pixel-array-plus-palette JSON asset (11×13px) rendered above the character regardless of its base pose [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/sprites/spriteData.ts — `BUBBLE_PERMISSION_SPRITE`, `BUBBLE_WAITING_SPRITE` both resolved from `{palette, pixels}` JSON via `resolveBubbleSprite()`]. Two of the 15 target states already have a near-exact semantic match bundled: `bubbleType: 'permission'` ("white square with '...' in amber, and a tail pointer" per the source comment) maps almost verbatim onto `waiting_for_ceo`; `bubbleType: 'waiting'` ("white square with green checkmark") maps onto `waiting_for_agent`/turn-complete semantics. Extending this same JSON format with new glyphs (`blocked`, `failed`, `completed`, and simple badge icons for `planning`/`researching`/`testing`/`reviewing`/`discussing`/`deploying`) is far cheaper than tier 2 (AI generation, real spend) or tier 4 (commissioned art), reads as visually distinct per D-01's requirement, and reuses an existing, already-tested rendering code path — no new engine code, only new small JSON assets.

**Concrete per-state disposition** (15 states — see Common Pitfalls for the count correction):

| AgentStatus | Base pose | Overlay/treatment | Sourcing tier |
|---|---|---|---|
| idle | `IDLE` | none | Tier 1 — direct reuse |
| coding | `TYPE` (typing frames) | none | Tier 1 — direct reuse |
| reading | `TYPE` (reading frames, `currentTool` selects) | none | Tier 1 — direct reuse |
| waiting_for_ceo | `IDLE` (frozen, D-03) | existing `bubbleType: 'permission'` | Tier 1 — direct reuse, near-verbatim semantic match |
| waiting_for_agent | `IDLE` (frozen, D-03) | existing `bubbleType: 'waiting'` | Tier 1 — direct reuse |
| offline | not rendered / removed from floor | existing `matrixEffect: 'despawn'` one-shot on transition | Tier 1 — direct reuse of existing connect/disconnect effect |
| blocked | `IDLE` (frozen, D-03) | NEW bubble glyph (same JSON format) | Tier 3 — new icon in existing pattern, no new engine code |
| failed | `IDLE` | NEW bubble glyph | Tier 3 — same |
| completed | `IDLE` | NEW bubble glyph | Tier 3 — same |
| planning | `TYPE` or `IDLE` + NEW badge glyph | NEW bubble glyph | Tier 3 — same |
| researching | `TYPE` (reading frames) + NEW badge glyph | NEW bubble glyph | Tier 3 — same |
| testing | `TYPE` + NEW badge glyph | NEW bubble glyph | Tier 3 — same |
| reviewing | `TYPE` (reading frames) + NEW badge glyph | NEW bubble glyph | Tier 3 — same |
| discussing | `TYPE` + NEW badge glyph | NEW bubble glyph | Tier 3 — same |
| deploying | `TYPE` (speed-up frame timer as the one legitimate procedural variation — animation speed, not tint) + NEW badge glyph | NEW bubble glyph | Tier 3 — same, plus frame-timer variation |

This leaves **zero states requiring tier 2 (AI-generation) or tier 4 (commissioned art)** to satisfy D-01's "visually distinct at a glance" bar, provided icon-badge-on-existing-pose is accepted as sufficiently distinct — which it should be, since D-03 already established icon-overlay as the project's answer to the harder "distinguishable at a glance on compressed stream video" problem. **This is a recommendation, not a locked decision** — present it to the user before implementation, since it revises D-02's expected sourcing path (tiers 2/4 likely unnecessary) even though it stays within D-02's own tier ordering (tier 1 → tier 3 chosen over tier 2, exactly as the triage instructs when an earlier tier suffices).

### Pattern 3: AI-Assisted Generation Options (D-02 tier 2 — presented per user's requirement, not adopted above)

Findings only, since D-02 explicitly requires presenting tier 2 options before any spend, even if Pattern 2 makes tier 2 unnecessary for the MVP:

| Service | Pricing | Commercial licence | Style-matching to MetroCity | Confidence |
|---|---|---|---|---|
| PixelLab | Free trial (40 fast + 5 daily slow generations, ≤200×200px); "Pixel Apprentice" $12/mo for ≤320×320px + animation tools + map generation [CITED: knowara.com, flowtools.co — aggregator reviews, not PixelLab's own pricing page] | Commercial rights included on paid tiers; cannot use output to train a separate model [CITED: same] | Unverified — no LoRA/style-training feature reported for matching an existing 16×16 palette; would need manual trial | LOW — not verified against PixelLab's own docs this session |
| Retro Diffusion | Pay-per-generation from a prepaid balance, ~$0.015/image on the website; one-time Aseprite-extension purchase for local generation [CITED: aiindigo.com, gamedevaihub.com — aggregator reviews] | Commercial usage rights on paid/premium plans; generated output is the user's for personal and commercial use [CITED: same] | Ships walk/run/idle animation-cycle generation (GIF/spritesheet) — closer fit for character animation frames than a generic image model, but still not proven against MetroCity's specific palette | LOW — not verified against Retro Diffusion's own pricing/ToS page this session |

**Recommendation if tier 2 is pursued despite Pattern 2's finding:** Retro Diffusion's native walk/run/idle animation-cycle output is the better fit for character *animation frames* specifically (vs. PixelLab's more general sprite-sheet/skeleton tooling) — but confirm current pricing/ToS directly with the user before any spend, per D-02's explicit instruction, since both figures above are aggregator-sourced, not fetched from the vendors' own pages this session.

### Pattern 4: Standing up `apps/web` now, not a throwaway harness

**What:** ARCHITECTURE.md assigns `apps/web` to the Phase 6 CEO dashboard. `apps/web` does not exist yet (`ls apps/` returns only `api`, `worker`). CONTEXT.md leaves it open whether Phase 5 stands up a minimal real `apps/web` or a temporary dev harness.

**Recommendation:** Stand up a minimal real `apps/web` now — a bare Vite+React shell with one route that mounts `<OfficeCanvas/>` and a WS client subscribing to the (also-new-this-phase) browser-facing Broadcast Hub route. Phase 6 then *extends* this same app with dashboard/approval routes rather than building `apps/web` from scratch or migrating off a throwaway harness. This is the smaller total diff across both phases and matches the fork's own structure (its `webview-ui` is exactly this shape: one React app, one canvas-mounting root component).

### Anti-Patterns to Avoid

- **Assuming the fork's rendering stack without checking:** STACK.md's Phaser assumption propagated into 05-CONTEXT.md's Claude's Discretion (EasyStar.js) without anyone opening the fork's actual source. Verify framework/dependency claims about a specific external repo by fetching its `package.json`/source directly, not by web-searching descriptions of it.
- **Using hue/tint for AgentStatus signaling in this fork:** collides with the existing per-agent identity color system (`palette`/`hueShift`). Use the bubble-overlay pattern instead (Pattern 2).
- **Wiring the renderer to poll `company-core` projections directly instead of subscribing via the Broadcast Hub:** this is ARCHITECTURE.md's Anti-Pattern 1, restated here because it is the single most likely mistake once a working Canvas2D loop exists and it's tempting to fetch state on a timer instead of building the (more work, but correct) WS diff-subscription path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Grid pathfinding for walk-to-desk | A* or a new pathfinding plugin | The fork's existing `findPath` BFS (`tileMap.ts`) | Already correct at this office's scale (BFS is the fork's own production choice at 20×11 up to 64×64 tiles), already tested against the fork's own wander/seat-return behavior |
| Character animation frame timing / sprite caching | A new animation-state machine | The fork's existing `Character` struct + `gameLoop.ts` update/render split + `spriteCache` | Handles direction (4-way), frame-timer accumulation, and colorized-sprite caching already; rebuilding it duplicates working code the fork's own team maintains |
| Per-agent identity color | A new recoloring system | The fork's existing `palette`/`hueShift` + `colorize.ts` (`adjustSprite`/`colorizeSprite`) | Already solves "distinguish agent A from agent B visually" — do not conflate with state-signaling (see Anti-Patterns) |

**Key insight:** Everything this phase needs for movement, timing, and per-agent visual identity already exists in the fork and is being needlessly re-researched/re-decided as if it needed a fresh technology choice (Phaser, EasyStar.js). The actual net-new work is narrower than it looks: (1) a status-mapping layer (AgentStatus → the fork's existing primitives), (2) a handful of new bubble-icon JSON assets, (3) the handoff event-schema gap, (4) the Broadcast Hub browser route. None of these require new rendering infrastructure.

## Common Pitfalls

### Pitfall 1: The "14 canonical AgentStatus values" count is wrong — it's 15

**What goes wrong:** D-01 says "a literal 14:1 mapping." Counting PROJECT.md's own Agent States list and REQUIREMENTS.md's OFFICE-01 text yields 15 distinct values: `offline, idle, planning, researching, coding, reading, testing, reviewing, discussing, deploying, blocked, waiting_for_agent, waiting_for_ceo, failed, completed` [VERIFIED: F:/Sidegigs/PixelFirm/.planning/REQUIREMENTS.md:31 — "...(offline/idle/planning/researching/coding/reading/testing/reviewing/discussing/deploying/blocked/waiting_for_agent/waiting_for_ceo/failed/completed)"; F:/Sidegigs/PixelFirm/.planning/PROJECT.md:429-443 — same 15 values, one per bullet line]. Building a literal "14-value enum" would either silently drop one canonical status or force an off-by-one bug into the mapping table.

**Why it happens:** The miscount originated somewhere before 05-CONTEXT.md (it already says "14" in the Phase Boundary text) and was carried through discuss-phase into a locked decision without anyone re-counting the source list.

**How to avoid:** Define the `AgentStatus` union type in this phase with exactly the 15 values quoted above, cross-checked against PROJECT.md and REQUIREMENTS.md directly (not against 05-CONTEXT.md's "14" framing). Flag the discrepancy to the user during planning — D-01's mapping-table design is unaffected (still 1:1, just 15 rows not 14), so this is a low-risk correction, not a design change.

**Warning signs:** Any code or doc that hardcodes `AgentStatus` as a 14-member type; any test asserting `Object.keys(AgentStatus).length === 14`.

### Pitfall 2: `agent.handoff_completed` does not exist; `agent.handoff_requested` carries no `fromAgentId`

**What goes wrong:** HANDOFF-01/02 requires animating *both* the sending and receiving agent, gated on *both* a request and a completion event. Neither exists in a form that supports this today.

**Why it happens:** Phase 4 built `requestHandoff` as observation-only (04-CONTEXT.md D-08: "posts `agent.handoff_requested` but never alters the task's own `AgentTaskStatus`, since no second agent exists yet in Phase 4 to receive control") — correctly scoped to Phase 4's boundary, but it leaves two real gaps for Phase 5. Verified directly against the schema and its only producer:
- `packages/event-schema/src/payloads/index.ts:10` — `const AgentHandoffRequestedPayload = z.object({ taskId: z.string(), toAgentId: z.string() });` — no `fromAgentId` field.
- `packages/event-schema/src/payloads/index.ts:77-98` — the 16-member `CompanyEventSchema` discriminated union has no `agent.handoff_completed` literal.
- `packages/claude-adapter/src/claude-code-runtime.ts:91-97` and `packages/claude-adapter/src/event-emitter.ts:12-29` — `requestHandoff`'s `buildEnvelope(options.companyId, "agent.handoff_requested", { taskId, toAgentId }, taskId)` call never sets `sourceAgentId`/`destinationAgentId` on the envelope either, even though `BaseEnvelope` has both fields available (`packages/event-schema/src/envelope.ts:16-17` — `sourceAgentId: z.string().optional(), destinationAgentId: z.string().optional(),`).

**How to avoid:** This phase must (1) add `fromAgentId` to `AgentHandoffRequestedPayload` (or start populating envelope `sourceAgentId`/`destinationAgentId` and have the reducer/renderer read those instead — either works, pick one consistently), and (2) add a new `agent.handoff_completed` event type to the union (additive, per the established `.spread()` pattern — "composed via spread, never chained `.extend()`" per the file's own header comment) plus a producer that emits it once the receiving `AgentRuntime` actually starts the handed-off task.

**Warning signs:** Handoff animation code that can find "who is receiving" but not "who is sending," or that has no event to transition out of the "walking with task icon" animation state.

### Pitfall 3: No browser-facing Broadcast Hub exists yet

**What goes wrong:** ARCHITECTURE.md's diagram shows `Broadcast Hub → Pixel Office`. Checking `apps/api/src/ws/` finds only `connection-status.ts` (worker liveness tracking) and `apps/api/src/routes/ws.ts` (worker-only WS route, `preValidation: authenticateWorker`). There is no route, auth scheme, or diff-fanout mechanism for a *browser* client to subscribe to projection state.

**Why it happens:** Phases 1-4 only needed the worker→control-plane direction. The reverse direction (control-plane→browser) was architecturally planned but never built.

**How to avoid:** Treat "build a minimal browser-facing WS broadcast route + auth" as in-scope, must-plan work for this phase, not an assumed-already-present integration point. It does not need Phase 7's visibility filtering yet (SAFE-01/02 are explicitly out of scope for this phase per 05-CONTEXT.md) — an unfiltered INTERNAL-tier feed is acceptable for this phase's MVP, same trust boundary as the existing worker connection.

**Warning signs:** A plan task that says "subscribe `apps/web` to the Broadcast Hub" without a corresponding task to build the Broadcast Hub's browser-facing side first.

### Pitfall 4: Office-layout and furniture/floor/wall/carpet/pet assets have no documented licence source, only the character pack does

**What goes wrong:** D-05 requires "real findings, not assumptions" about asset licensing beyond the confirmed-CC0 MetroCity character pack. The fork's own README credits only the characters: *"Diverse characters — 6 diverse characters. These are based on the amazing work of [JIK-A-4, Metro City]"* [VERIFIED: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/README.md:48]. Furniture, floors, walls, carpets, and pets (`webview-ui/public/assets/{furniture,floors,walls,carpets,pets}/`) have **no separate attribution anywhere in the README** — the README's only other asset mention is *"Bundled furniture, floors, walls, carpets, characters, and pets live under `webview-ui/public/assets/`"* [VERIFIED: same README:138], with no source credited.

**Why it happens:** Exactly PITFALLS.md's Pitfall 1 pattern — a repo-level MIT licence is easy to assume covers every bundled binary asset, but only the explicitly-credited character pack is confirmed third-party (CC0). The furniture/floor/wall/carpet/pet assets are undocumented — they may be originally authored by the fork's maintainer (in which case the repo's MIT licence genuinely does cover them) or may be adapted from an uncredited source; nothing in the repo settles this either way.

**How to avoid:** Per D-05's own scoping, record this as an explicit, honest finding in `references/ASSET-LICENSES.md`: character sprites = CC0 (confirmed, credited); furniture/floor/wall/carpet/pet assets used by the one rendered floor and office layout = provenance undocumented in the fork, treated as MIT-covered by default (no contrary evidence found) but flagged for a stronger check before commercial distribution, consistent with PROJECT.md's existing "audit before commercial distribution" note. Do not silently upgrade "no credit found" to "confirmed original" — that is exactly the unverified leap PITFALLS.md warns against.

**Warning signs:** `references/ASSET-LICENSES.md` listing furniture/floor/wall assets as "MIT, confirmed" without noting the absence of any credit trail.

## Code Examples

### AgentStatus type definition (net-new this phase)

```typescript
// packages/event-schema or packages/company-core — does not exist yet, write it here.
// 15 values (see Common Pitfalls — not 14), matching the verbatim lists in
// PROJECT.md:429-443 and REQUIREMENTS.md:31.
export const AgentStatus = {
  OFFLINE: "offline",
  IDLE: "idle",
  PLANNING: "planning",
  RESEARCHING: "researching",
  CODING: "coding",
  READING: "reading",
  TESTING: "testing",
  REVIEWING: "reviewing",
  DISCUSSING: "discussing",
  DEPLOYING: "deploying",
  BLOCKED: "blocked",
  WAITING_FOR_AGENT: "waiting_for_agent",
  WAITING_FOR_CEO: "waiting_for_ceo",
  FAILED: "failed",
  COMPLETED: "completed",
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];
```

### Bubble-icon overlay JSON format (extend for new states, D-03/Pattern 2)

```json
// Source pattern: raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/sprites/bubble-waiting.json
// New icon glyphs (e.g. "bubble-blocked.json") follow the same 11x13 palette+pixels shape:
{
  "palette": { "0": "#ffffff", "1": "#ff0000" },
  "pixels": [["0","0","1","1","0","0","0","0","0","0","0"], "... 13 rows total"]
}
```

### Event schema additions (Pitfall 2 fix)

```typescript
// packages/event-schema/src/payloads/index.ts — additive, appended after member 16,
// never reordered (established pattern, see file header comment).
const AgentHandoffRequestedPayload = z.object({
  taskId: z.string(),
  fromAgentId: z.string(), // NEW
  toAgentId: z.string(),
});
const AgentHandoffCompletedPayload = z.object({ taskId: z.string(), toAgentId: z.string() }); // NEW

// ...appended to CompanyEventSchema's discriminatedUnion array:
z.object({ ...BaseEnvelope.shape, type: z.literal("agent.handoff_completed"), payload: AgentHandoffCompletedPayload }),
```

## State of the Art

| Old Approach (05-CONTEXT.md's inherited assumption) | Current Approach (this research) | When Changed | Impact |
|---|---|---|---|
| Phaser 4 + EasyStar.js/Arcade Physics for the office renderer | Fork the pixel-agents-hq Canvas2D engine directly, reuse its own BFS `findPath` | This research session (2026-09-21) | Drops a major dependency, removes v3→v4 Phaser migration risk STACK.md itself flagged, and is a truer reading of PROJECT.md's "fork/extend, not rebuild" mandate |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Recommending icon-overlay reuse (Pattern 2) over AI-generation (tier 2) for most of the 15-state gap is presented as a recommendation, not confirmed with the user | Architecture Patterns → Pattern 2 | If the user actually wants richer per-state poses (not just icon badges), tiers 2/4 may still be needed for some states — low risk since D-02's own tier order permits stopping early only when an earlier tier "reads acceptably," which is a judgment call the user should confirm |
| A2 | PixelLab/Retro Diffusion pricing and licensing figures are aggregator-sourced (knowara.com, flowtools.co, aiindigo.com, gamedevaihub.com), not fetched from the vendors' own pricing/ToS pages this session | Architecture Patterns → Pattern 3 | Pricing or licence terms may have changed or be imprecisely summarized by the aggregator; verify directly with the vendor before any spend, as D-02 itself requires |
| A3 | Furniture/floor/wall/carpet/pet assets are treated as "MIT-covered by default, provenance undocumented" rather than confirmed original work by the fork's maintainer | Common Pitfalls → Pitfall 4 | If these assets were in fact adapted from an uncredited third-party pack, the repo's MIT licence would not actually cover them — same risk class as PITFALLS.md's Pitfall 1 describes generally; D-05 already scopes the fix (re-audit before commercial distribution) |
| A4 | Recommending `apps/web` be stood up now (real, minimal) rather than a throwaway harness | Architecture Patterns → Pattern 4 | If Phase 6's actual dashboard needs a substantially different app shell, the minimal shell built here may need rework rather than pure extension — low risk, both are Vite+React and the fork's own structure supports this shape |

## Open Questions (RESOLVED at planning time)

1. **Should `fromAgentId` be a new payload field or should the existing (currently-unused) `sourceAgentId`/`destinationAgentId` envelope fields be populated instead for handoff events?**
   - What we know: `BaseEnvelope` already has both fields, optional, unused by any current producer.
   - What's unclear: Whether other event types should start using them too (broader consistency question beyond this phase's scope) or whether handoff-specific payload fields are cleaner.
   - Recommendation: Planner's call — either satisfies HANDOFF-01, but populating the existing envelope fields is slightly more consistent with the schema's own design intent (the fields exist precisely for this "who sent, who received" case) and avoids adding a payload field that duplicates envelope data.
   - **RESOLVED:** 05-03-PLAN.md Task 1 adds `fromAgentId` as a new payload field on `agent.handoff_completed`; the envelope's `sourceAgentId`/`destinationAgentId` fields are left untouched.

2. **Should the fork be vendored as a git submodule/subtree, or should specific files be copy-pasted into `packages/pixel-office`?**
   - What we know: PROJECT.md says "fork/extend rather than rebuilding... Preserve attribution." The fork is MIT-licensed and copy-paste with attribution is legally sufficient.
   - What's unclear: Whether the user wants to track upstream fork updates (submodule/subtree, higher merge-conflict overhead per PITFALLS.md's technical-debt table) or freeze at a point-in-time copy (simpler, per PITFALLS.md: "acceptable only if the fork is explicitly frozen").
   - Recommendation: Copy-paste the specific engine/sprite/layout modules with a clear attribution header pointing at the source commit SHA, treating it as explicitly frozen (matches PITFALLS.md's stated acceptable case) — confirm with the user during planning since it's a real tradeoff, not purely technical.
   - **RESOLVED:** 05-01-PLAN.md Task 2 copy-pastes the specific engine/sprite/layout modules with a 3-line attribution header (source repo, commit SHA, licence), treated as explicitly frozen.

## Environment Availability

Skipped — this phase has no external service/tool dependency beyond what's already verified as present in the monorepo (Node 22 LTS, pnpm, Vitest, the existing `apps/api`/`apps/worker` packages). The one external dependency (the `pixel-agents-hq/pixel-agents` GitHub repo, for forking source from) was directly fetched and verified reachable during this research session.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (per-package `"test": "vitest run"`, verified in `packages/company-core/package.json`, `packages/claude-adapter/package.json`, etc.) + Playwright (root `playwright.config.ts`, `testDir: "./e2e"`) |
| Config file | No root `vitest.config.*` found — each package runs its own `vitest run`; `playwright.config.ts` exists at repo root |
| Quick run command | `pnpm --filter pixel-office test` (once the package exists) |
| Full suite command | `pnpm turbo test` (existing monorepo pattern, inferred from per-package scripts) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| OFFICE-01 | AgentStatus → visual mapping covers all 15 values | unit | `vitest run` against a `status-mapping.test.ts` asserting every `AgentStatus` member resolves to a defined `{state, bubbleType?}` pair | ❌ Wave 0 |
| OFFICE-02 | Attribution/licence notices preserved | manual/checklist | N/A — verify `references/ASSET-LICENSES.md` + in-app credit text against the fork's README | ❌ Wave 0 (doc, not code) |
| OFFICE-03 | Blocked/waiting visually distinguishable | unit + visual | `vitest run` asserting frozen-pose suppression + bubble-icon presence per status; Playwright screenshot diff for the visual distinction itself | ❌ Wave 0 |
| HANDOFF-01 | Physical walk/icon/accept sequence | integration | `vitest run` driving a synthetic `agent.handoff_requested` → `agent.handoff_completed` event pair through the reducer + renderer state machine, asserting the expected `Character.state` transitions in order | ❌ Wave 0 (also needs the new event type to exist first) |
| HANDOFF-02 | Deterministic dialogue, never LLM-generated | unit | `vitest run` grepping the handoff/dialogue module for the absence of any LLM/API call, plus a snapshot test asserting dialogue text comes from a static template map | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `vitest run` scoped to the touched package
- **Per wave merge:** `pnpm turbo test` (full monorepo suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; Playwright visual check for OFFICE-03's "at a glance" requirement specifically, since that's inherently a visual/subjective claim unit tests can't fully cover

### Wave 0 Gaps

- [ ] `packages/pixel-office` — package does not exist yet; needs scaffolding (`package.json`, `vitest` config matching sibling packages) before any test can run
- [ ] `packages/pixel-office/src/status/status-mapping.test.ts` — covers OFFICE-01, OFFICE-03
- [ ] `packages/pixel-office/src/handoff/handoff-choreography.test.ts` — covers HANDOFF-01, HANDOFF-02
- [ ] `packages/event-schema/src/payloads/index.test.ts` extension — covers the new `agent.handoff_completed` type + `fromAgentId` field validating/round-tripping correctly
- [ ] `apps/web` — app does not exist yet; needs scaffolding before any Playwright visual test targeting it can run

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|--------------------|
| V2 Authentication | Partial | The new browser-facing Broadcast Hub route needs *some* connection auth even without full visibility-tier filtering (Phase 7's concern) — reuse the existing worker-auth token pattern's shape (`apps/api/src/auth/worker-auth.ts`) for a browser-client credential, scoped separately |
| V3 Session Management | No | No user session/login exists in this phase; the renderer is a read-only viewer of company state |
| V4 Access Control | Partial | Until Phase 7 ships visibility tiers, the new browser WS route should default to INTERNAL-only data (same posture as the rest of the pre-Phase-7 system) — do not expose it publicly yet |
| V5 Input Validation | Yes | New event payloads (`agent.handoff_completed`, `fromAgentId`) validated via the existing Zod discriminated-union pattern — no ad hoc parsing |
| V6 Cryptography | No | No new cryptographic material this phase |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Unauthenticated browser WS route reading company/task/agent state | Information Disclosure | Require the same bearer-token pattern the worker WS route already uses (`authenticateWorker`-shaped `preValidation` hook), even before Phase 7's full visibility filtering exists — do not ship an open route "temporarily" |
| Forked third-party rendering code executing arbitrary logic from event payloads (e.g. a crafted `currentTool` string driving unexpected rendering) | Tampering | Validate every inbound projection diff against the existing Zod schemas before it reaches `packages/pixel-office` — the renderer should never trust unvalidated payload strings for anything beyond display |

## Sources

### Primary (HIGH confidence — direct source-file reads, not summarized)
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/package.json` — confirms VS Code extension, no Phaser dependency
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/package.json` — confirms React 19 + Vite 8, no Phaser/PixiJS
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/types.ts` — `CharacterState`, `Character`, bubble/matrix-effect fields (verbatim quoted above)
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/engine/characters.ts` — FSM behavior, `findPath` usage
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/engine/gameLoop.ts` — Canvas 2D confirmation, RAF loop
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/layout/tileMap.ts` — `findPath` BFS implementation
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/colorize.ts` — hue/palette identity-coloring confirmation
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/office/sprites/spriteData.ts` — bubble sprite resolution, `CharacterSprites` shape
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/webview-ui/src/constants.ts` — grid size, animation timing constants
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/README.md` — attribution text (character credit, no furniture credit), licence badge
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/LICENSE` — MIT, Pablo De Lucca
- `raw.githubusercontent.com/pixel-agents-hq/pixel-agents/main/docs/external-assets.md` — manifest/asset-pack format
- `api.github.com/repos/pixel-agents-hq/pixel-agents/git/trees/main?recursive=1` — full repo file listing
- `F:/Sidegigs/PixelFirm/packages/event-schema/src/payloads/index.ts` (this repo, read directly) — 16-member union, `AgentHandoffRequestedPayload` shape
- `F:/Sidegigs/PixelFirm/packages/event-schema/src/envelope.ts` (this repo, read directly) — `BaseEnvelope` fields
- `F:/Sidegigs/PixelFirm/packages/company-core/src/reducer.ts` (this repo, read directly) — current handler set, `agent.handoff_requested` handler
- `F:/Sidegigs/PixelFirm/packages/company-core/src/projections.ts` (this repo, read directly) — `AgentState.status: string` (no enum yet)
- `F:/Sidegigs/PixelFirm/packages/claude-adapter/src/claude-code-runtime.ts`, `event-emitter.ts` (this repo, read directly) — `requestHandoff` implementation, `buildEnvelope` signature
- `F:/Sidegigs/PixelFirm/.planning/PROJECT.md`, `REQUIREMENTS.md` (this repo, read directly) — AgentStatus list count verification

### Secondary (MEDIUM confidence)
- None distinct from Primary this session — all load-bearing claims were verified against primary sources directly.

### Tertiary (LOW confidence — flagged for user verification before spend)
- PixelLab pricing/licensing (knowara.com, flowtools.co, ludo.ai aggregator reviews) — see Assumptions Log A2
- Retro Diffusion pricing/licensing (aiindigo.com, gamedevaihub.com aggregator reviews) — see Assumptions Log A2

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — corrected via direct source-file reads, not inference
- Architecture: MEDIUM — the integration strategy (fork specific modules, drive from Broadcast Hub) is a sound reading of the evidence but unproven in this codebase until implemented
- Pitfalls: HIGH — all four pitfalls are verified against primary sources (this repo's own schema/reducer code, or the fork's own README/source), not inferred

**Research date:** 2026-09-21
**Valid until:** Re-verify the fork's source if `pixel-agents-hq/pixel-agents` receives a major version bump before this phase is implemented — this research pinned to the `main` branch as of 2026-09-21. Valid ~30 days for a stable, slow-moving VS Code extension.

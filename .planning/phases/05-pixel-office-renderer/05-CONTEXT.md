# Phase 5: Pixel Office Renderer - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 forks/extends the Pixel Agents office renderer so it displays real company-state projections on one floor — agents whose sprites/animations reflect their real current `AgentStatus` (offline/idle/planning/researching/coding/reading/testing/reviewing/discussing/deploying/blocked/waiting_for_agent/waiting_for_ceo/failed/completed), with blocked/waiting agents visually distinguishable at a glance, and physically-represented handoffs between agents driven by real `agent.handoff_requested`/`agent.handoff_completed` events using deterministic template dialogue only — never LLM-generated at render time. Pixel Agents attribution/licence notices are preserved. No CEO dashboard UI, no stream-safe visibility filtering, no Twitch/viewer integration — those are Phase 6+ (OFFICE-01, OFFICE-02, OFFICE-03, HANDOFF-01, HANDOFF-02 only).

</domain>

<decisions>
## Implementation Decisions

### State-to-animation fidelity (OFFICE-01)
- **D-01:** Every one of the 14 canonical `AgentStatus` values gets its own visually distinct animation (a literal 14:1 mapping), not a grouped/shared-pose approach — the user explicitly chose full fidelity over the researched "5-6 native poses + overlay" recommendation. — **Reversibility:** reversible — the `AgentStatus` → animation mapping table can be collapsed to fewer poses later without touching the interface contract, only the mapping data and any added animation assets.
- **D-02:** Sourcing the ~8-9 animations beyond the fork's native ~5-6, in this explicit priority order (triage, try each before falling back to the next):
  1. Check whether the Pixel Agents fork (or its dependencies) already has additional unused animation states that just need wiring up, reusing whatever fits the existing design.
  2. Investigate AI-assisted pixel-art generation platforms/services that could produce matching-style frames — user wants this researched (specific tool/service is Claude's Discretion below, but present findings before committing).
  3. Test whether procedural variation (tint/speed/effect layered on the existing ~5-6 animations) reads acceptably as visually distinct per state — a real fallback, not just a stopgap, if it looks good.
  4. Only as a last resort, get missing frames hand-drawn/commissioned from an artist matching MetroCity's style (needs its own artist-sourcing research).
  This order must be tried top-down; do not skip straight to commissioning without attempting 1-3 first. — **Reversibility:** reversible — a later swap of any tier's output (e.g. replacing a procedural-variation animation with a properly commissioned one) only touches that state's asset reference in the mapping table.

### Blocked/waiting-for-input visual signal (OFFICE-03)
- **D-03:** A blocked/waiting agent is signaled by an icon overlay (a distinct glyph per state, so `waiting_for_agent` and `waiting_for_ceo` get different icons) combined with a frozen pose — the sprite's idle-loop animation is suppressed while blocked/waiting, so a stuck agent never appears to still be actively working. Chosen over a color-tint/glow-only signal because tints get lost on compressed stream video and don't stop the sprite from reading as active. — **Reversibility:** reversible — overlay icon assets and the frozen-pose toggle are additive to the same `AgentStatus` → visual mapping table from D-01/D-02, not a structural change.

### Handoff sequence fidelity (HANDOFF-01/02)
- **D-04:** Handoffs use the full choreographed walk-to-desk sequence from the original brief (developer stands up → walks to the receiving agent → task icon appears → receiving agent accepts → developer returns to idle/desk → receiving agent moves to their own desk and starts work) — the user explicitly chose this over the researched "icon fade/transfer between fixed positions" recommendation, accepting the added scope of a movement/pathfinding system between agent desk positions. Dialogue/text shown during the sequence remains deterministic/template-based per HANDOFF-02 — never LLM-generated at render time (this constraint is fixed, not open for reconsideration). — **Reversibility:** costly — once the renderer's event-to-animation state machine is built around a multi-step walk/path/accept/return sequence (with its own pathfinding integration), collapsing back to a simple icon-transfer would mean removing a shipped movement system, not just simplifying a mapping table.

### Asset-licence audit scope
- **D-05:** Phase 5's asset-licence audit is scoped to only the specific assets this phase's MVP actually wires into the renderer (the one rendered floor, the office layout, and whichever animation assets D-02's sourcing triage lands on) — not a full audit of every asset bundled with the Pixel Agents fork. Assets not used by this phase (additional character packs, unused tilesets/sound, etc.) are tracked as explicitly deferred in `references/ASSET-LICENSES.md`, to be re-audited when actually used or before any public/commercial distribution — consistent with PROJECT.md's existing "audit before commercial distribution" note and the already-confirmed CC0 MetroCity precedent. — **Reversibility:** reversible — expanding the audit later to cover additional assets is additive work, not a rework of anything already verified.

### Claude's Discretion
- Which specific AI-assisted pixel-art generation platform/service to evaluate for D-02 tier 2 (e.g. a sprite-specific generation tool vs. a general image model workflow) — present findings/options to the user before committing spend or before wiring generated art into the asset pipeline.
- Exact pathfinding/movement mechanism for D-04's walk choreography (e.g. a Phaser pathfinding plugin like EasyStar.js, a hand-rolled waypoint system, or Arcade Physics-based direct movement between fixed desk anchor points) — pick whichever keeps the walk deterministically tied to real `agent.handoff_requested`/`agent.handoff_completed` event timing (never let the animation drift ahead of or behind the real event pair per the Core Value).
- Exact icon/glyph assets for D-03's per-state overlay (distinct glyphs for `waiting_for_agent` vs `waiting_for_ceo` vs `blocked`) — reuse a bundled icon if the fork ships one, otherwise source/create simple icons consistent with D-02's asset-sourcing triage.
- Exact `references/ASSET-LICENSES.md` structure/format for tracking D-05's scoped-vs-deferred asset audit status.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Core Value (never fabricated animation), Pixel Agents fork/attribution requirement, "audit before commercial distribution" asset-licence note (source of D-05's scoping rationale)
- `.planning/REQUIREMENTS.md` — OFFICE-01, OFFICE-02, OFFICE-03, HANDOFF-01, HANDOFF-02 (this phase's mapped requirements)
- `.planning/ROADMAP.md` §Phase 5 — Goal and Success Criteria for this phase
- `.planning/STATE.md` §Blockers/Concerns — "full asset-licence audit of the Pixel Agents fork beyond the credited CC0 character pack is still outstanding" (the concern D-05 resolves the scope of, not the full audit itself)

### Prior phase context (decisions this phase builds on)
- `.planning/phases/04-agentruntime-claudecoderuntime/04-CONTEXT.md` — D-08 (requestHandoff signal detection already wired in Phase 4; this phase's handoff animation triggers off those real signals, not new detection logic)
- `.planning/phases/03-worker-git-adapter-gsd-adapter/03-CONTEXT.md` — D-02 (file+process dual-signal liveness pattern this phase's "never fabricate/never freeze" animation rules must stay consistent with — an agent must never be shown active if the underlying liveness signal says otherwise)

### Research
- `.planning/research/ARCHITECTURE.md` — `packages/pixel-office` as a pure consumer mapping `AgentStatus` enum to sprite/animation state, subscribing to state projections via the Broadcast Hub; canned dialogue templates for handoffs (HANDOFF-02, fixed constraint); Anti-Pattern 1 (never let the renderer bypass the event bus to read git/GSD/Claude Code state directly)
- `.planning/research/STACK.md` — Phaser ^4.2 (matches the Pixel Agents fork, itself Phaser-based); tilemap/Arcade Physics/pathing plugins available for the walk choreography (D-04); Vite build tooling for `apps/web`
- `.planning/research/PITFALLS.md` — Pitfall 1 (asset licensing — only MetroCity character pack confirmed CC0, audit "at the point the fork is first pulled in," source of D-05); Pitfall 2 (pixel office state drift — office must never keep animating as if nothing changed, directly informs D-03's frozen-pose choice and D-04's event-timing constraint)
- `.planning/research/FEATURES.md` — "Blocked/waiting-for-input visual signal" listed as LOW complexity, high payoff table-stakes feature; "Deterministic handoff visuals (walk-to-desk, hand off task icon)" listed in the v1 MVP definition, matching D-04's chosen fidelity
- `.planning/research/SUMMARY.md` §Phase 4 (renderer) — asset-license audit flagged as a concrete Phase 5 checklist item, not deferred to "before launch"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Pixel Agents fork (pixel-agents-hq/pixel-agents, MIT + CC0 MetroCity character pack): existing ~5-6 native animation states, existing office/movement/character engine to fork/extend rather than rebuild — D-02's tier-1 sourcing check should look here first before any new art or generation tooling.
- `packages/event-schema`'s discriminated union (Phases 1-4): `agent.handoff_requested`/`agent.handoff_completed` and task/status events this phase's renderer subscribes to (read-only) — no new event types expected unless the walk choreography (D-04) needs finer-grained intermediate events (e.g. "arrived at desk") to stay event-driven rather than purely animation-timed; that determination is part of Claude's Discretion on the pathfinding mechanism above.
- `packages/company-core` projections (Phases 1-4): agent/task/floor state this phase's renderer reads via the Broadcast Hub — never queried directly, per Anti-Pattern 1.

### Established Patterns
- Every prior phase proved its layer against real infrastructure/state before building further (Phase 3: real git/GSD observation; Phase 4: real Claude Code task execution). Phase 5 continues this — the renderer must be provably a pure consumer of real projections, never advancing animation state on its own timer independent of real events (Pitfall 2).
- Adapters/runtimes built so far are workers-side with zero control-plane rendering dependency; `packages/pixel-office` is the first purely presentational package and must not reach back into `git-adapter`/`gsd-adapter`/`claude-adapter` directly.

### Integration Points
- `packages/pixel-office` is a new package (per ARCHITECTURE.md) subscribing to the Broadcast Hub (WS gateway built in Phase 2) for state projection diffs.
- Likely requires a new `apps/web` (or equivalent) Vite+React/Phaser host to actually render on screen for this phase's demo — exact hosting shell is left to research/planning since ARCHITECTURE.md assigns `apps/web` primarily to the Phase 6 CEO Dashboard; whether Phase 5 stands up a minimal version of that same app now or a temporary dev harness is a planning-time call, not re-litigated here.

</code_context>

<specifics>
## Specific Ideas

- User wants the additional ~8-9 animations beyond the fork's native set sourced via a specific triage order (D-02): check for unused existing animations first, then investigate AI-assisted pixel-art generation, then test procedural variation on existing animations, and only commission/hand-draw as a last resort. This order should be presented back with findings at each tier before moving to the next, not silently skipped to the end.
- User wants the full brief-style handoff choreography (walk over, icon, accept, return, move to desk) rather than a cheaper icon-transfer animation, accepting the added pathfinding/movement-system scope this implies.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-Pixel Office Renderer*
*Context gathered: 2026-09-21*

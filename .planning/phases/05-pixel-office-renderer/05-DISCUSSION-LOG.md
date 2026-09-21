# Phase 5: Pixel Office Renderer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-21
**Phase:** 5-Pixel Office Renderer
**Areas discussed:** State-to-animation fidelity, Blocked/waiting visual signal, Handoff sequence fidelity, Asset-licence audit scope

---

## State-to-Animation Fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped poses + overlay | Reuse the fork's ~5-6 native animations, map similar states to the same pose, use an overlay/badge for distinctions. No new art dependency. (Researched recommendation.) | |
| 14 unique animations | One animation per canonical state. Requires sourcing 8-9 more than the fork natively ships. | ✓ |

**User's choice:** 14 unique animations.
**Notes:** Follow-up asked where the extra ~8-9 animations should come from. User gave a prioritized triage order: (1) check for existing-but-unused animations in the fork/dependencies that fit the current design, (2) look into AI-assisted pixel-art generation platforms/services, (3) test whether procedural variation on the existing animations reads acceptably, (4) commission/hand-draw as a last resort (needs its own artist-sourcing research). Order must be tried top-down.

---

## Blocked/Waiting-for-Input Visual Signal

| Option | Description | Selected |
|--------|-------------|----------|
| Icon overlay + frozen pose | Distinct glyph per state (waiting_for_agent vs waiting_for_ceo) plus a suppressed idle-loop so the agent visibly stops. Survives stream compression. (Researched recommendation.) | ✓ |
| Color tint/glow only | Cheapest option, but subtle tints get lost on compressed stream video and don't stop the sprite looking active. | |

**User's choice:** Icon overlay + frozen pose.
**Notes:** None — matched the researched recommendation, no follow-up needed.

---

## Handoff Sequence Fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| Icon fade/transfer | Task icon animates between fixed agent positions using Phaser Tweens only. No pathfinding dependency, no desync risk. (Researched recommendation.) | |
| Full walk choreography | Agents physically walk to each other's desks and back, matching the brief's example exactly. Needs a pathfinding plugin and a multi-step movement state machine. | ✓ |

**User's choice:** Full walk choreography.
**Notes:** User accepted the added pathfinding/movement-system scope this implies. Deterministic dialogue constraint (HANDOFF-02) stays fixed regardless of choreography fidelity.

---

## Asset-Licence Audit Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Scope to MVP assets | Audit only the specific assets Phase 5 renders; track the rest as deferred in references/ASSET-LICENSES.md. MVP is personal/non-commercial. (Researched recommendation.) | ✓ |
| Full audit now | Audit every bundled asset directory before rendering work proceeds. | |

**User's choice:** Scope to MVP assets.
**Notes:** None — matched the researched recommendation, no follow-up needed.

---

## Claude's Discretion

- Which specific AI-assisted pixel-art generation platform/service to evaluate for the animation-sourcing triage's tier 2 — present findings before committing.
- Exact pathfinding/movement mechanism for the walk choreography (plugin vs. hand-rolled waypoints vs. Arcade Physics direct movement).
- Exact icon/glyph assets for the blocked/waiting overlay.
- Exact `references/ASSET-LICENSES.md` structure for tracking scoped-vs-deferred audit status.

## Deferred Ideas

None — discussion stayed within phase scope.

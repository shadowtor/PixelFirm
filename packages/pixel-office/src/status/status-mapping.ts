// Exhaustive AgentStatus -> visual mapping (OFFICE-01 fidelity, OFFICE-03
// blocked/waiting glanceable signal). This is the literal 1:1 mapping D-01
// requires, correcting D-02's tier ordering to what RESEARCH.md Pattern 2
// actually found sufficient: tier 1 (reuse the fork's own bubble-permission/
// bubble-waiting concepts) plus tier 3 (new small icon assets in that SAME
// JSON format, plus one legitimate procedural variation — animation speed on
// deploying, never tint, since hue/palette is already claimed by per-agent
// identity colour). Tier 2 (AI-generation) and tier 4 (commissioned art) are
// never reached — every one of the 15 states is satisfied by tier 1 or 3.
import { AgentStatus } from "event-schema";
import type { BubbleType, CharacterState as CharacterStateType } from "../types.js";
import { CharacterState } from "../types.js";

export interface StatusVisual {
  /** Base FSM pose, or null as the `offline` sentinel meaning "not rendered
   *  — despawned from the floor" (callers must skip rendering when null). */
  pose: CharacterStateType | null;
  /** Speech-bubble overlay glyph key (D-03), or omitted for no bubble. */
  bubble?: BubbleType;
  /** True when the idle-loop animation frame advance must be suppressed
   *  (D-03) — blocked/waiting_for_agent/waiting_for_ceo only. */
  frozen?: boolean;
  /** Multiplies the animation frame-timer's dt accumulation. The one
   *  legitimate procedural-variation state signal this project uses
   *  (deploying) — omitted (defaults to 1x) for every other state. */
  frameSpeedMultiplier?: number;
}

/**
 * The exhaustive OFFICE-01/OFFICE-03 visual mapping — one entry per
 * AgentStatus member, taken verbatim from RESEARCH.md Pattern 2's
 * "Concrete per-state disposition" table (the source of truth for this
 * table's contents).
 */
export const STATUS_MAP: Record<AgentStatus, StatusVisual> = {
  [AgentStatus.IDLE]: { pose: CharacterState.IDLE },
  [AgentStatus.CODING]: { pose: CharacterState.TYPE },
  // Same base pose as coding — the fork has no per-tool-use signal to
  // differentiate them further this phase (05-01's flagged assumptions).
  [AgentStatus.READING]: { pose: CharacterState.TYPE },
  // Reuses the fork's existing bubble-permission concept — near-verbatim
  // semantic match ("white square with '...' in amber, and a tail pointer").
  [AgentStatus.WAITING_FOR_CEO]: { pose: CharacterState.IDLE, bubble: "permission", frozen: true },
  // Reuses the fork's existing bubble-waiting concept — distinct glyph from
  // waiting_for_ceo (D-03's per-state distinct-icon requirement).
  [AgentStatus.WAITING_FOR_AGENT]: { pose: CharacterState.IDLE, bubble: "waiting", frozen: true },
  // Sentinel: not rendered — despawned from the floor. Callers must skip
  // rendering when pose === null.
  [AgentStatus.OFFLINE]: { pose: null },
  [AgentStatus.BLOCKED]: { pose: CharacterState.IDLE, bubble: "blocked", frozen: true },
  [AgentStatus.FAILED]: { pose: CharacterState.IDLE, bubble: "failed" },
  [AgentStatus.COMPLETED]: { pose: CharacterState.IDLE, bubble: "completed" },
  [AgentStatus.PLANNING]: { pose: CharacterState.IDLE, bubble: "planning" },
  [AgentStatus.RESEARCHING]: { pose: CharacterState.TYPE, bubble: "researching" },
  [AgentStatus.TESTING]: { pose: CharacterState.TYPE, bubble: "testing" },
  [AgentStatus.REVIEWING]: { pose: CharacterState.TYPE, bubble: "reviewing" },
  [AgentStatus.DISCUSSING]: { pose: CharacterState.TYPE, bubble: "discussing" },
  // The one legitimate procedural variation this project uses — animation
  // speed, never tint (RESEARCH.md Pattern 2's explicit rejection of
  // tint-based state signaling, since hue/palette is already claimed by
  // per-agent identity colour).
  [AgentStatus.DEPLOYING]: { pose: CharacterState.TYPE, bubble: "deploying", frameSpeedMultiplier: 1.5 },
};

/**
 * Thin STATUS_MAP accessor. No fallback branch — a missing key is a
 * compile-time impossibility given the Record<AgentStatus, ...> type above,
 * not a runtime default.
 */
export function resolveStatusVisual(status: AgentStatus): StatusVisual {
  return STATUS_MAP[status];
}

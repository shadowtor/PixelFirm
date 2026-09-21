// Event-driven walk/icon/accept/return FSM (HANDOFF-01), keyed by taskId.
// Drives 05-01's forked findPath BFS (via walkCharacterTo, unmodified — no
// new pathfinder is written here, per RESEARCH.md's Don't Hand-Roll) purely
// off real agent.handoff_requested/agent.handoff_completed event pairs.
// Never a timer, never a path-length heuristic: the receiving character MUST
// NOT reach CharacterState.TYPE until the real completion event is processed
// (RESEARCH.md Common Pitfall 2, this plan's kept prohibition).
//
// Imports from "../index.js" (getCharacter/getTileMap/getTaskTitle) create a
// circular module reference with index.ts (which re-exports
// handleHandoffEvent from this file). Safe: every cross-reference here is
// used only inside function bodies, never at module-top-level evaluation
// time, so ESM's live-binding linking resolves it correctly regardless of
// which module finishes evaluating first.
import type { CompanyEvent } from "event-schema";
import { walkCharacterTo } from "../engine/characters.js";
import { getCharacter, getTaskTitle, getTileMap } from "../index.js";
import { CharacterState } from "../types.js";
import { resolveHandoffDialogue } from "./dialogue-templates.js";

type HandoffPhase = "WALKING_TO_RECEIVER" | "ICON_VISIBLE" | "RETURNING_TO_DESK";

interface HandoffRecord {
  taskId: string;
  fromAgentId: string;
  toAgentId: string;
  phase: HandoffPhase;
}

// No blocked-tile tracking exists anywhere in this repo yet (no furniture —
// 05-01's trim). An empty set matches every other findPath call site here.
const NO_BLOCKED_TILES = new Set<string>();

const handoffs = new Map<string, HandoffRecord>();

/**
 * Entry point wired from apps/web's onEvent handler for both halves of a
 * real handoff pair. Every other event type is ignored (no-op).
 */
export function handleHandoffEvent(event: CompanyEvent): void {
  if (event.type === "agent.handoff_requested") {
    const { taskId, fromAgentId, toAgentId } = event.payload;
    const fromChar = getCharacter(fromAgentId);
    const toChar = getCharacter(toAgentId);
    // Defensive: can't animate a walk for an agent this floor has never
    // rendered (e.g. handoff fired before either agent's first AgentStatus
    // event). Never fabricate a walk sequence for an unknown character.
    if (!fromChar || !toChar) return;

    walkCharacterTo(fromChar, toChar.seatCol, toChar.seatRow, getTileMap(), NO_BLOCKED_TILES);
    handoffs.set(taskId, { taskId, fromAgentId, toAgentId, phase: "WALKING_TO_RECEIVER" });
    return;
  }

  if (event.type === "agent.handoff_completed") {
    const { taskId } = event.payload;
    const record = handoffs.get(taskId);
    // Defensive (RESEARCH.md-required no-op): a completed event with no
    // matching ICON_VISIBLE handoff is either a duplicate delivery or a
    // race — never fabricate a walk/accept sequence retroactively.
    if (!record || record.phase !== "ICON_VISIBLE") return;

    const fromChar = getCharacter(record.fromAgentId);
    const toChar = getCharacter(record.toAgentId);

    if (fromChar) {
      fromChar.bubbleType = null;
      fromChar.bubbleText = null;
      walkCharacterTo(fromChar, fromChar.seatCol, fromChar.seatRow, getTileMap(), NO_BLOCKED_TILES);
    }
    if (toChar) {
      // The receiver "accepts and moves to work" at their existing desk —
      // per HANDOFF-01's exact wording, no second walk leg for them.
      toChar.state = CharacterState.TYPE;
      const taskTitle = getTaskTitle(taskId) ?? taskId;
      const toAgentName = toChar.name ?? record.toAgentId;
      toChar.bubbleText = resolveHandoffDialogue("accepted", taskTitle, toAgentName);
    }

    record.phase = "RETURNING_TO_DESK";
    return;
  }
}

/**
 * Advances the FSM's arrival-driven transitions — call once per game-loop
 * tick, after every Character's own updateCharacter has run for that frame
 * (index.ts wires this in). Detects "sending character has arrived" purely
 * from the already-updated Character struct (state === IDLE, path emptied)
 * — the same signal engine/characters.ts's WALK case already produces when
 * a walkCharacterTo-driven path completes; no separate timer/heuristic.
 */
export function checkHandoffArrivals(): void {
  for (const record of handoffs.values()) {
    if (record.phase === "WALKING_TO_RECEIVER") {
      const fromChar = getCharacter(record.fromAgentId);
      if (!fromChar || fromChar.state !== CharacterState.IDLE || fromChar.path.length !== 0) continue;

      const taskTitle = getTaskTitle(record.taskId) ?? record.taskId;
      const toChar = getCharacter(record.toAgentId);
      const toAgentName = toChar?.name ?? record.toAgentId;
      fromChar.bubbleType = "handoff-task";
      fromChar.bubbleText = resolveHandoffDialogue("requested", taskTitle, toAgentName);
      record.phase = "ICON_VISIBLE";
      continue;
    }

    if (record.phase === "RETURNING_TO_DESK") {
      const fromChar = getCharacter(record.fromAgentId);
      if (!fromChar || fromChar.state !== CharacterState.IDLE || fromChar.path.length !== 0) continue;

      handoffs.delete(record.taskId);
    }
  }
}

/** Test-only reset — mirrors index.ts's _resetForTests. */
export function _resetHandoffsForTests(): void {
  handoffs.clear();
}

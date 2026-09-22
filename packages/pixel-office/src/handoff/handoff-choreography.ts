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
  /** The receiver's accepted line, set at completion; null before (05-13). */
  acceptedText: string | null;
  /** The sender's requested line, set at ICON_VISIBLE; null before (05-17). */
  requestedText: string | null;
}

// No blocked-tile tracking exists anywhere in this repo yet (no furniture —
// 05-01's trim). An empty set matches every other findPath call site here.
const NO_BLOCKED_TILES = new Set<string>();

const handoffs = new Map<string, HandoffRecord>();

// Request event ids this FSM has already acted on — the FSM is the only
// non-idempotent consumer of relayed events, so a re-delivered request must
// never re-drive the walk (05-13, review CR-01).
// ponytail: grows by one id per handoff request for the tab's lifetime
// (handoffs are rare; no in-repo producer exists yet). Bound it with an LRU
// if handoffs ever become high-frequency.
const handledHandoffRequestIds = new Set<string>();

/**
 * The only place a handoff record ends (D-04: the sequence ends when the
 * sender is home; 05-13: no line outlives its sequence). Clears only what is
 * still this record's, so a newer line or a real status glyph survives.
 */
function retireHandoff(record: HandoffRecord, sendSenderHome: boolean): void {
  const toChar = getCharacter(record.toAgentId);
  if (toChar && record.acceptedText !== null && toChar.bubbleText === record.acceptedText) {
    toChar.bubbleText = null;
  }
  const fromChar = getCharacter(record.fromAgentId);
  if (fromChar) {
    if (record.requestedText !== null && fromChar.bubbleText === record.requestedText) fromChar.bubbleText = null;
    if (fromChar.bubbleType === "handoff-task") fromChar.bubbleType = null;
    const last = fromChar.path[fromChar.path.length - 1];
    const headingHome = last !== undefined && last.col === fromChar.seatCol && last.row === fromChar.seatRow;
    const atHome = fromChar.tileCol === fromChar.seatCol && fromChar.tileRow === fromChar.seatRow;
    if (sendSenderHome && !atHome && !headingHome) {
      walkCharacterTo(fromChar, fromChar.seatCol, fromChar.seatRow, getTileMap(), NO_BLOCKED_TILES);
    }
  }
  handoffs.delete(record.taskId);
}

/**
 * Entry point wired from apps/web's onEvent handler for both halves of a
 * real handoff pair. Every other event type is ignored (no-op).
 */
export function handleHandoffEvent(event: CompanyEvent): void {
  if (event.type === "agent.handoff_requested") {
    if (handledHandoffRequestIds.has(event.id)) return;
    const { taskId, fromAgentId, toAgentId } = event.payload;
    const fromChar = getCharacter(fromAgentId);
    const toChar = getCharacter(toAgentId);
    // Defensive: can't animate a walk for an agent this floor has never
    // rendered (e.g. handoff fired before either agent's first AgentStatus
    // event). Never fabricate a walk sequence for an unknown character.
    if (!fromChar || !toChar) return;

    // Marked only once acted on: a request that arrived before its
    // participants existed was never acted on, so it is not marked.
    handledHandoffRequestIds.add(event.id);
    const previous = handoffs.get(taskId);
    // Same sender is not sent home: it is re-pathed below, and a leftover home
    // path would fire the new record's arrival at its own desk.
    if (previous) retireHandoff(previous, previous.fromAgentId !== fromAgentId);
    walkCharacterTo(fromChar, toChar.seatCol, toChar.seatRow, getTileMap(), NO_BLOCKED_TILES);
    handoffs.set(taskId, {
      taskId,
      fromAgentId,
      toAgentId,
      phase: "WALKING_TO_RECEIVER",
      acceptedText: null,
      requestedText: null,
    });
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
      // Clear only what the handoff put on the sender: a real status glyph
      // set meanwhile (e.g. blocked) survives the return walk (05-17).
      if (fromChar.bubbleType === "handoff-task") fromChar.bubbleType = null;
      if (fromChar.bubbleText === record.requestedText) fromChar.bubbleText = null;
      walkCharacterTo(fromChar, fromChar.seatCol, fromChar.seatRow, getTileMap(), NO_BLOCKED_TILES);
    }
    if (toChar) {
      // The receiver "accepts and moves to work" at their existing desk —
      // per HANDOFF-01's exact wording, no second walk leg for them.
      toChar.state = CharacterState.TYPE;
      const taskTitle = getTaskTitle(taskId) ?? taskId;
      const toAgentName = toChar.name ?? record.toAgentId;
      record.acceptedText = resolveHandoffDialogue("accepted", taskTitle, toAgentName);
      toChar.bubbleText = record.acceptedText;
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
      // A vanished sender ends the sequence: a re-seated one must never
      // inherit a stale arrival.
      if (!fromChar) {
        retireHandoff(record, false);
        continue;
      }
      if (fromChar.state !== CharacterState.IDLE || fromChar.path.length !== 0) continue;

      const taskTitle = getTaskTitle(record.taskId) ?? record.taskId;
      const toChar = getCharacter(record.toAgentId);
      const toAgentName = toChar?.name ?? record.toAgentId;
      fromChar.bubbleType = "handoff-task";
      record.requestedText = resolveHandoffDialogue("requested", taskTitle, toAgentName);
      fromChar.bubbleText = record.requestedText;
      record.phase = "ICON_VISIBLE";
      continue;
    }

    if (record.phase === "RETURNING_TO_DESK") {
      const fromChar = getCharacter(record.fromAgentId);
      if (fromChar && (fromChar.state !== CharacterState.IDLE || fromChar.path.length !== 0)) continue;

      // D-04's sequence ends when the sender is home (or gone): a line left
      // painted after that is a stale claim (Pitfall 2).
      retireHandoff(record, false);
    }
  }
}

/** Test-only reset — mirrors index.ts's _resetForTests. */
export function _resetHandoffsForTests(): void {
  handoffs.clear();
  handledHandoffRequestIds.clear();
}

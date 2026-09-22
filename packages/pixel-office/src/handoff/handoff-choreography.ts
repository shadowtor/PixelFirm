// Event-driven walk/icon/accept/return FSM (HANDOFF-01), keyed by taskId.
// Drives 05-01's forked findPath BFS (via walkCharacterTo — no
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
import { setRestPose, walkCharacterTo } from "../engine/characters.js";
import { getCharacter, getCharacters, getTaskTitle, getTileMap } from "../index.js";
import { FURNITURE_BLOCKED_TILES } from "../layout/officeLayout.js";
import { findPath, isWalkable } from "../layout/tileMap.js";
import type { Character } from "../types.js";
import { CharacterState, Direction } from "../types.js";
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
  /** The sender Character this record walks, compared by identity (05-19,
   *  WR-03): a re-seated sender is a new object and never inherits it. */
  fromChar: Character;
  /** The interaction tile the sender walks to and waits on (05-27, G-05-1d). */
  target: Tile;
}

type Tile = { col: number; row: number };
const tileKey = (col: number, row: number): string => `${col},${row}`;

const handoffs = new Map<string, HandoffRecord>();

/**
 * Tiles a walk must avoid (05-27, G-05-1d/G-05-1e): blocking furniture, and
 * every other present character's seat and, when it is standing, its tile.
 * The walker's own seat and the target stay open.
 */
export function blockedTilesFor(walker: Character, target: Tile): Set<string> {
  const blocked = new Set(FURNITURE_BLOCKED_TILES);
  for (const ch of getCharacters()) {
    if (ch === walker) continue;
    blocked.add(tileKey(ch.seatCol, ch.seatRow));
    if (ch.state !== CharacterState.WALK) blocked.add(tileKey(ch.tileCol, ch.tileRow));
  }
  blocked.delete(tileKey(walker.seatCol, walker.seatRow));
  blocked.delete(tileKey(target.col, target.row));
  return blocked;
}

/**
 * Where the sender stands at the receiver (05-27, G-05-1d): the nearest free,
 * reachable, non-furniture tile on the receiver's SEAT row, searched outward
 * from its seat (-1, +1, -2, +2, ...). Staying on the seat row keeps every
 * handoff speaker on a layout seat row (05-28's bubble band relies on it).
 *
 * ponytail: null when the row has no free tile — impossible on the shipped
 * layout (each seat row keeps 8+ non-seat floor tiles); the caller then shows
 * the icon where the sender stands instead of stacking it on someone.
 */
function interactionTileFor(toChar: Character, fromChar: Character): Tile | null {
  const tileMap = getTileMap();
  const row = toChar.seatRow;
  const taken = new Set<string>([tileKey(toChar.seatCol, toChar.seatRow)]);
  for (const ch of getCharacters()) {
    if (ch === fromChar) continue;
    taken.add(tileKey(ch.seatCol, ch.seatRow));
    taken.add(tileKey(ch.tileCol, ch.tileRow));
  }
  for (const record of handoffs.values()) {
    if (record.fromChar !== fromChar && record.phase !== "RETURNING_TO_DESK") {
      taken.add(tileKey(record.target.col, record.target.row));
    }
  }
  const width = tileMap[row]?.length ?? 0;
  for (let d = 1; d < width; d++) {
    for (const col of [toChar.seatCol - d, toChar.seatCol + d]) {
      if (taken.has(tileKey(col, row)) || !isWalkable(col, row, tileMap, FURNITURE_BLOCKED_TILES as Set<string>)) continue;
      const here = fromChar.tileCol === col && fromChar.tileRow === row;
      const tile = { col, row };
      if (here || findPath(fromChar.tileCol, fromChar.tileRow, col, row, tileMap, blockedTilesFor(fromChar, tile)).length > 0) {
        return tile;
      }
    }
  }
  return null;
}

/**
 * Arrival is "not walking and nothing left to walk" (05-19, review CR-01).
 * An empty path alone is not arrival: the final frame of a walk still has
 * state WALK.
 */
function hasArrived(ch: Character): boolean {
  return ch.state !== CharacterState.WALK && ch.path.length === 0;
}

/**
 * 05-19's WR-03 identity rule, applied in every phase and at every sender
 * action (05-20, review WR-01). A vanished sender and a re-seated one (a new
 * object under the same agentId) both fail it.
 */
function senderIsCurrent(record: HandoffRecord): boolean {
  return getCharacter(record.fromAgentId) === record.fromChar;
}

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
 * still this record's, so a newer line or a real status glyph survives, and
 * puts back the sender's status glyph (05-20, review CR-01).
 */
function retireHandoff(record: HandoffRecord, sendSenderHome: boolean): void {
  // First, so applyBubble below no longer sees this record as waiting.
  handoffs.delete(record.taskId);
  const toChar = getCharacter(record.toAgentId);
  if (toChar && record.acceptedText !== null && toChar.bubbleText === record.acceptedText) {
    toChar.bubbleText = null;
  }
  if (senderIsCurrent(record)) {
    const fromChar = record.fromChar;
    if (record.requestedText !== null && fromChar.bubbleText === record.requestedText) {
      fromChar.bubbleText = null;
      fromChar.bubbleTextPartnerId = null;
    }
    applyBubble(fromChar);
    const last = fromChar.path[fromChar.path.length - 1];
    const headingHome = last !== undefined && last.col === fromChar.seatCol && last.row === fromChar.seatRow;
    const atHome = fromChar.tileCol === fromChar.seatCol && fromChar.tileRow === fromChar.seatRow;
    if (sendSenderHome && !atHome && !headingHome) {
      const seat = { col: fromChar.seatCol, row: fromChar.seatRow };
      walkCharacterTo(fromChar, seat.col, seat.row, getTileMap(), blockedTilesFor(fromChar, seat));
    }
  }
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
    // A character can be in only one walk, so a newer request from the same
    // sender supersedes its older record, and that record's later completion
    // is a no-op (05-04's defensive contract; 05-19, WR-01).
    for (const previous of [...handoffs.values()]) {
      // Same sender is not sent home: it is re-pathed below, and a leftover home
      // path would fire the new record's arrival at its own desk.
      if (previous.taskId === taskId || previous.fromAgentId === fromAgentId) {
        retireHandoff(previous, previous.fromAgentId !== fromAgentId);
      }
    }
    const target = interactionTileFor(toChar, fromChar) ?? { col: fromChar.tileCol, row: fromChar.tileRow };
    walkCharacterTo(fromChar, target.col, target.row, getTileMap(), blockedTilesFor(fromChar, target));
    handoffs.set(taskId, {
      taskId,
      fromAgentId,
      toAgentId,
      phase: "WALKING_TO_RECEIVER",
      acceptedText: null,
      requestedText: null,
      fromChar,
      target,
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
    // A completion for a sequence whose walker is gone or re-seated is a
    // no-op: no TYPE, no accepted line (05-20, review WR-01). The receiver's
    // real status still arrives through its own upsert.
    if (!senderIsCurrent(record)) {
      retireHandoff(record, false);
      return;
    }

    const fromChar = record.fromChar;
    const toChar = getCharacter(record.toAgentId);
    record.phase = "RETURNING_TO_DESK";

    // The sender's own status glyph comes back (05-20, review CR-01).
    applyBubble(fromChar);
    if (fromChar.bubbleText === record.requestedText) {
      fromChar.bubbleText = null;
      fromChar.bubbleTextPartnerId = null;
    }
    const seat = { col: fromChar.seatCol, row: fromChar.seatRow };
    walkCharacterTo(fromChar, seat.col, seat.row, getTileMap(), blockedTilesFor(fromChar, seat));
    if (toChar) {
      // The receiver "accepts and moves to work" at their existing desk —
      // per HANDOFF-01's exact wording, no second walk leg for them.
      // setRestPose: a receiver mid-walk on its own handoff keeps walking and
      // types when its walk ends (05-19, gap item 2). Still only here (05-04).
      setRestPose(toChar, CharacterState.TYPE);
      const taskTitle = getTaskTitle(taskId) ?? taskId;
      const toAgentName = toChar.name ?? record.toAgentId;
      record.acceptedText = resolveHandoffDialogue("accepted", taskTitle, toAgentName);
      toChar.bubbleText = record.acceptedText;
      toChar.bubbleTextPartnerId = null;
    }
    return;
  }
}

/**
 * Advances the FSM's arrival-driven transitions — call once per game-loop
 * tick, after every Character's own updateCharacter has run for that frame
 * (index.ts wires this in). Detects "sending character has arrived" purely
 * from the already-updated Character struct: arrival is "not walking and
 * nothing left to walk" (hasArrived, 05-19) — the signal engine/characters.ts's
 * WALK case produces when a walkCharacterTo-driven path completes; no
 * separate timer/heuristic.
 */
export function checkHandoffArrivals(): void {
  for (const record of handoffs.values()) {
    // A vanished or re-seated sender ends the sequence: a re-seated sender
    // is a new character and must never inherit a stale arrival (WR-03).
    // This covers ICON_VISIBLE too, where a sender that vanished while
    // waiting would otherwise leave its record live for good (05-20, WR-01).
    if (!senderIsCurrent(record)) {
      retireHandoff(record, false);
      continue;
    }
    const fromChar = record.fromChar;

    if (record.phase === "WALKING_TO_RECEIVER") {
      if (!hasArrived(fromChar)) continue;

      const taskTitle = getTaskTitle(record.taskId) ?? record.taskId;
      const toChar = getCharacter(record.toAgentId);
      const toAgentName = toChar?.name ?? record.toAgentId;
      // 05-27: turn to the receiver before speaking.
      if (toChar) {
        const dc = toChar.tileCol - fromChar.tileCol;
        const dr = toChar.tileRow - fromChar.tileRow;
        if (dc !== 0) fromChar.dir = dc > 0 ? Direction.RIGHT : Direction.LEFT;
        else if (dr !== 0) fromChar.dir = dr > 0 ? Direction.DOWN : Direction.UP;
      }
      record.requestedText = resolveHandoffDialogue("requested", taskTitle, toAgentName);
      fromChar.bubbleText = record.requestedText;
      fromChar.bubbleTextPartnerId = record.toAgentId;
      record.phase = "ICON_VISIBLE";
      applyBubble(fromChar);
      continue;
    }

    if (record.phase === "RETURNING_TO_DESK") {
      if (!hasArrived(fromChar)) continue;

      // D-04's sequence ends when the sender is home: a line left
      // painted after that is a stale claim (Pitfall 2).
      retireHandoff(record, false);
    }
  }
}

/**
 * True while `ch` waits at a receiver (ICON_VISIBLE). The handoff-task icon is
 * derived from the record, so a glyph-less status never removes it for the
 * rest of the wait (05-19, WR-02).
 */
export function isWaitingHandoffSender(ch: Character): boolean {
  for (const record of handoffs.values()) {
    if (record.phase === "ICON_VISIBLE" && record.fromChar === ch) return true;
  }
  return false;
}

/**
 * The only writer of bubbleType, so the order in which a status and a handoff
 * land never changes what is shown (05-20, review CR-01). Precedence:
 * - a frozen status's glyph always shows (D-03, OFFICE-03: a stuck agent's
 *   signal is never hidden);
 * - otherwise the task icon shows while the character waits at a receiver
 *   (D-04, HANDOFF-01);
 * - otherwise the status glyph shows.
 */
export function applyBubble(ch: Character): void {
  ch.bubbleType = isWaitingHandoffSender(ch) && !ch.frozen ? "handoff-task" : ch.statusBubble;
}

/** Test-only reset — mirrors index.ts's _resetForTests. */
export function _resetHandoffsForTests(): void {
  handoffs.clear();
  handledHandoffRequestIds.clear();
}

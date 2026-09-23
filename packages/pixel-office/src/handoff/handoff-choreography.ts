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
import { getDialogueBox } from "../engine/renderer.js";
import { getCharacter, getCharacters, getTaskTitle, getTileMap } from "../index.js";
import { FURNITURE_BLOCKED_TILES, interactionSlotsFor } from "../layout/officeLayout.js";
import { findPath, isWalkable } from "../layout/tileMap.js";
import type { Character } from "../types.js";
import { CharacterState, Direction } from "../types.js";
import { resolveHandoffDialogue, titleOrNull } from "./dialogue-templates.js";

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
  /** The interaction slot the sender walks to and waits on (05-27, G-05-1d;
   *  a fixed aisle slot since 05-34, G-05-P2). */
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
 * Where the sender stands at the receiver (05-34, G-05-P2, superseding 05-27's
 * seat-row search at the user's request): the FIXED slots of the receiver's
 * HOME (`interactionSlotsFor`), taken in layout preference order. The seat-row
 * search always returned the even column between two odd-column seats, so the
 * sender, the receiver and the neighbouring seated agent read as one stacked
 * group 16 px apart (UAT G-05-P2). Every aisle slot is two tiles from every
 * seat and standing spot, and no slot IS a home, so a waiting sender can also
 * never look like it is sitting at someone else's desk (closes review WR-05).
 *
 * The receiver's HOME, not its current tile, so a receiver that is itself
 * mid-walk still hands its own desk's slots out.
 *
 * A slot is taken when another present character's seat, its tile when it is
 * not walking, or another live record's target — in ANY phase, departure
 * included — lies within Chebyshev distance 1, including diagonals, so a second
 * concurrent sender takes the NEXT fixed slot instead of standing beside the
 * first. The phase carries no exemption because a completion flips the record to
 * RETURNING_TO_DESK and the character to WALK on the same tick, so a
 * phase-exempted target is a tile that is still physically occupied on screen
 * (review WR-08).
 *
 * ponytail: null needs every SURVIVING slot of one receiver blocked, which is
 * far cheaper than "5+ occupants" (review WR-03). The wall/off-map filter leaves
 * the corner homes (cols 1 and 18) only 3 of the 6 offsets, and since slots sit
 * 2 columns apart while occupancy rejects at Chebyshev 1, ONE occupant standing
 * between two slots blocks both: two well-placed aisle occupants null a corner
 * home, four an interior one. With the previous 4 offsets a corner home kept
 * just 2 slots and a SINGLE loiterer nulled it. The caller then falls back to
 * the sender's own tile, so the icon shows where the sender stands instead of
 * stacking it on someone — which reads as "the sender didn't go anywhere". A
 * departing sender now holds its slot until it is home (WR-08), which shortens
 * slot availability by the length of one walk home.
 */
function interactionTileFor(toChar: Character, fromChar: Character): Tile | null {
  const tileMap = getTileMap();
  const taken: Tile[] = [{ col: toChar.seatCol, row: toChar.seatRow }];
  for (const ch of getCharacters()) {
    if (ch === fromChar) continue;
    taken.push({ col: ch.seatCol, row: ch.seatRow });
    if (ch.state !== CharacterState.WALK) taken.push({ col: ch.tileCol, row: ch.tileRow });
  }
  for (const record of handoffs.values()) {
    // Reserved for the record's whole lifetime, which ends at retireHandoff and
    // nowhere else (review WR-08). The sender may still stand on the tile its
    // own record reserved.
    if (record.fromChar !== fromChar) taken.push(record.target);
  }
  for (const slot of interactionSlotsFor({ col: toChar.seatCol, row: toChar.seatRow })) {
    if (taken.some((t) => Math.max(Math.abs(t.col - slot.col), Math.abs(t.row - slot.row)) <= 1)) continue;
    if (!isWalkable(slot.col, slot.row, tileMap, FURNITURE_BLOCKED_TILES as Set<string>)) continue;
    const tile = { col: slot.col, row: slot.row };
    const here = fromChar.tileCol === tile.col && fromChar.tileRow === tile.row;
    if (
      here ||
      findPath(fromChar.tileCol, fromChar.tileRow, tile.col, tile.row, tileMap, blockedTilesFor(fromChar, tile)).length > 0
    ) {
      return tile;
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

/**
 * Whether `ch`'s bubble is currently carrying THIS record's line, by the stamp
 * its writer left rather than by comparing the text (review WR-07). Two records
 * to one receiver whose titles cap to the same MAX_DIALOGUE_TITLE_CHARS produce
 * byte-identical lines, so equality names the wrong record roughly half the
 * time — and does so identically on the read path and the clear paths, which is
 * why both route through this one predicate.
 */
function showsLineOf(ch: Character, record: HandoffRecord): boolean {
  return ch.bubbleTextTaskId === record.taskId;
}

/** Clears a dialogue line with its partner id and its stamp, so the stamp can
 *  never outlive the text it names. */
function clearLine(ch: Character): void {
  ch.bubbleText = null;
  ch.bubbleTextPartnerId = null;
  ch.bubbleTextTaskId = null;
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
  if (toChar && record.acceptedText !== null && showsLineOf(toChar, record)) {
    clearLine(toChar);
  }
  if (senderIsCurrent(record)) {
    const fromChar = record.fromChar;
    if (record.requestedText !== null && showsLineOf(fromChar, record)) {
      clearLine(fromChar);
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
    if (showsLineOf(fromChar, record)) clearLine(fromChar);
    const seat = { col: fromChar.seatCol, row: fromChar.seatRow };
    walkCharacterTo(fromChar, seat.col, seat.row, getTileMap(), blockedTilesFor(fromChar, seat));
    if (toChar) {
      // The receiver "accepts and moves to work" at their existing desk —
      // per HANDOFF-01's exact wording, no second walk leg for them.
      // setRestPose: a receiver mid-walk on its own handoff keeps walking and
      // types when its walk ends (05-19, gap item 2). Still only here (05-04).
      setRestPose(toChar, CharacterState.TYPE);
      // null, never the id: a task id is not a title, and interpolating one is
      // what made the live bubble read as a debug banner (05-40, G-05-1b).
      const taskTitle = getTaskTitle(taskId) ?? null;
      const toAgentName = toChar.name ?? record.toAgentId;
      record.acceptedText = resolveHandoffDialogue("accepted", taskTitle, toAgentName);
      toChar.bubbleText = record.acceptedText;
      toChar.bubbleTextPartnerId = null;
      toChar.bubbleTextTaskId = record.taskId;
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

      // null, never the id (05-40, G-05-1b): the sender's line says what is
      // happening instead of inventing a title out of an identifier. The
      // receiver's NAME still falls back to its agent id — an unnamed agent
      // genuinely has its id as its display identity, and it now sits inside a
      // verb-led sentence rather than beside a bare symbol.
      const taskTitle = getTaskTitle(record.taskId) ?? null;
      const toChar = getCharacter(record.toAgentId);
      const toAgentName = toChar?.name ?? record.toAgentId;
      // 05-27: turn to the receiver before speaking. 05-34 (G-05-P2): the
      // sender now waits in the aisle two rows off the seat, so face along the
      // DOMINANT axis — up across the desk to a row-4 receiver, down to a
      // row-8 one; sideways only when the column gap is the bigger one.
      if (toChar) {
        const dc = toChar.tileCol - fromChar.tileCol;
        const dr = toChar.tileRow - fromChar.tileRow;
        if (Math.abs(dc) > Math.abs(dr)) fromChar.dir = dc > 0 ? Direction.RIGHT : Direction.LEFT;
        else if (dr !== 0) fromChar.dir = dr > 0 ? Direction.DOWN : Direction.UP;
      }
      record.requestedText = resolveHandoffDialogue("requested", taskTitle, toAgentName);
      fromChar.bubbleText = record.requestedText;
      fromChar.bubbleTextPartnerId = record.toAgentId;
      fromChar.bubbleTextTaskId = record.taskId;
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

/**
 * One live handoff as a host sees it (05-35, G-05-P4).
 *
 * `fullTitle` is the UNTRUNCATED title under the same blank-is-absent rule the
 * bubble uses (`titleOrNull`), before `resolveHandoffDialogue` caps it at
 * `MAX_DIALOGUE_TITLE_CHARS`, so a later hover, click or dashboard can show the
 * whole thing while the on-canvas label stays short. It is null when no title
 * is known, so a host shows its own no-title text rather than an id. `box` is where the last rendered frame drew THIS handoff's
 * line, for hit-testing; `speakerId` names whose bubble that is. A frame that
 * painted some other line for that speaker — the FSM advances on events, which
 * arrive off the host's WS handler rather than off the render loop — yields
 * `null` rather than a rect from an older frame (review CR-01).
 */
export interface ActiveHandoff {
  taskId: string;
  /** The untruncated registered title, trimmed, or null when none is known or
   *  the registered one is blank. Never the task id, which is not a title
   *  (05-40 G-05-1b, 05-41 WR-01). */
  fullTitle: string | null;
  fromAgentId: string;
  toAgentId: string;
  phase: HandoffPhase;
  /** The agent whose bubble currently shows this handoff's line, else null. */
  speakerId: string | null;
  /** That bubble's rect in canvas backing-store px, else null — null also when
   *  no rendered frame has drawn this line yet, or drew a different one. */
  box: { x: number; y: number; w: number; h: number } | null;
}

/**
 * Every live handoff, read-only (05-35, closes G-05-P4). Fresh plain objects
 * every call, so a host mutating a result changes neither the FSM nor the next
 * call. A retired handoff is simply absent.
 *
 * Read-only by construction, not by convention: nothing here writes, and the
 * only state it reads is the record map, the title registry and the renderer's
 * own per-frame placement record. No UI is built on it in this phase — hover,
 * click and dashboard surfacing are later work.
 */
export function getActiveHandoffs(): ActiveHandoff[] {
  const out: ActiveHandoff[] = [];
  for (const record of handoffs.values()) {
    // Whose bubble is showing this handoff's line right now. A line the FSM has
    // already cleared, or one a newer record overwrote, has no speaker —
    // showsLineOf reads the stamp the writer left, so two records whose lines
    // cap to the same text can never both claim one bubble (review WR-07).
    let speakerId: string | null = null;
    if (
      record.phase === "ICON_VISIBLE" &&
      senderIsCurrent(record) &&
      record.requestedText !== null &&
      showsLineOf(record.fromChar, record)
    ) {
      speakerId = record.fromAgentId;
    } else if (record.phase === "RETURNING_TO_DESK" && record.acceptedText !== null) {
      const toChar = getCharacter(record.toAgentId);
      if (toChar && showsLineOf(toChar, record)) {
        speakerId = record.toAgentId;
      }
    }
    out.push({
      taskId: record.taskId,
      fullTitle: titleOrNull(getTaskTitle(record.taskId)),
      fromAgentId: record.fromAgentId,
      toAgentId: record.toAgentId,
      phase: record.phase,
      speakerId,
      // Keyed on the record's own identity, the same stamp showsLineOf reads
      // above — so speaker attribution and rect attribution can never disagree
      // (review WR-01). The speakerId short-circuit is what makes the
      // overwritten-record contract hold.
      box: (speakerId === null ? undefined : getDialogueBox(speakerId, record.taskId)) ?? null,
    });
  }
  return out;
}

/** Test-only reset — mirrors index.ts's _resetForTests. */
export function _resetHandoffsForTests(): void {
  handoffs.clear();
  handledHandoffRequestIds.clear();
}

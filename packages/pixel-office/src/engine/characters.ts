// Forked from https://github.com/pixel-agents-hq/pixel-agents
// commit 3537e140c2094761beae748592aeb92ece8edfdd (main, fetched 2026-09-21)
// Forked under MIT — see packages/pixel-office/LICENSE
//
// Trimmed to remove the fork's own autonomous idle-wander AI (per 05-01-
// PLAN.md Task 2's own instruction): this office's characters move only in
// direct response to real events (agent.online, task.status_changed,
// agent.handoff_requested/completed pairs), never on a random wander timer
// independent of real state — RESEARCH.md Pitfall 2 / the Core Value's
// anti-fabrication rule ("never a prerecorded or faked animation"). Also
// dropped: seat assignment/seat-rest logic (no furniture/seats exist in this
// plan's minimal renderer) and the reading-vs-typing tool-name taxonomy
// (isReadingTool — packages/pixel-office has no toolUtils.js; READING is one
// of the two AgentStatus values this phase's derivation deliberately never
// emits, per 05-01-PLAN.md's flagged_assumptions). The WALK state's path-
// following logic is kept verbatim except for these modifications: a frozen
// character still walks, only its walk frame is held (05-17); every walk ends
// in the character's rest pose instead of IDLE, and a walk to the tile the
// character already stands on drops any pending path (05-19). 05-04's handoff
// choreography reuses it via walkCharacterTo below (RESEARCH.md Architecture
// Patterns → Pattern 1).

import {
  TILE_SIZE,
  TYPE_FRAME_DURATION_SEC,
  WALK_FRAME_DURATION_SEC,
  WALK_SPEED_PX_PER_SEC,
} from "../constants.js";
import { isCeoQueueTile } from "../layout/officeLayout.js";
import { findPath } from "../layout/tileMap.js";
import type { CharacterSprites } from "../sprites/spriteData.js";
import type { Character, SpriteData, TileType as TileTypeVal } from "../types.js";
import { CharacterState, Direction } from "../types.js";

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Direction from one tile to an adjacent tile */
function directionBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

export function createCharacter(id: string, tileCol = 1, tileRow = 1, hueShift = 0): Character {
  const center = tileCenter(tileCol, tileRow);
  return {
    id,
    state: CharacterState.IDLE,
    restPose: CharacterState.IDLE,
    dir: Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol,
    tileRow,
    seatCol: tileCol,
    seatRow: tileRow,
    path: [],
    moveProgress: 0,
    currentTool: null,
    hueShift,
    frame: 0,
    frameTimer: 0,
    bubbleType: null,
    statusBubble: null,
    frozen: false,
    frameSpeedMultiplier: 1,
  };
}

export function updateCharacter(ch: Character, dt: number): void {
  // D-03: frozen statuses (blocked/waiting_for_agent/waiting_for_ceo) freeze
  // the animation frame in every pose — a stuck agent must never read as
  // still actively working (05-02, status-mapping.ts). Frozen never freezes
  // position: a walk is a real handoff's movement and must complete (D-04,
  // 05-17), so WALK skips this early return and holds its frame below.
  if (ch.frozen && ch.state !== CharacterState.WALK) {
    ch.frame = 0;
    ch.frameTimer = 0;
    return;
  }

  ch.frameTimer += dt * ch.frameSpeedMultiplier;

  switch (ch.state) {
    case CharacterState.TYPE: {
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      break;
    }

    case CharacterState.IDLE: {
      // No idle animation — static pose. Event-driven only: no autonomous
      // wander decision here (see file header).
      ch.frame = 0;
      break;
    }

    case CharacterState.WALK: {
      if (ch.frozen) {
        ch.frame = 0;
        ch.frameTimer = 0;
      } else if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 4;
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and take the rest pose (05-19).
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;
        // 05-25: home (a seat or standing spot) faces the viewer; so does a
        // CEO queue slot (06-07), toward the viewer and the CEO desk.
        const home = ch.tileCol === ch.seatCol && ch.tileRow === ch.seatRow;
        if (home || isCeoQueueTile(ch.tileCol, ch.tileRow)) ch.dir = Direction.DOWN;
        ch.state = ch.restPose;
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }

      // Move toward next tile in path
      const nextTile = ch.path[0];
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
      const toCenter = tileCenter(nextTile.col, nextTile.row);
      const t = Math.min(ch.moveProgress, 1);
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

      if (ch.moveProgress >= 1) {
        ch.tileCol = nextTile.col;
        ch.tileRow = nextTile.row;
        ch.x = toCenter.x;
        ch.y = toCenter.y;
        ch.path.shift();
        ch.moveProgress = 0;
      }
      break;
    }
  }
}

/**
 * The only writer of a non-walk pose (05-19, review CR-01/IN-03). WALK is what
 * must never be interrupted (not path length): a walker keeps walking and
 * picks the pose up when its walk ends.
 */
export function setRestPose(ch: Character, pose: CharacterState): void {
  ch.restPose = pose;
  if (ch.state !== CharacterState.WALK) ch.state = pose;
}

/**
 * Path this character to a target tile via the forked BFS findPath and
 * transition to WALK. No-ops (stays in current state) if no path exists.
 * Already on the target tile: any pending path is dropped, so a walker ends
 * its walk there on its next update and a standing character counts as
 * arrived (05-19, review CR-01 path b). Reused by 05-04's handoff
 * walk-to-desk choreography (RESEARCH.md Architecture Patterns → Pattern 1).
 */
export function walkCharacterTo(
  ch: Character,
  targetCol: number,
  targetRow: number,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  if (ch.tileCol === targetCol && ch.tileRow === targetRow) {
    ch.path = [];
    ch.moveProgress = 0;
    return;
  }
  const path = findPath(ch.tileCol, ch.tileRow, targetCol, targetRow, tileMap, blockedTiles);
  if (path.length === 0) return;
  ch.path = path;
  ch.moveProgress = 0;
  ch.state = CharacterState.WALK;
  ch.frame = 0;
  ch.frameTimer = 0;
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      return sprites.typing[ch.dir][ch.frame % 2];
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4];
    case CharacterState.IDLE:
    default:
      return sprites.walk[ch.dir][1];
  }
}

// Public surface of the forked Canvas2D office engine. Pure consumer of
// already-projected company state (RESEARCH.md Anti-Pattern 1) — this module
// never reads git/GSD/Claude Code state directly, only AgentStatus values
// handed to it by apps/web's WS client.
import { AgentStatus } from "event-schema";
import { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE } from "./constants.js";

// Re-exported so apps/web can size its <canvas> from this package's own grid
// dimensions instead of hardcoding/duplicating them.
export { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE };
import { createCharacter, updateCharacter } from "./engine/characters.js";
import { startGameLoop as startForkGameLoop } from "./engine/gameLoop.js";
import { renderFrame } from "./engine/renderer.js";
// Re-exported (05-04, HANDOFF-01/02) so apps/web's App.tsx can wire real
// agent.handoff_requested/agent.handoff_completed events without importing
// a second package entry point. See handoff-choreography.ts's own header
// for why importing getCharacter/getTileMap/getTaskTitle back from this
// file (below) is a safe circular reference.
export { handleHandoffEvent, checkHandoffArrivals } from "./handoff/handoff-choreography.js";
import { _resetHandoffsForTests, checkHandoffArrivals } from "./handoff/handoff-choreography.js";
import { resolveStatusVisual } from "./status/status-mapping.js";
import type { Character } from "./types.js";
import { TileType } from "./types.js";

// Simple default office floor: a wall border around an open floor interior.
// No furniture/desks this plan (05-01) — agents are placed at sequential
// interior tiles as they come online.
function buildDefaultTileMap(): TileType[][] {
  const tiles: TileType[][] = [];
  for (let r = 0; r < DEFAULT_ROWS; r++) {
    const row: TileType[] = [];
    for (let c = 0; c < DEFAULT_COLS; c++) {
      const isBorder = r === 0 || r === DEFAULT_ROWS - 1 || c === 0 || c === DEFAULT_COLS - 1;
      row.push(isBorder ? TileType.WALL : TileType.FLOOR_1);
    }
    tiles.push(row);
  }
  return tiles;
}

const tileMap = buildDefaultTileMap();
const characters = new Map<string, Character>();
let nextSlot = 0;
const interiorCols = DEFAULT_COLS - 2;

// Task titles known so far (from snapshot's ProjectionState.tasks or live
// task.created events) — 05-04's handoff dialogue interpolates a real
// TaskState.title, never taskId/prompt/diff content. Missing entries fall
// back to the raw taskId at the call site (dialogue-templates.ts's callers).
const taskTitles = new Map<string, string>();

/** Registers a real task title for later handoff-dialogue interpolation (05-04). */
export function registerTaskTitle(taskId: string, title: string): void {
  taskTitles.set(taskId, title);
}

/** Read-only accessor — undefined when no title has been registered yet. */
export function getTaskTitle(taskId: string): string | undefined {
  return taskTitles.get(taskId);
}

/** Read-only accessor for the office's tile grid (05-04's handoff FSM
 *  needs it to compute walk paths via the forked findPath BFS). */
export function getTileMap(): TileType[][] {
  return tileMap;
}

function nextDeskPosition(): { col: number; row: number } {
  const slot = nextSlot++;
  return {
    col: 1 + (slot % interiorCols),
    row: 1 + Math.floor(slot / interiorCols),
  };
}

/**
 * Maps a real agent's real AgentStatus onto the forked Character FSM via
 * status/status-mapping.ts's exhaustive STATUS_MAP (05-02, OFFICE-01/
 * OFFICE-03) — every one of the 15 AgentStatus values now resolves to a
 * real pose/bubble/frozen/frameSpeedMultiplier combination, never a
 * fabricated/guessed one (STATUS_MAP has no fallback branch).
 */
export function upsertCharacterFromAgent(agentId: string, status: AgentStatus, name?: string): void {
  const visual = resolveStatusVisual(status);

  if (visual.pose === null) {
    // offline sentinel — not rendered. The fork's own matrixEffect despawn
    // transition was dropped from this repo's trimmed types.ts (05-01); no
    // equivalent one-shot effect exists here to reuse, so despawning is a
    // direct removal from the floor (documented in status-mapping.ts).
    characters.delete(agentId);
    return;
  }

  let ch = characters.get(agentId);
  if (!ch) {
    const { col, row } = nextDeskPosition();
    ch = createCharacter(agentId, col, row);
    characters.set(agentId, ch);
  }
  ch.state = visual.pose;
  // ponytail: an AgentStatus update mid-handoff overwrites the "handoff-task"
  // bubble/text a real handoff in progress may have set on this same agent
  // (handoff-choreography.ts). Acceptable for this MVP — upgrade path: give
  // the handoff overlay priority here if that ever causes visible flicker.
  ch.bubbleType = visual.bubble ?? null;
  ch.frozen = visual.frozen ?? false;
  ch.frameSpeedMultiplier = visual.frameSpeedMultiplier ?? 1;
  if (name) ch.name = name;
}

/** Read-only accessor for the current Character behind an agentId, if any. */
export function getCharacter(agentId: string): Character | undefined {
  return characters.get(agentId);
}

/** Starts the forked requestAnimationFrame loop against the given canvas. */
export function startGameLoop(canvas: HTMLCanvasElement): () => void {
  return startForkGameLoop(canvas, {
    update: (dt) => {
      for (const ch of characters.values()) {
        updateCharacter(ch, dt);
      }
      // 05-04: advance the handoff FSM's arrival-driven transitions after
      // every Character's own position update this frame — never a
      // separate timer, purely reading the just-updated WALK->IDLE signal.
      checkHandoffArrivals();
    },
    render: (ctx) => {
      renderFrame(ctx, canvas.width, canvas.height, tileMap, [...characters.values()]);
    },
  });
}

export function _resetForTests(): void {
  characters.clear();
  nextSlot = 0;
  taskTitles.clear();
  _resetHandoffsForTests();
}

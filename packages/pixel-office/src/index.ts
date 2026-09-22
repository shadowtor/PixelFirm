// Public surface of the forked Canvas2D office engine. Pure consumer of
// already-projected company state (RESEARCH.md Anti-Pattern 1) — this module
// never reads git/GSD/Claude Code state directly, only AgentStatus values
// handed to it by apps/web's WS client.
import { AgentStatus } from "event-schema";
import { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE } from "./constants.js";

// Re-exported so apps/web can size its <canvas> from this package's own grid
// dimensions instead of hardcoding/duplicating them.
export { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE };
import { createCharacter, setRestPose, updateCharacter } from "./engine/characters.js";
import { startGameLoop as startForkGameLoop } from "./engine/gameLoop.js";
import { renderFrame } from "./engine/renderer.js";
// Re-exported (05-04, HANDOFF-01/02) so apps/web's App.tsx can wire real
// agent.handoff_requested/agent.handoff_completed events without importing
// a second package entry point. See handoff-choreography.ts's own header
// for why importing getCharacter/getTileMap/getTaskTitle back from this
// file (below) is a safe circular reference.
export { handleHandoffEvent, checkHandoffArrivals } from "./handoff/handoff-choreography.js";
import { _resetHandoffsForTests, applyBubble, checkHandoffArrivals } from "./handoff/handoff-choreography.js";
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

// 05-10 (CR-02): desk rows need real glyph headroom, worked out from this
// package's own geometry — 16x32 sprite frames, TILE_SIZE 16 grid pitch,
// 11x13 glyphs, BUBBLE_ICON_GAP_PX 2. A character on interior row r draws at
// y = 16r - 24 and its glyph occupies [16r - 39, 16r - 26].
//
/** First interior row whose glyph clears y = 0: 16r - 39 >= 0 needs r >= 3. */
const DESK_ROW_START = 3;
/** Smallest row pitch p where a glyph clears the sprite box of the desk row
 *  behind it ([16(r-p) - 24, 16(r-p) + 8]): needs 16p > 47, i.e. p >= 3. */
const DESK_ROW_PITCH = 3;

/** Identity hues: twelve buckets, 30 degrees apart. */
const HUE_BUCKETS = 12;

/**
 * Per-agent IDENTITY colour for a character about to be created (WR-08).
 *
 * This is identity, NEVER state: 05-UI-SPEC.md's `## Color` section locks that
 * separation (D-03) and OFFICE-03 forbids colour being the only state signal,
 * so no AgentStatus value may ever influence this value. The agentId's FNV-1a
 * bucket is the preference; if a seated character already holds it, probe
 * forward (wrapping) to the first bucket nobody holds. Pure — no Math.random,
 * no Date.now. Called before the new character is inserted, so it never sees
 * itself.
 *
 * ponytail: two concurrently seated characters share a hue only if one was
 * seated while all twelve buckets were held, i.e. from the thirteenth
 * concurrently seated agent. A character keeps its hue for its lifetime even
 * if the collider leaves. Hues are stable across reloads except where a
 * collision was resolved in a different seating order. Upgrade path for more
 * than twelve: on-canvas name labels (05-UI-SPEC.md Typography reserves the
 * monospace/11px scale).
 */
function identityHueFor(agentId: string): number {
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < agentId.length; i++) {
    hash ^= agentId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const step = 360 / HUE_BUCKETS;
  const preferred = hash % HUE_BUCKETS;
  const held = new Set([...characters.values()].map((ch) => ch.hueShift));
  for (let i = 0; i < HUE_BUCKETS; i++) {
    const hue = ((preferred + i) % HUE_BUCKETS) * step;
    if (!held.has(hue)) return hue;
  }
  return preferred * step;
}

function deskForSlot(slot: number): { col: number; row: number } {
  const row = DESK_ROW_START + DESK_ROW_PITCH * Math.floor(slot / interiorCols);
  return { col: 1 + (slot % interiorCols), row: Math.min(row, DEFAULT_ROWS - 2) };
}

const DESK_CAPACITY =
  (Math.floor((DEFAULT_ROWS - 2 - DESK_ROW_START) / DESK_ROW_PITCH) + 1) * interiorCols;

/**
 * Lowest-numbered desk no seated character holds — derived from state, not a
 * counter, so an empty floor seats agent k at slot k exactly as before.
 *
 * ponytail: 54 CONCURRENTLY seated desks on the default 20x11 grid (rows
 * 3/6/9 x 18 cols). A despawned character's desk is reclaimed (lowest free
 * first), so churn no longer burns desks; only a 55th concurrently seated
 * character stacks on the last valid row rather than inside the wall border.
 * Upgrade path: a larger grid or a scrolling camera. No producer emits
 * OFFLINE today, so the reclaim path is exercised only through
 * upsertCharacterFromAgent's public contract until one does.
 */
function nextDeskPosition(): { col: number; row: number } {
  const taken = new Set([...characters.values()].map((ch) => `${ch.seatCol},${ch.seatRow}`));
  for (let slot = 0; slot < DESK_CAPACITY; slot++) {
    const desk = deskForSlot(slot);
    if (!taken.has(`${desk.col},${desk.row}`)) return desk;
  }
  return deskForSlot(characters.size);
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
    ch = createCharacter(agentId, col, row, identityHueFor(agentId));
    characters.set(agentId, ch);
  }
  // The pose goes through setRestPose, so it never interrupts a handoff walk
  // (05-VERIFICATION.md gap, review CR-01) and a status that lands mid-walk
  // is applied when the walk ends (IN-03). The status glyph is stored in
  // statusBubble and the displayed bubble is derived by applyBubble, so a
  // handoff never erases it and a waiting sender keeps its task icon unless
  // its status is frozen (05-20, review CR-01).
  setRestPose(ch, visual.pose);
  ch.statusBubble = visual.bubble ?? null;
  ch.frozen = visual.frozen ?? false;
  applyBubble(ch);
  ch.frameSpeedMultiplier = visual.frameSpeedMultiplier ?? 1;
  if (name) ch.name = name;
}

/** Read-only accessor for the current Character behind an agentId, if any. */
export function getCharacter(agentId: string): Character | undefined {
  return characters.get(agentId);
}

/**
 * The one per-frame update (05-17). The requestAnimationFrame loop and the
 * tests both run exactly this, so a test can never shortcut past it.
 */
export function stepOffice(dt: number): void {
  for (const ch of characters.values()) {
    updateCharacter(ch, dt);
  }
  // 05-04: advance the handoff FSM's arrival-driven transitions after
  // every Character's own position update this frame — never a
  // separate timer, purely reading the just-updated WALK->IDLE signal.
  checkHandoffArrivals();
}

/** Starts the forked requestAnimationFrame loop against the given canvas. */
export function startGameLoop(canvas: HTMLCanvasElement): () => void {
  return startForkGameLoop(canvas, {
    update: stepOffice,
    render: (ctx) => {
      renderFrame(ctx, canvas.width, canvas.height, tileMap, [...characters.values()]);
    },
  });
}

export function _resetForTests(): void {
  characters.clear();
  taskTitles.clear();
  _resetHandoffsForTests();
}

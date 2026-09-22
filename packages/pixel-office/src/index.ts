// Public surface of the forked Canvas2D office engine. Pure consumer of
// already-projected company state (RESEARCH.md Anti-Pattern 1) — this module
// never reads git/GSD/Claude Code state directly, only AgentStatus values
// handed to it by apps/web's WS client.
import { AgentStatus } from "event-schema";
import { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE } from "./constants.js";

// Re-exported so apps/web can size its <canvas> from this package's own grid
// dimensions instead of hardcoding/duplicating them.
export { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE };

// 05-21 (G-05-1a): the 320x176 office is never shown at native size — its
// 11x13 glyphs are unreadable there. Minimum integer presentation scale.
export const MIN_DISPLAY_SCALE = 3;

/** Largest integer scale at which the office grid fits the given viewport,
 *  never below MIN_DISPLAY_SCALE. Pure: any footer allowance is the caller's. */
export function displayScaleFor(viewportWidth: number, viewportHeight: number): number {
  return Math.max(
    MIN_DISPLAY_SCALE,
    Math.floor(
      Math.min(viewportWidth / (DEFAULT_COLS * TILE_SIZE), viewportHeight / (DEFAULT_ROWS * TILE_SIZE)),
    ),
  );
}
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
import { FURNITURE, OFFICE_TILE_MAP, SEATS, STANDING_SPOTS } from "./layout/officeLayout.js";
import { resolveStatusVisual } from "./status/status-mapping.js";
import type { Character } from "./types.js";
import { TileType } from "./types.js";

// 05-24 (G-05-1e): the furnished office grid from layout/office-layout.json.
const tileMap = OFFICE_TILE_MAP;
const characters = new Map<string, Character>();

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

const HOMES = [...SEATS, ...STANDING_SPOTS];

/**
 * First layout seat, then standing spot, that no present character holds —
 * derived from state, not a counter, so a despawned agent's seat is reclaimed
 * (lowest free first).
 *
 * ponytail: 16 seats + 4 standing spots; a 21st concurrently present agent
 * shares the last standing spot. Upgrade path: a larger layout or a second
 * floor (OFFICE-04).
 */
function nextDeskPosition(): { col: number; row: number } {
  const taken = new Set([...characters.values()].map((ch) => `${ch.seatCol},${ch.seatRow}`));
  return HOMES.find((h) => !taken.has(`${h.col},${h.row}`)) ?? HOMES[HOMES.length - 1];
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

/** Read-only view of every present Character (05-27: the handoff FSM's
 *  occupancy checks); same circular-import note as getCharacter. */
export function getCharacters(): IterableIterator<Character> {
  return characters.values();
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
      // The host sizes the backing store at an integer multiple of the grid
      // (05-21); the engine reads that multiple back, never guesses a scale.
      const zoom = Math.max(1, Math.floor(canvas.width / (DEFAULT_COLS * TILE_SIZE)));
      renderFrame(ctx, canvas.width, canvas.height, tileMap, [...characters.values()], zoom, FURNITURE);
    },
  });
}

export function _resetForTests(): void {
  characters.clear();
  taskTitles.clear();
  _resetHandoffsForTests();
}

// The furnished office (05-24, G-05-1e): office-layout.json is the single
// source for the tile grid, furniture, seats and standing spots; the pixels
// come only from 05-22's audited MetroCity Interior sprites (D-05). Malformed
// data throws at load, naming the problem (T-05-24-02).
import { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE } from "../constants.js";
import officeSprites from "../sprites/office-metrocity.json" with { type: "json" };
import type { Character, SpriteData } from "../types.js";
import { TileType } from "../types.js";
import layout from "./office-layout.json" with { type: "json" };

interface FurnitureEntry {
  sprite: string;
  col: number;
  row: number;
  w: number;
  h: number;
  blocks: boolean;
  dy?: number;
  z?: number;
}

/** A furniture sprite placed in unzoomed map pixels; zY sorts it with characters. */
export interface PlacedFurniture {
  sprite: SpriteData;
  x: number;
  y: number;
  zY: number;
}

const sprites = officeSprites.sprites as unknown as Record<string, { data: SpriteData | SpriteData[] }>;
const floorTiles = sprites.floorTiles.data as SpriteData[];
const wallTop = sprites.wallTop.data as SpriteData;
/** The desk sprite object itself, so a FURNITURE entry can be recognised as a
 *  desk by identity (05-33, G-05-P1) without adding a field to PlacedFurniture. */
export const DESK_SPRITE = sprites.desk.data as SpriteData;

export const OFFICE_TILE_MAP: TileType[][] = layout.tiles.map((line) =>
  Array.from(line, (ch) => (ch === "W" ? TileType.WALL : TileType.FLOOR_1)),
);
if (OFFICE_TILE_MAP.length !== DEFAULT_ROWS || OFFICE_TILE_MAP.some((r) => r.length !== DEFAULT_COLS)) {
  throw new Error(`office-layout.json: tiles must be ${DEFAULT_ROWS} rows of ${DEFAULT_COLS} chars`);
}

/** Sprite for a tile: a floor-plank quadrant, the wall-top tile on row 0, or
 *  null (drawn as a flat WALL_COLOR fill). */
export function tileSpriteAt(col: number, row: number): SpriteData | null {
  const t = OFFICE_TILE_MAP[row]?.[col];
  if (t === undefined || t === TileType.VOID) return null;
  if (t === TileType.WALL) return row === 0 ? wallTop : null;
  return floorTiles[(row % 2) * 2 + (col % 2)];
}

const entries = layout.furniture as FurnitureEntry[];
const blocked = new Set<string>();

export const FURNITURE: readonly PlacedFurniture[] = entries.map((e) => {
  const sprite = sprites[e.sprite]?.data as SpriteData | undefined;
  if (!sprite || Array.isArray(sprite[0]?.[0])) {
    throw new Error(`office-layout.json: furniture sprite "${e.sprite}" is not a single sprite in office-metrocity.json`);
  }
  if (e.blocks) for (let r = e.row; r < e.row + e.h; r++) for (let c = e.col; c < e.col + e.w; c++) blocked.add(`${c},${r}`);
  const bottom = (e.row + e.h) * TILE_SIZE;
  return {
    sprite,
    x: e.col * TILE_SIZE + Math.round((e.w * TILE_SIZE - (sprite[0]?.length ?? 0)) / 2),
    y: bottom - sprite.length + (e.dy ?? 0),
    // A character on the seat row (zY 16r + 16.5) sorts before the desk below
    // it (16(r + 2)); one in the lane below the desk sorts after it.
    zY: bottom + (e.z ?? 0) * 0.01,
  };
});

/** "col,row" of every footprint tile of a blocking furniture piece. */
export const FURNITURE_BLOCKED_TILES: ReadonlySet<string> = blocked;

const toTiles = (list: number[][]): ReadonlyArray<{ col: number; row: number }> =>
  list.map(([col, row]) => ({ col, row }));
/** Seats in assignment order; each faces the viewer with a desk tile below. */
export const SEATS = toTiles(layout.seats);
/** Overflow standing spots, on the seat rows in the right strip. */
export const STANDING_SPOTS = toTiles(layout.standing);

/**
 * The CEO room's waiting slots (06-07, CEO-01, D-10), front of the line first.
 * "Waiting-chair slots" is only the data's name: queued agents stand on them.
 * A slot on a wall, on blocking furniture or on a home throws at load.
 */
export const CEO_QUEUE_SLOTS: ReadonlyArray<{ col: number; row: number }> = (() => {
  const raw = (layout as { ceoQueue?: unknown }).ceoQueue;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`office-layout.json: ceoQueue must be a non-empty array of [col, row] slots`);
  }
  const list = toTiles(raw as number[][]);
  for (const { col, row } of list) {
    const where = `office-layout.json: ceoQueue slot (${col},${row})`;
    if (OFFICE_TILE_MAP[row]?.[col] !== TileType.FLOOR_1) throw new Error(`${where} is not a floor tile (wall or off the map)`);
    if (blocked.has(`${col},${row}`)) throw new Error(`${where} is on blocking furniture`);
    if ([...SEATS, ...STANDING_SPOTS].some((h) => h.col === col && h.row === row)) {
      throw new Error(`${where} is a home (seat or standing spot)`);
    }
  }
  return list;
})();

/** True when (col, row) is one of the CEO room's waiting slots. */
export function isCeoQueueTile(col: number, row: number): boolean {
  return CEO_QUEUE_SLOTS.some((s) => s.col === col && s.row === row);
}

interface InteractionData {
  row: number;
  colOffsets: number[];
}

/**
 * The home (seat or standing spot) too close to `row` for the aisle rule to
 * hold, if any — the invariant `interactionSlotsFor` promises and
 * `interactionTileFor` relies on (review WR-04).
 *
 * A slot within Chebyshev distance 1 of any home is rejected as taken by the
 * FSM, so an interaction row within 1 row of a home leaves every slot beside a
 * seated or standing agent and returns null for essentially every receiver —
 * silently disabling the whole handoff walk. Rows 3/5/7/9 of the shipped layout
 * are exactly that: in range, with free floor, and useless.
 */
export function homeNearRow(row: number): { col: number; row: number } | undefined {
  return [...SEATS, ...STANDING_SPOTS].find((h) => Math.abs(h.row - row) <= 1);
}
const INTERACTION: InteractionData = (() => {
  const raw = layout.interaction as InteractionData | undefined;
  if (!raw || typeof raw.row !== "number" || !Array.isArray(raw.colOffsets) || raw.colOffsets.length === 0) {
    throw new Error(`office-layout.json: interaction must be { row, colOffsets: [<at least one offset>] }`);
  }
  if (!Number.isInteger(raw.row) || raw.row < 0 || raw.row >= OFFICE_TILE_MAP.length) {
    throw new Error(`office-layout.json: interaction.row ${raw.row} is outside the ${OFFICE_TILE_MAP.length}-row map`);
  }
  if (!OFFICE_TILE_MAP[raw.row]!.some((t, col) => t === TileType.FLOOR_1 && !blocked.has(`${col},${raw.row}`))) {
    throw new Error(`office-layout.json: interaction.row ${raw.row} has no free floor tile`);
  }
  // The load-bearing one (review WR-04): the checks above throw on harmless
  // misconfigurations and used to wave through the harmful one.
  const nearHome = homeNearRow(raw.row);
  if (nearHome) {
    throw new Error(
      `office-layout.json: interaction.row ${raw.row} is within 1 row of the home at ` +
        `(${nearHome.col},${nearHome.row}) — every slot would be shoulder-to-shoulder with a seated agent`,
    );
  }
  return raw;
})();

/**
 * Where a handoff sender waits while handing off to the agent whose HOME is
 * `home` (05-34, G-05-P2): the fixed slots on the central aisle row
 * (`interaction.row`) at `interaction.colOffsets` from the home's column, in
 * layout preference order, minus any that fall outside the floor, on furniture
 * or on another home.
 *
 * The aisle row is the only interior row two tiles from every seat and standing
 * spot, so no slot can ever be shoulder-to-shoulder with a seated or standing
 * agent — which is exactly what 05-27's seat-row search could not promise.
 */
export function interactionSlotsFor(home: { col: number; row: number }): ReadonlyArray<{ col: number; row: number }> {
  const row = INTERACTION.row;
  const isHome = (col: number, r: number): boolean =>
    SEATS.some((h) => h.col === col && h.row === r) || STANDING_SPOTS.some((h) => h.col === col && h.row === r);
  // 06-07: the aisle between the home's column and the slot must be open floor,
  // so no slot lies across the CEO room's partition wall (or on a queue slot).
  const openAisle = (col: number): boolean => {
    for (let c = Math.min(col, home.col); c <= Math.max(col, home.col); c++) {
      if (OFFICE_TILE_MAP[row]?.[c] !== TileType.FLOOR_1) return false;
    }
    return true;
  };
  return INTERACTION.colOffsets
    .map((d) => ({ col: home.col + d, row }))
    .filter((s) => openAisle(s.col) && !blocked.has(`${s.col},${s.row}`) && !isHome(s.col, s.row));
}

/** True when the character stands on its own seat and that tile is a SEATS entry. */
export function isOwnSeat(ch: Character): boolean {
  return (
    ch.tileCol === ch.seatCol &&
    ch.tileRow === ch.seatRow &&
    SEATS.some((s) => s.col === ch.seatCol && s.row === ch.seatRow)
  );
}

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

/** True when the character stands on its own seat and that tile is a SEATS entry. */
export function isOwnSeat(ch: Character): boolean {
  return (
    ch.tileCol === ch.seatCol &&
    ch.tileRow === ch.seatRow &&
    SEATS.some((s) => s.col === ch.seatCol && s.row === ch.seatRow)
  );
}

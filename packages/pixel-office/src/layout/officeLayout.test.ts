// 06-07 (CEO-01, D-10): the 24x13 office with a walled CEO room and its
// four-slot queue, guarded like the Phase 5 layout data (06-UI-SPEC "CEO Room
// Contract"). The office grew right and down only, so every Phase 5 value is
// pinned here as a literal copied from the pre-change office-layout.json.
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE } from "../constants.js";
import { createCharacter } from "../engine/characters.js";
import { renderScene } from "../engine/renderer.js";
import { displayScaleFor } from "../index.js";
import type { Character } from "../types.js";
import { TileType } from "../types.js";
import layout from "./office-layout.json" with { type: "json" };
import * as officeLayout from "./officeLayout.js";
import { FURNITURE_BLOCKED_TILES, OFFICE_TILE_MAP, SEATS, STANDING_SPOTS } from "./officeLayout.js";
import { findPath } from "./tileMap.js";

type Tile = { col: number; row: number };
const DOOR: Tile = { col: 19, row: 7 };
const slots = (): ReadonlyArray<Tile> => officeLayout.CEO_QUEUE_SLOTS ?? [];
const key = (t: Tile): string => `${t.col},${t.row}`;

// Pre-change (Phase 5) layout data, copied verbatim.
const P5_SEATS = [[1, 4], [3, 4], [5, 4], [7, 4], [9, 4], [11, 4], [13, 4], [15, 4], [1, 8], [3, 8], [5, 8], [7, 8], [9, 8], [11, 8], [13, 8], [15, 8]];
const P5_STANDING = [[17, 4], [18, 4], [17, 8], [18, 8]];
const P5_INTERACTION = { row: 6, colOffsets: [1, -1, 3, -3, 5, -5] };
const desk = (col: number, row: number) => ({ sprite: "desk", col, row, w: 3, h: 1, blocks: true });
const monitor = (col: number, row: number) => ({ sprite: "monitorBack", col, row, w: 1, h: 1, blocks: false, dy: -18, z: 1 });
const P5_FURNITURE = [
  ...[1, 5, 9, 13].map((c) => desk(c, 5)),
  ...[1, 5, 9, 13].map((c) => desk(c, 9)),
  ...[1, 3, 5, 7, 9, 11, 13, 15].map((c) => monitor(c, 5)),
  ...[1, 3, 5, 7, 9, 11, 13, 15].map((c) => monitor(c, 9)),
  { sprite: "bookcase", col: 17, row: 1, w: 2, h: 2, blocks: true },
  { sprite: "cabinet", col: 17, row: 5, w: 2, h: 1, blocks: true },
  { sprite: "plant", col: 18, row: 9, w: 1, h: 1, blocks: true },
  { sprite: "plantSmall", col: 17, row: 9, w: 1, h: 1, blocks: true },
  { sprite: "painting", col: 4, row: 0, w: 1, h: 1, blocks: false },
  { sprite: "painting", col: 12, row: 0, w: 1, h: 1, blocks: false },
];

describe("CEO room layout (06-07, CEO-01)", () => {
  it("is a 24x13 grid with the room behind a partition on col 19 and one door at (19, 7)", () => {
    expect(OFFICE_TILE_MAP).toHaveLength(13);
    for (const row of OFFICE_TILE_MAP) expect(row).toHaveLength(24);
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 24; c++) {
        const border = r === 0 || r === 12 || c === 0 || c === 23;
        const partition = c === 19 && !(r === DOOR.row);
        const want = border || partition ? TileType.WALL : TileType.FLOOR_1;
        expect(OFFICE_TILE_MAP[r][c], `(${c},${r})`).toBe(want);
      }
    }
  });

  it("keeps every Phase 5 seat, standing spot, interaction value and furniture entry exactly", () => {
    expect(SEATS).toEqual(P5_SEATS.map(([col, row]) => ({ col, row })));
    expect(STANDING_SPOTS).toEqual(P5_STANDING.map(([col, row]) => ({ col, row })));
    expect(layout.interaction).toEqual(P5_INTERACTION);
    expect(layout.furniture.slice(0, 30)).toEqual(P5_FURNITURE);
  });

  it("declares the four queue slots in front-of-line order, every pair Chebyshev >= 2 apart", () => {
    expect(slots()).toEqual([
      { col: 21, row: 8 },
      { col: 20, row: 6 },
      { col: 22, row: 6 },
      { col: 21, row: 4 },
    ]);
    for (const a of slots()) {
      for (const b of slots()) {
        if (a === b) continue;
        expect(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)), `${key(a)} vs ${key(b)}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(officeLayout.isCeoQueueTile?.(21, 8)).toBe(true);
    expect(officeLayout.isCeoQueueTile?.(21, 7)).toBe(false);
  });

  it("never paints one queued agent's glyph on another queued agent's sprite", () => {
    expect(slots()).toHaveLength(4);
    const chars: Character[] = slots().map((s, i) => createCharacter(`q${i}`, s.col, s.row, i * 30));
    const cells = (rects: Array<{ x: number; y: number; w: number; h: number }>): Set<string> => {
      const out = new Set<string>();
      for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.add(`${x},${y}`);
      return out;
    };
    const record = () => {
      const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
      const ctx = {
        fillStyle: "",
        font: "",
        fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h }),
        fillText() {},
        measureText: () => ({ width: 0 }),
        clearRect() {},
        drawImage() {},
      } as unknown as CanvasRenderingContext2D;
      return { ctx, rects };
    };
    const sprite: Set<string>[] = [];
    const glyph: Set<string>[] = [];
    for (const ch of chars) {
      ch.bubbleType = null;
      const control = record();
      renderScene(control.ctx, [ch], 0, 0, 1);
      ch.bubbleType = "permission";
      const withGlyph = record();
      renderScene(withGlyph.ctx, [ch], 0, 0, 1);
      sprite.push(cells(control.rects));
      glyph.push(cells(withGlyph.rects.slice(control.rects.length)));
    }
    for (let i = 0; i < 4; i++) {
      expect(glyph[i].size, `slot ${i} drew no glyph`).toBeGreaterThan(0);
      for (let j = 0; j < 4; j++) {
        if (i === j) continue;
        const hits = [...glyph[i]].filter((k) => sprite[j].has(k));
        expect(hits, `glyph of slot ${i} lands on the sprite of slot ${j}`).toEqual([]);
      }
    }
  });

  it("reaches every slot from the door while the other three are occupied, and the door from a seat", () => {
    expect(slots()).toHaveLength(4);
    for (const s of slots()) {
      const blocked = new Set(FURNITURE_BLOCKED_TILES);
      for (const o of slots()) if (o !== s) blocked.add(key(o));
      const path = findPath(DOOR.col, DOOR.row, s.col, s.row, OFFICE_TILE_MAP, blocked);
      expect(path.length, `door -> ${key(s)}`).toBeGreaterThan(0);
    }
    expect(findPath(1, 4, DOOR.col, DOOR.row, OFFICE_TILE_MAP, new Set(FURNITURE_BLOCKED_TILES)).length).toBeGreaterThan(0);
  });

  it("keeps furniture off the slots, the door, the entrance and the col-21 walk path, with the CEO desk at (20..22, 10)", () => {
    const keep = new Set([...slots().map(key), key(DOOR), "20,7", ...[4, 5, 6, 7, 8, 9].map((r) => `21,${r}`)]);
    for (const f of layout.furniture) {
      for (let r = f.row; r < f.row + f.h; r++) {
        for (let c = f.col; c < f.col + f.w; c++) expect(keep.has(`${c},${r}`), `${f.sprite} covers (${c},${r})`).toBe(false);
      }
    }
    const inRoom = layout.furniture.filter((f) => f.col >= 20 && f.col <= 22);
    const ceoDesk = inRoom.filter((f) => f.sprite === "desk");
    expect(ceoDesk).toEqual([{ sprite: "desk", col: 20, row: 10, w: 3, h: 1, blocks: true }]);
    expect(inRoom.some((f) => f.sprite === "monitorBack")).toBe(false);
    expect(inRoom.some((f) => ["plant", "plantSmall", "bookcase", "painting"].includes(f.sprite))).toBe(true);
    expect(OFFICE_TILE_MAP[11][21]).toBe(TileType.FLOOR_1);
    expect(FURNITURE_BLOCKED_TILES.has("21,11")).toBe(false);
  });

  it("throws at load, naming the slot, for a ceoQueue slot on a wall, on blocking furniture or on a home", async () => {
    for (const [slot, why] of [
      [[19, 3], /ceoQueue slot \(19,3\).*wall/],
      [[17, 5], /ceoQueue slot \(17,5\).*furniture/],
      [[1, 4], /ceoQueue slot \(1,4\).*home/],
    ] as const) {
      vi.resetModules();
      vi.doMock("./office-layout.json", () => ({ default: { ...layout, ceoQueue: [[21, 8], slot] } }));
      await expect(import("./officeLayout.js")).rejects.toThrow(why);
      vi.doUnmock("./office-layout.json");
    }
    vi.resetModules();
  });

  it("presents 1920x1080 and 1920x1040 at 5x and 1280x720 at 3x on the 384x208 map", () => {
    expect(DEFAULT_COLS * TILE_SIZE).toBe(384);
    expect(DEFAULT_ROWS * TILE_SIZE).toBe(208);
    expect(displayScaleFor(1920, 1080)).toBe(5);
    expect(displayScaleFor(1920, 1040)).toBe(5);
    expect(displayScaleFor(1280, 720)).toBe(3);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { BubbleType } from "../types.js";
import { BUBBLE_SPRITES, resolveBubbleSprite } from "./bubbleSprites.js";
import { STATUS_MAP } from "../status/status-mapping.js";
import { FALLBACK_FLOOR_COLOR } from "../constants.js";
import officeSprites from "./office-metrocity.json" with { type: "json" };

/** The literal 12 members of the BubbleType union (types.ts). */
const ALL_BUBBLE_TYPES: BubbleType[] = [
  "permission",
  "waiting",
  "blocked",
  "failed",
  "completed",
  "planning",
  "researching",
  "testing",
  "reviewing",
  "discussing",
  "deploying",
  "handoff-task",
];

describe("BUBBLE_SPRITES exhaustiveness", () => {
  it("has a defined SpriteData entry for every one of the 12 BubbleType members", () => {
    expect(Object.keys(BUBBLE_SPRITES).length).toBe(12);
    for (const bubbleType of ALL_BUBBLE_TYPES) {
      const sprite = resolveBubbleSprite(bubbleType);
      expect(sprite, bubbleType).toBeDefined();
      expect(Array.isArray(sprite), bubbleType).toBe(true);
      expect(sprite.length, bubbleType).toBe(13);
      expect(sprite).toBe(BUBBLE_SPRITES[bubbleType]);
    }
  });

  it("has no keys beyond the 12 BubbleType members", () => {
    expect(Object.keys(BUBBLE_SPRITES).sort()).toEqual([...ALL_BUBBLE_TYPES].sort());
  });
});

const spritesDir = dirname(fileURLToPath(import.meta.url));

const NEW_SPRITE_FILES = ["bubble-permission.json", "bubble-waiting.json", "bubble-handoff-task.json"];

describe("newly authored bubble icon assets (05-07)", () => {
  it.each(NEW_SPRITE_FILES)("%s parses as valid JSON with a palette object and a 13x11 pixels grid", (file) => {
    const raw = readFileSync(join(spritesDir, file), "utf-8");
    const parsed = JSON.parse(raw) as { palette: Record<string, string>; pixels: string[][] };
    expect(typeof parsed.palette).toBe("object");
    expect(parsed.palette).not.toBeNull();
    expect(Object.keys(parsed.palette).length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.pixels)).toBe(true);
    expect(parsed.pixels.length).toBe(13);
    for (const row of parsed.pixels) {
      expect(Array.isArray(row)).toBe(true);
      expect(row.length).toBe(11);
    }
  });
});

/** Colour-blind silhouette proxy: which cells are painted, not what colour. */
function silhouette(sprite: string[][]): string {
  return sprite.map((row) => row.map((cell) => (cell ? "#" : ".")).join("")).join("\n");
}

describe("OFFICE-03 distinct-silhouette prohibition", () => {
  it("gives all 12 glyphs a pixel pattern no other glyph repeats (never a recolour)", () => {
    const seen = new Map<string, BubbleType>();
    for (const bubbleType of ALL_BUBBLE_TYPES) {
      const shape = silhouette(resolveBubbleSprite(bubbleType));
      const clash = seen.get(shape);
      expect(clash, `${bubbleType} is a recolour of ${clash}`).toBeUndefined();
      seen.set(shape, bubbleType);
    }
    expect(seen.size).toBe(12);
  });

  it("does not reuse bubble-completed's checkmark silhouette for waiting", () => {
    expect(silhouette(resolveBubbleSprite("waiting"))).not.toBe(silhouette(resolveBubbleSprite("completed")));
  });
});

describe("palette resolution", () => {
  it("maps every non-empty cell to a hex colour and leaves empty cells empty", () => {
    for (const bubbleType of ALL_BUBBLE_TYPES) {
      for (const row of resolveBubbleSprite(bubbleType)) {
        for (const cell of row) {
          if (cell !== "") expect(cell, `${bubbleType}: ${cell}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      }
    }
  });
});

/** WCAG 2.x relative luminance of a #rrggbb colour. */
function relLum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const FLOOR_TILES = officeSprites.sprites.floorTiles.data as string[][][];

/** Average RGB of a tile's cells, as #rrggbb. */
function meanColor(tile: string[][]): string {
  const cells = tile.flat().filter(Boolean);
  const avg = [1, 3, 5].map((i) => Math.round(cells.reduce((s, c) => s + parseInt(c.slice(i, i + 2), 16), 0) / cells.length));
  return `#${avg.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Bubble keys of every frozen STATUS_MAP entry (derived, not hard-coded). */
const FROZEN = [
  ...new Set(
    Object.values(STATUS_MAP)
      .filter((v) => v.frozen === true && v.bubble)
      .map((v) => v.bubble as BubbleType),
  ),
].sort();

/** Split a glyph into its edge cells (opaque with a transparent/out-of-grid 4-neighbour) and interior cells. */
function edgeAndInterior(sprite: string[][]): { edge: string[]; interior: string[] } {
  const edge: string[] = [];
  const interior: string[] = [];
  const at = (y: number, x: number) => sprite[y]?.[x] ?? "";
  sprite.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (!cell) return;
      const open = [at(y - 1, x), at(y + 1, x), at(y, x - 1), at(y, x + 1)].some((n) => !n);
      (open ? edge : interior).push(cell);
    }),
  );
  return { edge, interior };
}

describe("G-05-2 frozen-state glyph contrast (shape + animation, never colour alone)", () => {
  it("derives the frozen glyph set from STATUS_MAP", () => {
    expect(FROZEN).toEqual(["blocked", "permission", "waiting"]);
  });

  it.each(FROZEN)("%s has a closed near-black outline", (key) => {
    const { edge } = edgeAndInterior(resolveBubbleSprite(key));
    const colours = new Set(edge.map((c) => c.toLowerCase()));
    expect([...colours], key).toHaveLength(1);
    expect(relLum([...colours][0]!), key).toBeLessThanOrEqual(0.03);
  });

  it.each(FROZEN)("%s interior contrasts with its outline (>= 3:1)", (key) => {
    const { edge, interior } = edgeAndInterior(resolveBubbleSprite(key));
    expect(interior.length, key).toBeGreaterThan(0);
    for (const cell of interior) expect(contrast(cell, edge[0]!), `${key} ${cell}`).toBeGreaterThanOrEqual(3);
  });

  it.each(FROZEN)("%s outline contrasts with the floor (>= 3:1)", (key) => {
    const { edge } = edgeAndInterior(resolveBubbleSprite(key));
    expect(contrast(edge[0]!, FALLBACK_FLOOR_COLOR), key).toBeGreaterThanOrEqual(3);
  });

  // 05-26: the real floor is MetroCity planks, not FALLBACK_FLOOR_COLOR.
  it.each(FROZEN)("%s is legible on the MetroCity floor (outline or main fill >= 3:1 vs each tile's mean)", (key) => {
    const sprite = resolveBubbleSprite(key);
    const outline = edgeAndInterior(sprite).edge[0]!.toLowerCase();
    const counts = new Map<string, number>();
    for (const c of sprite.flat()) if (c && c.toLowerCase() !== outline) counts.set(c, (counts.get(c) ?? 0) + 1);
    const mainFill = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
    for (const [i, tile] of FLOOR_TILES.entries()) {
      const bg = meanColor(tile);
      expect(Math.max(contrast(outline, bg), contrast(mainFill, bg)), `${key} on floor tile ${i} (${bg})`).toBeGreaterThanOrEqual(3);
    }
  });

  it("shape separates the stuck states (>= 20 differing cells per pair)", () => {
    for (let i = 0; i < FROZEN.length; i++) {
      for (let j = i + 1; j < FROZEN.length; j++) {
        const a = resolveBubbleSprite(FROZEN[i]!);
        const b = resolveBubbleSprite(FROZEN[j]!);
        let diff = 0;
        a.forEach((row, y) => row.forEach((cell, x) => (diff += Number(!cell !== !b[y]![x]))));
        expect(diff, `${FROZEN[i]} vs ${FROZEN[j]}`).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

// ── G-05-P5 (05-32): the waiting_for_agent glyph must read as an hourglass by
// silhouette alone at 1x. The pre-05-32 asset had a 5-px, 3-row neck and
// flat-sided bulbs, so it read as a spool or a capital I and identification
// leaned on its blue colour (OFFICE-03 / D-03 forbid exactly that).

describe("1x hourglass silhouette (G-05-P5)", () => {
  const sprite = resolveBubbleSprite("waiting");
  const CAP_ROWS = 3;
  const widths = sprite.map((row) => row.filter(Boolean).length);
  const outline = edgeAndInterior(sprite).edge[0]!.toLowerCase();
  const nonOutline = (row: string[]) => row.filter((c) => c && c.toLowerCase() !== outline);
  /** Ink widths of the rows strictly between the two caps (the bulbs + waist). */
  const between = widths.slice(CAP_ROWS, sprite.length - CAP_ROWS);
  const waistRow = CAP_ROWS + between.indexOf(Math.min(...between));
  /** The two non-outline fills, darker first: sand (#4361ee) before glass (#a9bcff). */
  const fills = [...new Set(sprite.flat().filter(Boolean).map((c) => c.toLowerCase()))]
    .filter((c) => c !== outline)
    .sort((a, b) => relLum(a) - relLum(b));
  const countColor = (rows: number[], color: string) =>
    rows.reduce((n, r) => n + sprite[r]!.filter((c) => c.toLowerCase() === color).length, 0);
  const rowRange = (from: number, to: number) => (to < from ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i));

  it("has heavy caps: the first 3 and the last 3 rows each span all 11 columns", () => {
    for (const r of [...rowRange(0, CAP_ROWS - 1), ...rowRange(sprite.length - CAP_ROWS, sprite.length - 1)]) {
      expect(sprite[r]!.every(Boolean), `row ${r} is not full-width ink`).toBe(true);
      expect(widths[r], `row ${r}`).toBe(11);
    }
  });

  it("pinches to a single-pixel-fill waist: exactly one row between the caps is 3 px of ink with 1 fill cell", () => {
    expect(Math.min(...between)).toBe(3);
    expect(between.filter((w) => w === 3)).toHaveLength(1);
    expect(nonOutline(sprite[waistRow]!), `row ${waistRow} fill`).toHaveLength(1);
  });

  it("has triangular bulbs: ink narrows strictly down to the waist and widens strictly away from it", () => {
    for (const r of rowRange(CAP_ROWS + 1, waistRow)) {
      expect(widths[r], `row ${r} must be narrower than row ${r - 1}`).toBeLessThan(widths[r - 1]!);
    }
    for (const r of rowRange(waistRow + 1, sprite.length - CAP_ROWS - 1)) {
      expect(widths[r], `row ${r} must be wider than row ${r - 1}`).toBeGreaterThan(widths[r - 1]!);
    }
  });

  it("puts the sand in the lower bulb: more of the darker fill below the waist than above it", () => {
    const sand = fills[0]!;
    const above = countColor(rowRange(CAP_ROWS, waistRow - 1), sand);
    const below = countColor(rowRange(waistRow + 1, sprite.length - CAP_ROWS - 1), sand);
    expect(below, `sand ${sand}: ${below} below vs ${above} above`).toBeGreaterThan(above);
  });
});

// ── G-05-1a (05-39): the silhouette above is correct, but at stream resolution
// the glyph still read as a blue bowtie, because the upper bulb was painted in
// the same blue as the sand. The empty/full split — the one thing that makes an
// hourglass an hourglass — was invisible, so identification leaned on the colour
// again. These cases assert the LUMINANCE structure (dark plate, light bulb,
// pinch, dark bulb, dark plate), so the read survives desaturation and heavily
// compressed stream video. Both fills are derived by luminance order, never by
// hex literal, so the assertions stay honest if the palette is retuned.

describe("reads as an hourglass in grayscale (05-39, G-05-1a)", () => {
  const sprite = resolveBubbleSprite("waiting");
  const CAP_ROWS = 3;
  const widths = sprite.map((row) => row.filter(Boolean).length);
  const outline = edgeAndInterior(sprite).edge[0]!.toLowerCase();
  /** Same waist derivation as the silhouette describe: narrowest row between the caps. */
  const between = widths.slice(CAP_ROWS, sprite.length - CAP_ROWS);
  const waistRow = CAP_ROWS + between.indexOf(Math.min(...between));
  /** The two non-outline fills, darker first: sand before glass. */
  const [sand, glass] = [...new Set(sprite.flat().filter(Boolean).map((c) => c.toLowerCase()))]
    .filter((c) => c !== outline)
    .sort((a, b) => relLum(a) - relLum(b)) as [string, string];
  /** Cells of one inclusive row band. Rows 0 and the last are plates, not bulb content. */
  const countIn = (from: number, to: number, color: string) =>
    sprite
      .slice(from, to + 1)
      .flat()
      .filter((c) => c.toLowerCase() === color).length;
  const lastRow = sprite.length - 1;

  it("keeps the upper bulb visibly empty: light fill outnumbers sand at least 3 to 1 above the waist", () => {
    const light = countIn(1, waistRow - 1, glass);
    const dark = countIn(1, waistRow - 1, sand);
    expect(light, "upper bulb has no light fill").toBeGreaterThan(0);
    expect(light, `upper bulb: ${light} light (${glass}) vs ${dark} sand (${sand})`).toBeGreaterThanOrEqual(3 * dark);
  });

  it("separates glass from sand by luminance alone (>= 3:1, survives desaturation)", () => {
    expect(contrast(glass, sand), `${glass} vs ${sand}`).toBeGreaterThanOrEqual(3);
  });

  it("fills the lower bulb: sand outnumbers light fill below the waist", () => {
    const dark = countIn(waistRow + 1, lastRow - 1, sand);
    const light = countIn(waistRow + 1, lastRow - 1, glass);
    expect(dark, `lower bulb: ${dark} sand (${sand}) vs ${light} light (${glass})`).toBeGreaterThan(light);
  });

  it("caps the profile with solid plates: first and last rows are entirely the darkest colour", () => {
    for (const r of [0, lastRow]) {
      expect(
        sprite[r]!.every((c) => c.toLowerCase() === outline),
        `row ${r} is not solid ${outline}`,
      ).toBe(true);
    }
    expect(relLum(outline), `${outline} must be darker than both fills`).toBeLessThan(relLum(sand));
  });
});

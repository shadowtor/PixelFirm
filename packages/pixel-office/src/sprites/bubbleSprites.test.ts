import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { BubbleType } from "../types.js";
import { BUBBLE_SPRITES, resolveBubbleSprite } from "./bubbleSprites.js";
import { STATUS_MAP } from "../status/status-mapping.js";
import { FALLBACK_FLOOR_COLOR } from "../constants.js";

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

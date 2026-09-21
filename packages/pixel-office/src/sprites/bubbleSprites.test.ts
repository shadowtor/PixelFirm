import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { BubbleType } from "../types.js";
import { BUBBLE_SPRITES, resolveBubbleSprite } from "./bubbleSprites.js";

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

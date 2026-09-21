import { describe, it, expect } from "vitest";
import { Direction } from "../types.js";
import { getCharacterSprites } from "./spriteData.js";

function hasNonEmptyCell(sprite: string[][]): boolean {
  return sprite.some((row) => row.some((cell) => cell !== ""));
}

describe("getCharacterSprites (05-06: real MetroCity pixel data)", () => {
  it("returns non-transparent pixel data for walk/typing/reading in all 4 directions", () => {
    const sprites = getCharacterSprites(0, 0);
    const directions = [Direction.DOWN, Direction.UP, Direction.RIGHT, Direction.LEFT];

    for (const dir of directions) {
      for (const frame of sprites.walk[dir]) {
        expect(hasNonEmptyCell(frame)).toBe(true);
      }
      for (const frame of sprites.typing[dir]) {
        expect(hasNonEmptyCell(frame)).toBe(true);
      }
      for (const frame of sprites.reading[dir]) {
        expect(hasNonEmptyCell(frame)).toBe(true);
      }
    }
  });

  it("returns frames matching the emptySprite dimensions it replaces (16 cols x 32 rows)", () => {
    const sprites = getCharacterSprites(0, 0);
    const frame = sprites.walk[Direction.DOWN][0];
    expect(frame.length).toBe(32);
    for (const row of frame) {
      expect(row.length).toBe(16);
    }
  });

  it("mirrors LEFT frames from RIGHT frames", () => {
    const sprites = getCharacterSprites(0, 0);
    const right = sprites.walk[Direction.RIGHT][0];
    const left = sprites.walk[Direction.LEFT][0];
    const expectedLeft = right.map((row) => [...row].reverse());
    expect(left).toEqual(expectedLeft);
  });

  it("keeps the exported signature unchanged: (paletteIndex, hueShift?) => CharacterSprites", () => {
    const sprites = getCharacterSprites(2);
    expect(sprites.walk[Direction.DOWN]).toHaveLength(4);
    expect(sprites.typing[Direction.DOWN]).toHaveLength(2);
    expect(sprites.reading[Direction.DOWN]).toHaveLength(2);
  });

  it("applies a hue shift without throwing when hueShift is non-zero", () => {
    const shifted = getCharacterSprites(0, 90);
    expect(hasNonEmptyCell(shifted.walk[Direction.DOWN][0])).toBe(true);
  });
});

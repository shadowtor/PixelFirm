import { describe, it, expect } from "vitest";
import { Direction } from "../types.js";
import { getCharacterSprites } from "./spriteData.js";

function hasNonEmptyCell(sprite: string[][]): boolean {
  return sprite.some((row) => row.some((cell) => cell !== ""));
}

describe("getCharacterSprites (05-06: real MetroCity pixel data)", () => {
  it("returns non-transparent pixel data for walk/typing/reading in all 4 directions", () => {
    const sprites = getCharacterSprites(0);
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
    const sprites = getCharacterSprites(0);
    const frame = sprites.walk[Direction.DOWN][0];
    expect(frame.length).toBe(32);
    for (const row of frame) {
      expect(row.length).toBe(16);
    }
  });

  it("mirrors LEFT frames from RIGHT frames", () => {
    const sprites = getCharacterSprites(0);
    const right = sprites.walk[Direction.RIGHT][0];
    const left = sprites.walk[Direction.LEFT][0];
    const expectedLeft = right.map((row) => [...row].reverse());
    expect(left).toEqual(expectedLeft);
  });

  it("exposes a single-argument signature: (hueShift) => CharacterSprites — the dead palette index is gone (WR-08)", () => {
    expect(getCharacterSprites.length).toBe(1);
    const sprites = getCharacterSprites(0);
    expect(sprites.walk[Direction.DOWN]).toHaveLength(4);
    expect(sprites.typing[Direction.DOWN]).toHaveLength(2);
    expect(sprites.reading[Direction.DOWN]).toHaveLength(2);
  });

  it("applies a hue shift without throwing when hueShift is non-zero", () => {
    const shifted = getCharacterSprites(90);
    expect(hasNonEmptyCell(shifted.walk[Direction.DOWN][0])).toBe(true);
  });

  it("genuinely reads its hue argument: two different hues differ in at least one cell (WR-08)", () => {
    const a = getCharacterSprites(0).walk[Direction.DOWN][0];
    const b = getCharacterSprites(120).walk[Direction.DOWN][0];
    expect(a).not.toEqual(b);
  });
});

describe("assertFrameCount (IN-04: fixed-index frame access is validated at load)", () => {
  it("throws an Error naming the direction and the expected frame count when handed too few frames", async () => {
    const { assertFrameCount } = await import("./spriteData.js");
    expect(() => assertFrameCount([[], [], []], "down")).toThrowError(/down/);
    expect(() => assertFrameCount([[], [], []], "down")).toThrowError(/7/);
    expect(() => assertFrameCount([[], [], []], "down")).toThrowError(/3/);
  });

  it("does not throw for a well-formed 7-frame array", async () => {
    const { assertFrameCount } = await import("./spriteData.js");
    expect(() => assertFrameCount(Array.from({ length: 7 }, () => []), "right")).not.toThrow();
  });
});

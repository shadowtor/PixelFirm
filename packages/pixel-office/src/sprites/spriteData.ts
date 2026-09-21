// Forked from https://github.com/pixel-agents-hq/pixel-agents
// commit 3537e140c2094761beae748592aeb92ece8edfdd (main, fetched 2026-09-21)
// Forked under MIT — see packages/pixel-office/LICENSE
//
// 05-06: getCharacterSprites() now builds real pixel data from
// character-metrocity.json (decoded from the fork's own bundled MetroCity
// char_0.png by scripts/decode-metrocity-sprites.mjs), instead of always
// returning emptySprite()'s transparent placeholder. Frame index -> pose
// mapping (walk=[0,1,2,1], typing=[3,4], reading=[5,6], LEFT flipped from
// RIGHT) matches the fork's own webview-ui/src/office/sprites/spriteData.ts
// getCharacterSprites() verbatim. Dropped from the fork's original
// spriteData.ts (per 05-01-PLAN.md Task 2): the PNG-loaded character
// template pipeline (setCharacterTemplates/getLoadedCharacterCount/
// loadedCharacters — this repo bakes the decoded data in at build time
// instead of loading it at runtime) and the bubble-overlay sprites
// (BUBBLE_PERMISSION_SPRITE/BUBBLE_WAITING_SPRITE/BUBBLE_HEART_SPRITE —
// those resolve from bundled JSON assets this plan doesn't fork).

import type { Direction, SpriteData } from "../types.js";
import { Direction as Dir } from "../types.js";
import { adjustSprite } from "../colorize.js";
import characterData from "./character-metrocity.json" with { type: "json" };

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>;
  typing: Record<Direction, [SpriteData, SpriteData]>;
  reading: Record<Direction, [SpriteData, SpriteData]>;
}

const spriteCache = new Map<string, CharacterSprites>();

/** Flip a SpriteData horizontally (for generating LEFT sprites from RIGHT). */
function flipHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

/** Frames each direction array must carry — spriteData indexes 0..6 below. */
const FRAMES_PER_DIRECTION = 7;

/**
 * IN-04: the frame indices below are fixed and unchecked, so a regenerated or
 * truncated character-metrocity.json used to crash inside the per-frame draw
 * path — a blank office plus a console stack trace. Fail here instead, naming
 * what is actually wrong. Exported so tests can exercise it without
 * corrupting the checked-in asset.
 */
export function assertFrameCount(frames: unknown[], directionName: string): void {
  if (frames.length !== FRAMES_PER_DIRECTION) {
    throw new Error(
      `character sprite data for direction "${directionName}" has ${frames.length} frames, expected ${FRAMES_PER_DIRECTION}`,
    );
  }
}

/**
 * WR-08: takes the hue shift and nothing else. The former first parameter
 * (a palette index) was accepted, folded into the cache key, and never read —
 * so every agent rendered byte-identical pixels. There is exactly one
 * character template in this repo, so that parameter had nothing to select;
 * it was deleted rather than given an invented meaning.
 */
export function getCharacterSprites(hueShift: number): CharacterSprites {
  const cacheKey = `${hueShift}`;
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;

  const d = characterData.down;
  const u = characterData.up;
  const rt = characterData.right;

  assertFrameCount(d, "down");
  assertFrameCount(u, "up");
  assertFrameCount(rt, "right");

  const colorAdjust = hueShift !== 0 ? (s: SpriteData) => adjustSprite(s, { h: hueShift, s: 0, b: 0, c: 0 }) : (s: SpriteData) => s;

  const sprites: CharacterSprites = {
    walk: {
      [Dir.DOWN]: [d[0], d[1], d[2], d[1]],
      [Dir.UP]: [u[0], u[1], u[2], u[1]],
      [Dir.RIGHT]: [rt[0], rt[1], rt[2], rt[1]],
      [Dir.LEFT]: [flipHorizontal(rt[0]), flipHorizontal(rt[1]), flipHorizontal(rt[2]), flipHorizontal(rt[1])],
    } as Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>,
    typing: {
      [Dir.DOWN]: [d[3], d[4]],
      [Dir.UP]: [u[3], u[4]],
      [Dir.RIGHT]: [rt[3], rt[4]],
      [Dir.LEFT]: [flipHorizontal(rt[3]), flipHorizontal(rt[4])],
    } as Record<Direction, [SpriteData, SpriteData]>,
    reading: {
      [Dir.DOWN]: [d[5], d[6]],
      [Dir.UP]: [u[5], u[6]],
      [Dir.RIGHT]: [rt[5], rt[6]],
      [Dir.LEFT]: [flipHorizontal(rt[5]), flipHorizontal(rt[6])],
    } as Record<Direction, [SpriteData, SpriteData]>,
  };

  if (hueShift !== 0) {
    for (const dir of [Dir.DOWN, Dir.UP, Dir.RIGHT, Dir.LEFT] as Direction[]) {
      sprites.walk[dir] = sprites.walk[dir].map(colorAdjust) as [SpriteData, SpriteData, SpriteData, SpriteData];
      sprites.typing[dir] = sprites.typing[dir].map(colorAdjust) as [SpriteData, SpriteData];
      sprites.reading[dir] = sprites.reading[dir].map(colorAdjust) as [SpriteData, SpriteData];
    }
  }

  spriteCache.set(cacheKey, sprites);
  return sprites;
}

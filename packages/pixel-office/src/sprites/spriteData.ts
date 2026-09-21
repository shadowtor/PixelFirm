// Forked from https://github.com/pixel-agents-hq/pixel-agents
// commit 3537e140c2094761beae748592aeb92ece8edfdd (main, fetched 2026-09-21)
// Forked under MIT — see packages/pixel-office/LICENSE
//
// Trimmed to the IDLE pose's sprite frames only this plan (per 05-01-PLAN.md
// Task 2's own instruction). Dropped from the fork's original spriteData.ts:
// the PNG-loaded character template pipeline (setCharacterTemplates /
// getLoadedCharacterCount / loadedCharacters — no asset-loading pipeline
// exists in this repo yet) and the bubble-overlay sprites (BUBBLE_PERMISSION_
// SPRITE / BUBBLE_WAITING_SPRITE / BUBBLE_HEART_SPRITE — those resolve from
// bundled JSON assets this plan doesn't fork; D-02's real pixel-art sourcing
// triage and D-03's icon overlays are 05-02+ scope). What remains always
// returns fully-transparent placeholder frames — this plan proves the real
// event → Character.state → canvas pipeline end-to-end; it does not yet draw
// real pixels.

import type { Direction, SpriteData } from "../types.js";
import { Direction as Dir } from "../types.js";

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>;
  typing: Record<Direction, [SpriteData, SpriteData]>;
  reading: Record<Direction, [SpriteData, SpriteData]>;
}

const spriteCache = new Map<string, CharacterSprites>();

/** Create a transparent placeholder sprite of given dimensions */
function emptySprite(w: number, h: number): SpriteData {
  const rows: string[][] = [];
  for (let y = 0; y < h; y++) {
    rows.push(new Array(w).fill(""));
  }
  return rows;
}

export function getCharacterSprites(paletteIndex: number, hueShift = 0): CharacterSprites {
  const cacheKey = `${paletteIndex}:${hueShift}`;
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;

  const e = emptySprite(16, 32);
  const walkSet: [SpriteData, SpriteData, SpriteData, SpriteData] = [e, e, e, e];
  const pairSet: [SpriteData, SpriteData] = [e, e];
  const sprites: CharacterSprites = {
    walk: {
      [Dir.DOWN]: walkSet,
      [Dir.UP]: walkSet,
      [Dir.RIGHT]: walkSet,
      [Dir.LEFT]: walkSet,
    } as Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>,
    typing: {
      [Dir.DOWN]: pairSet,
      [Dir.UP]: pairSet,
      [Dir.RIGHT]: pairSet,
      [Dir.LEFT]: pairSet,
    } as Record<Direction, [SpriteData, SpriteData]>,
    reading: {
      [Dir.DOWN]: pairSet,
      [Dir.UP]: pairSet,
      [Dir.RIGHT]: pairSet,
      [Dir.LEFT]: pairSet,
    } as Record<Direction, [SpriteData, SpriteData]>,
  };

  spriteCache.set(cacheKey, sprites);
  return sprites;
}

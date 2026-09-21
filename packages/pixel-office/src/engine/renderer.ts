// Forked from https://github.com/pixel-agents-hq/pixel-agents
// commit 3537e140c2094761beae748592aeb92ece8edfdd (main, fetched 2026-09-21)
// Forked under MIT — see packages/pixel-office/LICENSE
//
// Trimmed to the tile-grid + character draw calls 05-01 actually needs.
// Dropped from the fork's original ~1050-line renderer.ts: furniture/wall/
// carpet/area/pet layers, the floor-sprite-PNG pipeline (getColorizedFloor
// Sprite/hasFloorSprites — no asset-loading pipeline exists in this repo),
// the matrix spawn/despawn effect, speech-bubble rendering (no bubble sprite
// data forked yet — 05-02 scope), every VS-Code-editor-only overlay (ghost
// preview, selection highlight, delete/rotate buttons, grid overlay, area
// labels), and the offscreen sprite-cache module (spriteCache.ts — with a
// single idle character and no PNG assets yet, drawing each SpriteData pixel
// directly via fillRect is simpler and correct at this scale). Re-add the
// relevant layer here (not a fresh guess) once a later plan actually needs
// furniture/carpets/areas/pets/bubbles.

import {
  BUBBLE_ICON_GAP_PX,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  FALLBACK_FLOOR_COLOR,
  TILE_SIZE,
  WALL_COLOR,
} from "../constants.js";
import { resolveBubbleSprite } from "../sprites/bubbleSprites.js";
import { getCharacterSprites } from "../sprites/spriteData.js";
import type { Character, SpriteData, TileType as TileTypeVal } from "../types.js";
import { CharacterState, TileType } from "../types.js";
import { getCharacterSprite } from "./characters.js";

/** Draw a SpriteData pixel array directly — one fillRect per non-transparent cell. */
function drawSpriteData(ctx: CanvasRenderingContext2D, sprite: SpriteData, x: number, y: number, zoom: number): void {
  for (let row = 0; row < sprite.length; row++) {
    const cols = sprite[row];
    for (let col = 0; col < cols.length; col++) {
      const pixel = cols[col];
      if (!pixel) continue;
      ctx.fillStyle = pixel;
      ctx.fillRect(x + col * zoom, y + row * zoom, zoom, zoom);
    }
  }
}

/** @internal */
export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const s = TILE_SIZE * zoom;
  for (let r = 0; r < tileMap.length; r++) {
    for (let c = 0; c < tileMap[r].length; c++) {
      const tile = tileMap[r][c];
      if (tile === TileType.VOID) continue;
      ctx.fillStyle = tile === TileType.WALL ? WALL_COLOR : FALLBACK_FLOOR_COLOR;
      ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s);
    }
  }
}

interface ZDrawable {
  zY: number;
  draw: () => void;
}

/**
 * Vertical placement for a character's state-glyph overlay — bound to its
 * OWNER, never to the canvas (05-10, closes CR-02).
 *
 * Preferred position is directly above the owner's own sprite top edge. When
 * that would be negative there is no headroom, and the glyph is attached to
 * the owner's own sprite box instead (floored at 0 so it stays paintable).
 *
 * What this replaced, and why: 05-08 floored the glyph against the canvas
 * (`Math.max(0, drawY - height - gap)`) independently of `drawY`. That does
 * not move the glyph to a safe place — it moves it to whatever canvas row
 * happens to be at y=0, which belongs to a DIFFERENT character. A row-2
 * agent's `blocked` glyph therefore painted entirely inside the row-1
 * agent's sprite, making a true claim about the wrong agent. An overlay
 * bound to an owner is never relocated onto a neighbour: being partially
 * clipped by the canvas edge is strictly better than being attributed to the
 * wrong agent.
 */
export function resolveBubbleY(drawY: number, bubbleHeight: number, zoom: number): number {
  const preferred = Math.round(drawY - bubbleHeight * zoom - BUBBLE_ICON_GAP_PX * zoom);
  if (preferred >= 0) return preferred;
  return Math.max(0, drawY);
}

/** @internal */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const drawables: ZDrawable[] = characters.map((ch) => {
    const sprites = getCharacterSprites(ch.palette, ch.hueShift);
    const spriteData = getCharacterSprite(ch, sprites);
    const spriteHeight = spriteData.length;
    const spriteWidth = spriteData[0]?.length ?? 0;

    // Sitting offset: shift character down when seated so they visually sit in the chair
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    // Anchor at bottom-center of character
    const drawX = Math.round(offsetX + ch.x * zoom - (spriteWidth * zoom) / 2);
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - spriteHeight * zoom);

    const zY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;

    return {
      zY,
      draw: () => {
        drawSpriteData(ctx, spriteData, drawX, drawY, zoom);
        // D-03 icon overlay (05-07): drawn inside the SAME z-sorted drawable as
        // its own character, immediately after the base sprite — so it can never
        // z-sort behind a character that should be in front of it.
        if (!ch.bubbleType) return;
        const bubbleSprite = resolveBubbleSprite(ch.bubbleType);
        const bubbleWidth = bubbleSprite[0]?.length ?? 0;
        const bubbleHeight = bubbleSprite.length;
        // Centred on the owner. No horizontal clamp, deliberately: the glyph
        // is 11 wide, the character sprite 16, so a centred glyph's extent is
        // always a strict subset of its owner's — and the owner is always on
        // the map. A clamp would be unreachable code. renderer.test.ts's
        // horizontal-containment case is the guard, and goes red the moment a
        // glyph wider than a character is introduced.
        const bubbleX = Math.round(drawX + (spriteWidth * zoom - bubbleWidth * zoom) / 2);
        const bubbleY = resolveBubbleY(drawY, bubbleHeight, zoom);
        drawSpriteData(ctx, bubbleSprite, bubbleX, bubbleY, zoom);
      },
    };
  });

  // Sort ascending by zY and draw in order: a LOWER zY is drawn FIRST and
  // therefore sits BEHIND anything drawn after it. (IN-06: the previous
  // comment claimed the opposite, which is exactly the ordering a future
  // reader reasons about when chasing an overlay-placement bug.)
  drawables.sort((a, b) => a.zY - b.zY);
  for (const d of drawables) d.draw();
}

/** @internal */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  characters: Character[],
  zoom = 1,
): { offsetX: number; offsetY: number } {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const rows = tileMap.length;
  const cols = rows > 0 ? tileMap[0].length : 0;

  // Center the map in the canvas — no camera pan/zoom this plan (deferred
  // until a later plan actually needs it).
  const offsetX = Math.round((canvasWidth - cols * TILE_SIZE * zoom) / 2);
  const offsetY = Math.round((canvasHeight - rows * TILE_SIZE * zoom) / 2);

  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom);
  renderScene(ctx, characters, offsetX, offsetY, zoom);

  return { offsetX, offsetY };
}

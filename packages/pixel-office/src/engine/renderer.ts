// Forked from https://github.com/pixel-agents-hq/pixel-agents
// commit 3537e140c2094761beae748592aeb92ece8edfdd (main, fetched 2026-09-21)
// Forked under MIT — see packages/pixel-office/LICENSE
//
// Trimmed to the tile-grid + character draw calls this package needs.
// Dropped from the fork's original ~1050-line renderer.ts: the fork's
// furniture/wall/carpet/area/pet layers, the floor-sprite-PNG pipeline (getColorizedFloor
// Sprite/hasFloorSprites — no asset-loading pipeline exists in this repo),
// the matrix spawn/despawn effect, the fork's own speech-bubble renderer
// (replaced by this repo's state-glyph and handoff-dialogue passes below),
// every VS-Code-editor-only overlay (ghost preview, selection highlight,
// delete/rotate buttons, grid overlay, area labels), and the offscreen
// sprite-cache module (spriteCache.ts — drawing each SpriteData pixel
// directly via fillRect is simpler and correct at this scale). Re-add the
// relevant layer here (not a fresh guess) once a later plan actually needs
// carpets/areas/pets.
//
// 05-24 (G-05-1e) re-added the tile-sprite and furniture layer, drawn from
// the MetroCity Interior pack (05-22, layout/officeLayout.ts) — not the
// fork's furniture/floor/wall packs, which stay deferred (D-05).
//
// renderScene draws three ordered passes: (1) base sprites and furniture in
// one z-sorted list, (2) handoff dialogue boxes, (3) state glyphs.

import {
  BUBBLE_ICON_GAP_PX,
  CHARACTER_SITTING_OFFSET_PX,
  BUBBLE_ICON_HEIGHT_PX,
  CHARACTER_Z_SORT_OFFSET,
  DEFAULT_COLS,
  DIALOGUE_BOX_COLOR,
  DIALOGUE_BOX_HEIGHT_PX,
  DIALOGUE_BOX_PAD_X_PX,
  DIALOGUE_FONT_PX,
  DIALOGUE_TEXT_COLOR,
  TILE_SIZE,
  WALL_COLOR,
} from "../constants.js";
import { type PlacedFurniture, tileSpriteAt } from "../layout/officeLayout.js";
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
      const sprite = tileSpriteAt(c, r);
      if (sprite) {
        drawSpriteData(ctx, sprite, offsetX + c * s, offsetY + r * s, zoom);
        continue;
      }
      ctx.fillStyle = WALL_COLOR;
      ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s);
    }
  }
}

/** Per-character layout, computed once per frame and shared by every pass. */
interface CharacterLayout {
  ch: Character;
  spriteData: SpriteData;
  spriteWidth: number;
  drawX: number;
  drawY: number;
  zY: number;
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

/**
 * Placement for a character's handoff dialogue box — owner-bound, like the
 * glyph (05-13, closes VERIFICATION gap 1). @internal
 *
 * Centred on and stacked above its owner: the box sits directly above the
 * owner's glyph SLOT (reserved whether or not a glyph is showing), clamped at
 * y = 0, and is shifted horizontally only as far as needed to stay on the
 * canvas — so its extent always contains the owner's centre x. A box wider
 * than the canvas is clipped, never relocated.
 *
 * Geometry at zoom 1 on the 320x176 office: desk rows 3/6/9 leave no position
 * for an 11px line that overlaps nothing. A row-3 owner's box lands at y 0..12
 * on the top wall strip (over the top 4 rows of its own glyph slot); a row-6
 * owner's at y 42..54, over the lower half of the desk row in front. It never
 * overlaps its OWN sprite. Because it can overlap glyph rows, renderScene
 * draws state glyphs after dialogue.
 */
export function resolveDialogueBox(
  ownerCenterX: number,
  drawY: number,
  textWidth: number,
  zoom: number,
  canvasWidth: number,
): { x: number; y: number; w: number; h: number } {
  const h = DIALOGUE_BOX_HEIGHT_PX * zoom;
  const w = Math.ceil(textWidth) + 2 * DIALOGUE_BOX_PAD_X_PX * zoom;
  const glyphSlotY = resolveBubbleY(drawY, BUBBLE_ICON_HEIGHT_PX, zoom);
  const y = Math.max(0, glyphSlotY - BUBBLE_ICON_GAP_PX * zoom - h);
  const x = Math.min(Math.max(0, Math.round(ownerCenterX - w / 2)), Math.max(0, canvasWidth - w));
  return { x, y, w, h };
}

function drawGlyph(ctx: CanvasRenderingContext2D, l: CharacterLayout, zoom: number): void {
  if (!l.ch.bubbleType) return;
  const bubbleSprite = resolveBubbleSprite(l.ch.bubbleType);
  const bubbleWidth = bubbleSprite[0]?.length ?? 0;
  const bubbleHeight = bubbleSprite.length;
  // Centred on the owner. No horizontal clamp, deliberately: the glyph
  // is 11 wide, the character sprite 16, so a centred glyph's extent is
  // always a strict subset of its owner's — and the owner is always on
  // the map. A clamp would be unreachable code. renderer.test.ts's
  // horizontal-containment case is the guard, and goes red the moment a
  // glyph wider than a character is introduced.
  const bubbleX = Math.round(l.drawX + (l.spriteWidth * zoom - bubbleWidth * zoom) / 2);
  const bubbleY = resolveBubbleY(l.drawY, bubbleHeight, zoom);
  drawSpriteData(ctx, bubbleSprite, bubbleX, bubbleY, zoom);
}

function drawDialogue(
  ctx: CanvasRenderingContext2D,
  l: CharacterLayout,
  offsetX: number,
  zoom: number,
  canvasWidth: number,
): void {
  const text = l.ch.bubbleText;
  if (!text) return;
  ctx.font = `${DIALOGUE_FONT_PX * zoom}px monospace`;
  ctx.textBaseline = "top";
  const box = resolveDialogueBox(offsetX + l.ch.x * zoom, l.drawY, ctx.measureText(text).width, zoom, canvasWidth);
  ctx.fillStyle = DIALOGUE_BOX_COLOR;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = DIALOGUE_TEXT_COLOR;
  ctx.fillText(text, box.x + DIALOGUE_BOX_PAD_X_PX * zoom, box.y + zoom);
}

/** @internal */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  canvasWidth = DEFAULT_COLS * TILE_SIZE * zoom,
  furniture: readonly PlacedFurniture[] = [],
): void {
  const layouts: CharacterLayout[] = characters.map((ch) => {
    const sprites = getCharacterSprites(ch.hueShift);
    const spriteData = getCharacterSprite(ch, sprites);
    const spriteHeight = spriteData.length;
    const spriteWidth = spriteData[0]?.length ?? 0;

    // Sitting offset: shift character down when seated so they visually sit in the chair
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    // Anchor at bottom-center of character
    const drawX = Math.round(offsetX + ch.x * zoom - (spriteWidth * zoom) / 2);
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - spriteHeight * zoom);

    const zY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;
    return { ch, spriteData, spriteWidth, drawX, drawY, zY };
  });

  // Sort ascending by zY and draw in order: a LOWER zY is drawn FIRST and
  // therefore sits BEHIND anything drawn after it. (IN-06: the previous
  // comment claimed the opposite, which is exactly the ordering a future
  // reader reasons about when chasing an overlay-placement bug.)
  layouts.sort((a, b) => a.zY - b.zY);
  // Pass 1: base sprites and furniture, one z-sorted list (05-24): a desk
  // hides the lower body of the agent seated behind it, an agent in the lane
  // in front of a desk is drawn over it, wall decor is behind everyone.
  const pass1: Array<{ zY: number; sprite: SpriteData; x: number; y: number }> = [
    ...layouts.map((l) => ({ zY: l.zY, sprite: l.spriteData, x: l.drawX, y: l.drawY })),
    ...furniture.map((f) => ({ zY: f.zY, sprite: f.sprite, x: offsetX + f.x * zoom, y: offsetY + f.y * zoom })),
  ];
  pass1.sort((a, b) => a.zY - b.zY);
  for (const d of pass1) drawSpriteData(ctx, d.sprite, d.x, d.y, zoom);
  // Pass 2: handoff dialogue (05-13).
  for (const l of layouts) drawDialogue(ctx, l, offsetX, zoom, canvasWidth);
  // Pass 3: state glyphs (OFFICE-03, D-03) are the TOP layer, drawn after
  // every sprite and every dialogue box, so a transient handoff line can never
  // hide a blocked/waiting/failed signal. A glyph now sorts behind nothing at
  // all — which keeps 05-07's guarantee (never behind a character in front of
  // it) and strengthens it.
  for (const l of layouts) drawGlyph(ctx, l, zoom);
}

/** @internal */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  characters: Character[],
  zoom = 1,
  furniture: readonly PlacedFurniture[] = [],
): { offsetX: number; offsetY: number } {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const rows = tileMap.length;
  const cols = rows > 0 ? tileMap[0].length : 0;

  // Center the map in the canvas — no camera pan/zoom this plan (deferred
  // until a later plan actually needs it).
  const offsetX = Math.round((canvasWidth - cols * TILE_SIZE * zoom) / 2);
  const offsetY = Math.round((canvasHeight - rows * TILE_SIZE * zoom) / 2);

  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom);
  renderScene(ctx, characters, offsetX, offsetY, zoom, canvasWidth, furniture);

  return { offsetX, offsetY };
}

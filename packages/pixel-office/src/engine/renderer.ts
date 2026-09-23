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
// delete/rotate buttons, grid overlay, area labels), and the fork's
// spriteCache.ts module. 05-24 re-adds a small per-(sprite, zoom)
// OffscreenCanvas cache below: the furnished floor makes per-pixel fillRect
// every frame too expensive. Re-add the
// relevant layer here (not a fresh guess) once a later plan actually needs
// carpets/areas/pets.
//
// 05-24 (G-05-1e) re-added the tile-sprite and furniture layer, drawn from
// the MetroCity Interior pack (05-22, layout/officeLayout.ts) — not the
// fork's furniture/floor/wall packs, which stay deferred (D-05).
//
// renderScene draws three ordered passes: (1) base sprites and furniture in
// one z-sorted list, (2) handoff speech bubbles, (3) state glyphs.

import {
  BUBBLE_ICON_GAP_PX,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DIALOGUE_BOX_COLOR,
  DIALOGUE_BOX_HEIGHT_PX,
  DIALOGUE_BOX_PAD_X_PX,
  DIALOGUE_FONT_PX,
  DIALOGUE_TAIL_PX,
  DIALOGUE_TEXT_COLOR,
  TILE_SIZE,
  WALL_COLOR,
} from "../constants.js";
import { DESK_SPRITE, isOwnSeat, type PlacedFurniture, tileSpriteAt } from "../layout/officeLayout.js";
import { BUBBLE_SPRITES, resolveBubbleSprite } from "../sprites/bubbleSprites.js";
import { getCharacterSprites } from "../sprites/spriteData.js";
import type { Character, SpriteData, TileType as TileTypeVal } from "../types.js";
import { CharacterState, TileType } from "../types.js";
import { getCharacterSprite } from "./characters.js";

type Paintable = Pick<CanvasRenderingContext2D, "fillStyle" | "fillRect">;

/** One fillRect per non-transparent cell. */
function paintSpriteData(ctx: Paintable, sprite: SpriteData, x: number, y: number, zoom: number): void {
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

// ponytail: bounded by the module-level SpriteData objects (character frames
// per identity hue, 12 glyphs, office sprites) per zoom; a window resize adds
// one zoom's worth. Never evicted — add an LRU if zooms ever become unbounded.
const spriteCanvases = new WeakMap<SpriteData, Map<number, OffscreenCanvas>>();

/** The sprite rasterised once at this zoom, or null where OffscreenCanvas
 *  does not exist (vitest's node environment). */
function spriteCanvas(sprite: SpriteData, zoom: number): OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== "function") return null;
  let byZoom = spriteCanvases.get(sprite);
  if (!byZoom) spriteCanvases.set(sprite, (byZoom = new Map()));
  let canvas = byZoom.get(zoom);
  if (!canvas) {
    canvas = new OffscreenCanvas(Math.max(1, (sprite[0]?.length ?? 0) * zoom), Math.max(1, sprite.length * zoom));
    const octx = canvas.getContext("2d");
    if (octx) paintSpriteData(octx, sprite, 0, 0, zoom);
    byZoom.set(zoom, canvas);
  }
  return canvas;
}

/** Draw a sprite: the cached canvas via drawImage in the browser, else fillRect per cell. */
function drawSpriteData(ctx: CanvasRenderingContext2D, sprite: SpriteData, x: number, y: number, zoom: number): void {
  const canvas = spriteCanvas(sprite, zoom);
  if (canvas) ctx.drawImage(canvas, x, y);
  else paintSpriteData(ctx, sprite, x, y, zoom);
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

// Opaque row bounds per sprite, memoised: SpriteData objects are stable
// module-level values (see the sprite cache note above).
const firstRows = new WeakMap<SpriteData, number>();
const lastRows = new WeakMap<SpriteData, number>();

/** First row with an opaque cell (0 for an all-transparent sprite). */
function firstOpaqueRow(sprite: SpriteData): number {
  let r = firstRows.get(sprite);
  if (r === undefined) {
    r = sprite.findIndex((row) => row.some(Boolean));
    if (r < 0) r = 0;
    firstRows.set(sprite, r);
  }
  return r;
}

/** Last row with an opaque cell (the last index for an all-transparent sprite). */
function lastOpaqueRow(sprite: SpriteData): number {
  let r = lastRows.get(sprite);
  if (r === undefined) {
    r = sprite.length - 1;
    while (r > 0 && !sprite[r].some(Boolean)) r--;
    lastRows.set(sprite, r);
  }
  return r;
}

/**
 * Vertical placement for a character's state-glyph overlay — bound to its
 * OWNER, never to the canvas (05-10, closes CR-02).
 *
 * Preferred position puts the glyph's lowest ink row (glyphInkBottomRow)
 * BUBBLE_ICON_GAP_PX above the owner's visible head (headTopRow, the frame's
 * first opaque row) — anchored per frame on pixels, not the 16x32 frame box
 * (05-30, G-05-1c: the frame-top anchor left 5-6 px of air and the glyphs
 * read as a detached legend). When that would be negative there is no
 * headroom, and the glyph is attached to the owner's own sprite box instead
 * (floored at 0 so it stays paintable).
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
export function resolveBubbleY(drawY: number, headTopRow: number, glyphInkBottomRow: number, zoom: number): number {
  const preferred = Math.round(
    drawY + headTopRow * zoom - BUBBLE_ICON_GAP_PX * zoom - (glyphInkBottomRow + 1) * zoom,
  );
  if (preferred >= 0) return preferred;
  return Math.max(0, drawY);
}

/** A rect in canvas px. @internal */
export interface DialogueRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the speaker is, in canvas px. `headTop` is its first opaque row. @internal */
export interface DialogueSpeaker {
  centerX: number;
  footY: number;
  headTop: number;
  left: number;
  right: number;
}

/** The floor interior a bubble must stay inside, in canvas px. @internal */
export interface DialogueFloor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What a bubble is scored against, in canvas px (05-33, G-05-P1).
 *
 * `glyphs` is a HARD constraint (with the floor bounds); the rest are soft and
 * ranked desks -> furniture -> characters. `furniture` holds every piece,
 * desks included, so a desk's area is counted under both keys — deliberate:
 * it means no furniture tie-break can ever reverse the desk decision. @internal
 */
export interface DialogueObstacles {
  glyphs: readonly DialogueRect[];
  desks: readonly DialogueRect[];
  furniture: readonly DialogueRect[];
  characters: readonly DialogueRect[];
}

/** @internal */
export type DialogueCandidateKind = "below" | "above" | "right" | "left";

/** @internal */
export interface DialogueCandidate extends DialogueRect {
  kind: DialogueCandidateKind;
  tail: DialogueRect;
  valid: boolean;
  deskArea: number;
  furnitureArea: number;
  characterArea: number;
}

/** @internal */
export interface DialoguePlacement extends DialogueRect {
  kind: DialogueCandidateKind;
  tail: DialogueRect;
  candidates: DialogueCandidate[];
}

/** Rows in the tallest state glyph, derived from the assets rather than
 *  restated: the "above" candidate keeps clearing the glyph band even if one
 *  is ever redrawn taller. */
const GLYPH_ROWS = Math.max(...Object.values(BUBBLE_SPRITES).map((s) => s.length));

const intersectArea = (a: DialogueRect, b: DialogueRect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const coveredArea = (box: DialogueRect, rects: readonly DialogueRect[]): number =>
  rects.reduce((sum, r) => sum + intersectArea(box, r), 0);

/**
 * Placement for a handoff speech bubble: four ordered candidates scored
 * against the frame's real obstacles (05-33, closes G-05-P1). @internal
 *
 * Candidates, in order: below the speaker's feet, above its glyph band, right
 * of its sprite, left of its sprite. The first two are centred on the midpoint
 * of the speaker and its partner (the speaker alone when there is none) and
 * clamped into the floor interior, so the line is attributed to the two agents
 * it connects; the side pair hangs off the sprite edge at head height.
 *
 * A candidate is VALID when the box lies wholly inside the floor interior
 * (never across the canvas edge, never at x = 0) and covers no state glyph of
 * any character, its own participants' included. Among valid candidates the
 * winner has the least desk overlap, then the least furniture overlap (all
 * office furniture, desks included), then the least character overlap, then the
 * earlier index. So a desk-covering box is never chosen while a valid
 * desk-free one exists — the UAT's own ranking for G-05-P1. Validity is just
 * the first key of that same ranking, so when NOTHING is valid the least-bad
 * candidate still wins, and the returned box is clamped into the floor
 * interior either way (review WR-01).
 *
 * The tail always binds the box to its speaker: a `zoom`-wide ink rect from
 * the box to the foot line (below) or head top (above), or a `zoom`-tall one
 * across the gap to the sprite side (right/left).
 *
 * This SUPERSEDES 05-28's single under-the-feet band, which existed because
 * 05-13 stacked the box above the glyph slot unconditionally. The band landed
 * on the desk and monitors of every seat-row receiver, since it never read
 * what was actually under it. Desks are ranked ahead of characters on the
 * user's instruction: a bubble is transient and sits under the glyph pass, so
 * crossing a seated agent's shoulders hides no stuck-state signal.
 */
export function resolveDialogueBox(
  speaker: DialogueSpeaker,
  partnerCenterX: number | null,
  textWidth: number,
  zoom: number,
  floor: DialogueFloor,
  obstacles: DialogueObstacles,
): DialoguePlacement {
  const w = Math.ceil(textWidth) + 2 * (DIALOGUE_BOX_PAD_X_PX + 1) * zoom;
  const h = DIALOGUE_BOX_HEIGHT_PX * zoom;
  const gap = DIALOGUE_TAIL_PX * zoom;
  const mid = partnerCenterX === null ? speaker.centerX : (speaker.centerX + partnerCenterX) / 2;
  const pairX = Math.max(floor.left, Math.min(Math.round(mid - w / 2), floor.right - w));
  const tailX = Math.round(speaker.centerX - zoom / 2);
  // Box bottom high enough to clear a glyph anchored at this head, whichever
  // glyph it is; pass 3 then draws the speaker's own glyph over the tail.
  const aboveY = speaker.headTop - (GLYPH_ROWS + BUBBLE_ICON_GAP_PX) * zoom - gap - h;
  const sideY = speaker.headTop + Math.floor(DIALOGUE_BOX_HEIGHT_PX / 2) * zoom;
  const leftX = speaker.left - gap - w;
  /** The tail's x for a below/above box, clamped into that box's own span.
   *  `pairX` is clamped into the floor interior while the tail is anchored on
   *  the speaker, with nothing connecting the two: widen the pair (interaction
   *  colOffsets, or any sender further from its receiver) and the tail detaches
   *  — a 1-px ink stub in open floor pointing at nothing while the bubble sits
   *  elsewhere (review WR-05). Clamped, the tail stays part of its bubble and
   *  leans as far toward the speaker as the box allows. */
  const tailXIn = (boxX: number): number => Math.min(Math.max(tailX, boxX), boxX + w - zoom);
  /** The ink stub binding a box AT (x, y) to its speaker. One function and one
   *  call per box, so a candidate's tail and the returned winner's tail can
   *  never disagree about where the box ended up (review WR-01: the winner is
   *  clamped, and the tail has to follow it). */
  const tailFor = (kind: DialogueCandidateKind, x: number, y: number): DialogueRect => {
    switch (kind) {
      case "below":
        return { x: tailXIn(x), y: speaker.footY, w: zoom, h: Math.max(0, y - speaker.footY) };
      case "above":
        return { x: tailXIn(x), y: y + h, w: zoom, h: Math.max(0, speaker.headTop - (y + h)) };
      case "right":
        return { x: speaker.right, y: sideY, w: Math.max(0, x - speaker.right), h: zoom };
      case "left":
        return { x: x + w, y: sideY, w: Math.max(0, speaker.left - (x + w)), h: zoom };
    }
  };
  const boxes: Array<Pick<DialogueCandidate, "kind" | "x" | "y">> = [
    { kind: "below", x: pairX, y: speaker.footY + gap },
    { kind: "above", x: pairX, y: aboveY },
    { kind: "right", x: speaker.right + gap, y: speaker.headTop },
    { kind: "left", x: leftX, y: speaker.headTop },
  ];
  const candidates: DialogueCandidate[] = boxes.map(({ kind, x, y }) => {
    const box = { x, y, w, h };
    return {
      kind,
      ...box,
      tail: tailFor(kind, x, y),
      valid:
        x >= floor.left &&
        x + w <= floor.right &&
        y >= floor.top &&
        y + h <= floor.bottom &&
        !obstacles.glyphs.some((g) => intersectArea(box, g) > 0),
      deskArea: coveredArea(box, obstacles.desks),
      furnitureArea: coveredArea(box, obstacles.furniture),
      characterArea: coveredArea(box, obstacles.characters),
    };
  });
  // Valid first, then the soft keys, then the earlier index. Invalid candidates
  // are ranked against each other too (review WR-01): when nothing is valid the
  // fallback is the LEAST BAD box, not whichever happens to be first — "below"
  // collides with every row-8 glyph for an aisle speaker, so index order is the
  // worst possible tie-break there.
  const beats = (a: DialogueCandidate, b: DialogueCandidate): boolean =>
    a.valid !== b.valid
      ? a.valid
      : a.deskArea !== b.deskArea
        ? a.deskArea < b.deskArea
        : a.furnitureArea !== b.furnitureArea
          ? a.furnitureArea < b.furnitureArea
          : a.characterArea < b.characterArea;
  let best = candidates[0];
  for (const c of candidates) if (beats(c, best)) best = c;
  // ponytail: the no-valid-candidate fallback is unreachable on the shipped
  // layout — renderer.test.ts's "every home, full office" sweep asserts the
  // chosen candidate is valid in all 40 scenes, at the widest line the caps
  // allow. Upgrade path: more candidates. It is still clamped into the floor
  // unconditionally (a no-op whenever best.valid), so an unreachable branch
  // going live is at worst a mis-ranked box, never one across the canvas edge.
  const x = Math.max(floor.left, Math.min(best.x, floor.right - w));
  const y = Math.max(floor.top, Math.min(best.y, floor.bottom - h));
  return { kind: best.kind, x, y, w, h, tail: tailFor(best.kind, x, y), candidates };
}

/** Where pass 3 paints this character's state glyph, or null when it has none.
 *  The single source for the drawn rect and for the scored obstacle, so the
 *  bubble is never ranked against a glyph position the renderer does not use. */
function glyphPlacement(l: CharacterLayout, zoom: number): (DialogueRect & { sprite: SpriteData }) | null {
  if (!l.ch.bubbleType) return null;
  const sprite = resolveBubbleSprite(l.ch.bubbleType);
  const w = (sprite[0]?.length ?? 0) * zoom;
  // Centred on the owner. No horizontal clamp, deliberately: the glyph
  // is 11 wide, the character sprite 16, so a centred glyph's extent is
  // always a strict subset of its owner's — and the owner is always on
  // the map. A clamp would be unreachable code. renderer.test.ts's
  // horizontal-containment case is the guard, and goes red the moment a
  // glyph wider than a character is introduced.
  const x = Math.round(l.drawX + (l.spriteWidth * zoom - w) / 2);
  const y = resolveBubbleY(l.drawY, firstOpaqueRow(l.spriteData), lastOpaqueRow(sprite), zoom);
  return { sprite, x, y, w, h: sprite.length * zoom };
}

function drawGlyph(ctx: CanvasRenderingContext2D, l: CharacterLayout, zoom: number): void {
  const g = glyphPlacement(l, zoom);
  if (g) drawSpriteData(ctx, g.sprite, g.x, g.y, zoom);
}

function drawDialogue(
  ctx: CanvasRenderingContext2D,
  l: CharacterLayout,
  partner: CharacterLayout | undefined,
  offsetX: number,
  offsetY: number,
  zoom: number,
  obstacles: DialogueObstacles,
): DialoguePlacement | null {
  const text = l.ch.bubbleText;
  if (!text) return null;
  ctx.font = `${DIALOGUE_FONT_PX * zoom}px monospace`;
  ctx.textBaseline = "top";
  const footY = offsetY + l.ch.y * zoom;
  const box = resolveDialogueBox(
    {
      centerX: offsetX + l.ch.x * zoom,
      footY,
      headTop: l.drawY + firstOpaqueRow(l.spriteData) * zoom,
      left: l.drawX,
      right: l.drawX + l.spriteWidth * zoom,
    },
    partner ? offsetX + partner.ch.x * zoom : null,
    ctx.measureText(text).width,
    zoom,
    {
      left: offsetX + TILE_SIZE * zoom,
      top: offsetY + TILE_SIZE * zoom,
      right: offsetX + (DEFAULT_COLS - 1) * TILE_SIZE * zoom,
      bottom: offsetY + (DEFAULT_ROWS - 1) * TILE_SIZE * zoom,
    },
    obstacles,
  );
  // fillRect/fillText only: fill, then a 1px ink border, then the tail.
  ctx.fillStyle = DIALOGUE_BOX_COLOR;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = DIALOGUE_TEXT_COLOR;
  ctx.fillRect(box.x, box.y, box.w, zoom);
  ctx.fillRect(box.x, box.y + box.h - zoom, box.w, zoom);
  ctx.fillRect(box.x, box.y, zoom, box.h);
  ctx.fillRect(box.x + box.w - zoom, box.y, zoom, box.h);
  ctx.fillRect(box.tail.x, box.tail.y, box.tail.w, box.tail.h);
  ctx.fillText(text, box.x + (DIALOGUE_BOX_PAD_X_PX + 1) * zoom, box.y + 2 * zoom);
  return box;
}

/** The LAST frame's placements, each stamped with the speaker and the exact
 *  text that frame painted — the text is what makes a stale rect detectable
 *  (review CR-01); see getDialogueBox. */
let framePlacements: Array<DialoguePlacement & { speakerId: string; text: string }> = [];

/** Test-only reset — the per-frame record is module state like any other, so
 *  index.ts's _resetForTests clears it too (review CR-01: without this, a
 *  previous test's rect answers getDialogueBox for a reused agent id). */
export function _resetFrameForTests(): void {
  framePlacements = [];
}

/** Every dialogue placement from the LAST renderScene call, with the scored
 *  candidate set behind each choice. Replaced per frame; read-only.
 *  Test instrumentation for the G-05-P1 ranking (05-33). @internal */
export function lastDialoguePlacements(): ReadonlyArray<DialoguePlacement & { speakerId: string; text: string }> {
  return framePlacements;
}

/**
 * The box of the bubble the LAST rendered frame drew for `agentId` showing
 * exactly `text` — its fill rect, in canvas backing-store px — or undefined.
 * The CSS box equals the backing store (05-21), so a host can hit-test pointer
 * offsets against this directly (05-35, G-05-P4).
 *
 * `text` is not a convenience filter, it is the freshness check (review CR-01).
 * A paused canvas still SHOWS its last frame, so a rect from that frame is
 * truthful for as long as the line it was drawn for is still the line being
 * claimed. What is not truthful is a rect drawn for some OTHER line: state
 * advances out of band (handleHandoffEvent runs off the host's WS handler, not
 * off the loop), so a caller can hold a record whose text the last painted
 * frame never drew. Matching on the drawn text makes that case undefined
 * instead of an arbitrarily old rect the caller cannot distinguish.
 *
 * A fresh copy off the same per-frame record `lastDialoguePlacements` exposes,
 * never a second source: a rect a scorer did not actually draw is exactly the
 * class of bug 05-33's single-source rule exists to make unrepresentable.
 */
export function getDialogueBox(agentId: string, text: string): DialogueRect | undefined {
  const p = framePlacements.find((f) => f.speakerId === agentId && f.text === text);
  return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : undefined;
}

/** @internal */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  furniture: readonly PlacedFurniture[] = [],
): void {
  const layouts: CharacterLayout[] = characters.map((ch) => {
    const sprites = getCharacterSprites(ch.hueShift);
    const spriteData = getCharacterSprite(ch, sprites);
    const spriteHeight = spriteData.length;
    const spriteWidth = spriteData[0]?.length ?? 0;

    // Sitting offset: a character RESTING (anything but walking) on its own
    // layout seat is drawn seated, whatever its status — the desk then hides
    // its lower body, so "at the desk" and "standing nearby" read differently
    // at native scale (05-32 / G-05-P3, superseding 05-25's TYPE-only rule).
    // Only the offset depends on the seat: the drawn frame still comes from
    // the pose (D-01) and STATUS_MAP and the FSM are untouched, so a frozen
    // stuck agent stays frozen while seated (D-03).
    const sittingOffset = ch.state !== CharacterState.WALK && isOwnSeat(ch) ? CHARACTER_SITTING_OFFSET_PX : 0;
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
  // Pass 2: handoff speech bubbles (05-13, 05-28): each spans its speaker and
  // the partner named by bubbleTextPartnerId (the speaker alone if absent), at
  // whichever of four candidate positions is safest this frame (05-33,
  // G-05-P1). The obstacle rects are built once and shared by every bubble.
  const glyphRects = layouts.map((l) => glyphPlacement(l, zoom)).filter((g): g is NonNullable<typeof g> => g !== null);
  const furnitureRects = furniture.map((f) => ({
    x: offsetX + f.x * zoom,
    y: offsetY + f.y * zoom,
    w: (f.sprite[0]?.length ?? 0) * zoom,
    h: f.sprite.length * zoom,
    desk: f.sprite === DESK_SPRITE,
  }));
  const deskRects = furnitureRects.filter((r) => r.desk);
  // Clipped at the foot line: a seated character's lower body is behind its desk.
  const characterRects = layouts.map((l) => ({
    x: l.drawX,
    y: l.drawY,
    w: l.spriteWidth * zoom,
    h: offsetY + l.ch.y * zoom - l.drawY,
  }));
  const placed: DialogueRect[] = [];
  framePlacements = [];
  layouts.forEach((l, i) => {
    const partnerId = l.ch.bubbleTextPartnerId;
    const partner = partnerId ? layouts.find((p) => p.ch.id === partnerId) : undefined;
    const placement = drawDialogue(ctx, l, partner, offsetX, offsetY, zoom, {
      glyphs: glyphRects,
      desks: deskRects,
      furniture: furnitureRects,
      // Bubbles already placed this frame join the character class, so two
      // concurrent lines avoid each other.
      characters: [...characterRects.filter((_, j) => j !== i), ...placed],
    });
    if (!placement) return;
    placed.push(placement);
    framePlacements.push({ speakerId: l.ch.id, text: l.ch.bubbleText ?? "", ...placement });
  });
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
  renderScene(ctx, characters, offsetX, offsetY, zoom, furniture);

  return { offsetX, offsetY };
}

import { describe, it, expect } from "vitest";
import { renderScene } from "./renderer.js";
import { createCharacter, getCharacterSprite } from "./characters.js";
import { getCharacterSprites } from "../sprites/spriteData.js";
import { BUBBLE_SPRITES } from "../sprites/bubbleSprites.js";
import type { Character } from "../types.js";

interface RecordedRect {
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Minimal CanvasRenderingContext2D stand-in recording every painted cell. */
function mockCtx(): { ctx: CanvasRenderingContext2D; rects: RecordedRect[] } {
  const rects: RecordedRect[] = [];
  const ctx = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ color: String(this.fillStyle), x, y, w, h });
    },
    clearRect() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

/** Colours used by a bubble/badge glyph and by NO character base sprite pixel. */
function bubbleOnlyColors(ch: Character): Set<string> {
  const baseColors = new Set<string>();
  const baseSprite = getCharacterSprite(ch, getCharacterSprites(ch.palette, ch.hueShift));
  for (const row of baseSprite) for (const cell of row) if (cell) baseColors.add(cell);

  const bubbleColors = new Set<string>();
  for (const sprite of Object.values(BUBBLE_SPRITES)) {
    for (const row of sprite) for (const cell of row) if (cell && !baseColors.has(cell)) bubbleColors.add(cell);
  }
  return bubbleColors;
}

describe("renderScene bubble/badge overlay draw pass", () => {
  it("paints a blocked character's bubble glyph with bubble-blocked's own palette colour", () => {
    const ch = createCharacter("agent-1", 3, 3);
    ch.bubbleType = "blocked";

    const { ctx, rects } = mockCtx();
    renderScene(ctx, [ch], 0, 0, 1);

    // #d62828 is bubble-blocked.json's octagon fill and appears nowhere in the
    // character sprite — proof the bubble was genuinely drawn, not just computed.
    const painted = rects.filter((r) => r.color.toLowerCase() === "#d62828");
    expect(painted.length).toBeGreaterThan(0);
  });

  it("paints nothing from any bubble palette when bubbleType is null", () => {
    const ch = createCharacter("agent-1", 3, 3);
    expect(ch.bubbleType).toBeNull();

    const { ctx, rects } = mockCtx();
    renderScene(ctx, [ch], 0, 0, 1);

    const bubbleColors = bubbleOnlyColors(ch);
    const leaked = rects.filter((r) => bubbleColors.has(r.color.toLowerCase()));
    expect(leaked, `unexpected bubble pixels: ${JSON.stringify(leaked.slice(0, 3))}`).toEqual([]);
    // The base sprite itself must still be drawn.
    expect(rects.length).toBeGreaterThan(0);
  });

  it("draws the bubble strictly above the character's own base sprite", () => {
    // Control render (no bubble) isolates the base sprite's true extent — a
    // colour partition can't, since bubble-blocked shares #000000/#ffffff
    // with the character sprite.
    const control = createCharacter("agent-1", 3, 3);
    const { ctx: controlCtx, rects: baseRects } = mockCtx();
    renderScene(controlCtx, [control], 0, 0, 1);
    expect(baseRects.length).toBeGreaterThan(0);
    const highestBaseY = Math.min(...baseRects.map((r) => r.y));

    const ch = createCharacter("agent-1", 3, 3);
    ch.bubbleType = "blocked";
    const { ctx, rects } = mockCtx();
    renderScene(ctx, [ch], 0, 0, 1);

    const bubbleRects = rects.filter((r) => !baseRects.some((b) => b.x === r.x && b.y === r.y));
    expect(bubbleRects.length).toBeGreaterThan(0);

    const lowestBubbleY = Math.max(...bubbleRects.map((r) => r.y + r.h));
    expect(lowestBubbleY).toBeLessThanOrEqual(highestBaseY);
  });

  it("centers the bubble horizontally over the character", () => {
    const ch = createCharacter("agent-1", 3, 3);
    ch.bubbleType = "handoff-task";

    const { ctx, rects } = mockCtx();
    renderScene(ctx, [ch], 0, 0, 1);

    const bubbleColors = bubbleOnlyColors(ch);
    const bubbleRects = rects.filter((r) => bubbleColors.has(r.color.toLowerCase()));
    expect(bubbleRects.length).toBeGreaterThan(0);

    const midX = (Math.min(...bubbleRects.map((r) => r.x)) + Math.max(...bubbleRects.map((r) => r.x + r.w))) / 2;
    // Character is anchored at ch.x (bottom-center); tolerate sub-glyph asymmetry.
    expect(Math.abs(midX - ch.x)).toBeLessThanOrEqual(3);
  });
});

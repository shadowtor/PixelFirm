import { describe, it, expect, beforeEach } from "vitest";
import { AgentStatus } from "event-schema";
import { renderScene } from "./renderer.js";
import { createCharacter, getCharacterSprite } from "./characters.js";
import { getCharacterSprites } from "../sprites/spriteData.js";
import { BUBBLE_SPRITES } from "../sprites/bubbleSprites.js";
import { upsertCharacterFromAgent, getCharacter, _resetForTests } from "../index.js";
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

  it("attaches a headroom-less character's bubble to its OWN sprite box, on-canvas, rather than a canvas row a neighbour owns", () => {
    // Interior row 1 is no longer used by the default seating layout (05-10
    // moved desks to rows 3/6/9) but is still a valid manual placement: a
    // 32px sprite anchored at y=24 starts at drawY = -8, so there is no room
    // above. The glyph is then attached to the owner's own sprite box —
    // never relocated onto whoever occupies y=0 (CR-02).
    const ch = createCharacter("agent-1", 1, 1);
    ch.bubbleType = "blocked";

    const { ctx, rects } = mockCtx();
    renderScene(ctx, [ch], 0, 0, 1);

    const bubbleColors = bubbleOnlyColors(ch);
    const bubbleRects = rects.filter((r) => bubbleColors.has(r.color.toLowerCase()));
    expect(bubbleRects.length).toBeGreaterThan(0);
    expect(Math.min(...bubbleRects.map((r) => r.y))).toBeGreaterThanOrEqual(0);
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

// Sprite frame dimensions, pinned by sprites/spriteData.test.ts.
const SPRITE_W = 16;
const SPRITE_H = 32;

/** The canvas box renderScene paints a character's base sprite into, at
 *  offset 0,0 / zoom 1 — bottom-center anchored, exactly as renderScene
 *  itself computes drawX/drawY. */
function spriteBox(ch: Character): { left: number; right: number; top: number; bottom: number } {
  const left = Math.round(ch.x - SPRITE_W / 2);
  const top = Math.round(ch.y - SPRITE_H);
  return { left, right: left + SPRITE_W, top, bottom: top + SPRITE_H };
}

describe("resolveBubbleY — owner-bound glyph placement (CR-02)", () => {
  it("places the glyph above the owner's own head when the owner has headroom", async () => {
    const { resolveBubbleY } = await import("./renderer.js");
    // First desk row (interior row 3): drawY 24, 13px glyph + 2px gap.
    expect(resolveBubbleY(24, 13, 1)).toBe(9);
    // Second desk row (interior row 6): drawY 72.
    expect(resolveBubbleY(72, 13, 1)).toBe(57);
  });

  it("attaches the glyph to the owner's own sprite top — never a canvas row a neighbour owns — when there is no headroom", async () => {
    const { resolveBubbleY } = await import("./renderer.js");
    // drawY -8 is interior row 1: no room above, so the glyph lands inside
    // its OWNER's box rather than being relocated onto whoever is at y=0.
    expect(resolveBubbleY(-8, 13, 1)).toBe(0);
  });
});

describe("renderScene over the real desk layout — CR-02 two-character composite", () => {
  beforeEach(() => {
    _resetForTests();
  });

  /** Seats n agents through the REAL seating layout (not hand-placed tiles). */
  function seatAgents(n: number): Character[] {
    const out: Character[] = [];
    for (let i = 1; i <= n; i++) {
      upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
      out.push(getCharacter(`agent-${i}`)!);
    }
    return out;
  }

  /**
   * Seats 19 agents so agent-1 and agent-19 land in the same interior column
   * on two consecutive desk rows, blocks ONLY the later-row agent, and
   * isolates that agent's glyph rects via a control render (a colour
   * partition cannot: bubble-blocked shares #000000/#ffffff with the
   * character sprite).
   */
  function renderBlockedNineteen(): { first: Character; later: Character; glyphRects: RecordedRect[] } {
    const control = seatAgents(19);
    const { ctx: controlCtx, rects: controlRects } = mockCtx();
    renderScene(controlCtx, control, 0, 0, 1);

    _resetForTests();
    const chars = seatAgents(19);
    const first = chars[0];
    const later = chars[18];
    upsertCharacterFromAgent("agent-19", AgentStatus.BLOCKED);

    const { ctx, rects } = mockCtx();
    renderScene(ctx, chars, 0, 0, 1);

    const painted = new Set(controlRects.map((r) => `${r.x},${r.y}`));
    const glyphRects = rects.filter((r) => !painted.has(`${r.x},${r.y}`));
    return { first, later, glyphRects };
  }

  it("never paints a later-row agent's blocked glyph inside the sprite box of the agent seated in front of it", () => {
    const { first, later, glyphRects } = renderBlockedNineteen();

    // The exact pairing 05-08 broke: same column, one desk row apart.
    expect(later.seatCol).toBe(first.seatCol);
    expect(later.seatRow).toBeGreaterThan(first.seatRow);
    expect(later.bubbleType).toBe("blocked");
    expect(glyphRects.length).toBeGreaterThan(0);

    const firstBox = spriteBox(first);
    const laterBox = spriteBox(later);

    for (const g of glyphRects) {
      const disjoint =
        g.y + g.h <= firstBox.top ||
        g.y >= firstBox.bottom ||
        g.x + g.w <= firstBox.left ||
        g.x >= firstBox.right;
      expect(disjoint, `glyph rect ${JSON.stringify(g)} lands inside agent-1's sprite box ${JSON.stringify(firstBox)}`).toBe(true);
    }

    // ...and it genuinely sits above its OWN head, not merely somewhere else.
    expect(glyphRects.some((g) => g.y < laterBox.top)).toBe(true);

    // Concrete expected geometry, so a silent layout drift is caught too:
    // desk rows 3 and 6 => sprite boxes y 24..56 and y 72..104, glyph 57..70.
    expect(firstBox.top).toBe(24);
    expect(laterBox.top).toBe(72);
    expect(Math.min(...glyphRects.map((r) => r.y))).toBeGreaterThanOrEqual(57);
    expect(Math.max(...glyphRects.map((r) => r.y + r.h))).toBeLessThanOrEqual(70);
  });

  it("keeps the glyph's horizontal extent inside its own character's sprite extent — the property that makes a horizontal clamp unnecessary", () => {
    const { later, glyphRects } = renderBlockedNineteen();
    const laterBox = spriteBox(later);

    expect(glyphRects.length).toBeGreaterThan(0);
    expect(Math.min(...glyphRects.map((r) => r.x))).toBeGreaterThanOrEqual(laterBox.left);
    expect(Math.max(...glyphRects.map((r) => r.x + r.w))).toBeLessThanOrEqual(laterBox.right);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { AgentStatus } from "event-schema";
import type { CompanyEvent } from "event-schema";
import { renderScene, resolveBubbleY } from "./renderer.js";
import { createCharacter, getCharacterSprite, updateCharacter } from "./characters.js";
import { getCharacterSprites } from "../sprites/spriteData.js";
import { BUBBLE_SPRITES } from "../sprites/bubbleSprites.js";
import {
  upsertCharacterFromAgent,
  getCharacter,
  registerTaskTitle,
  handleHandoffEvent,
  checkHandoffArrivals,
  _resetForTests,
} from "../index.js";
import type { Character } from "../types.js";
import { CharacterState } from "../types.js";

interface RecordedRect {
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RecordedText {
  text: string;
  x: number;
  y: number;
  color: string;
  font: string;
}

type RecordedOp = ({ kind: "rect" } & RecordedRect) | ({ kind: "text" } & RecordedText);

/** Minimal CanvasRenderingContext2D stand-in recording every painted cell,
 *  every text draw, and one ordered log of both (layering tests need order). */
function mockCtx(): { ctx: CanvasRenderingContext2D; rects: RecordedRect[]; texts: RecordedText[]; ops: RecordedOp[] } {
  const rects: RecordedRect[] = [];
  const texts: RecordedText[] = [];
  const ops: RecordedOp[] = [];
  const ctx = {
    fillStyle: "",
    font: "",
    textBaseline: "alphabetic",
    fillRect(x: number, y: number, w: number, h: number) {
      const r = { color: String(this.fillStyle), x, y, w, h };
      rects.push(r);
      ops.push({ kind: "rect", ...r });
    },
    fillText(text: string, x: number, y: number) {
      const t = { text, x, y, color: String(this.fillStyle), font: this.font };
      texts.push(t);
      ops.push({ kind: "text", ...t });
    },
    measureText(text: string) {
      return { width: Array.from(text).length * 7 };
    },
    clearRect() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, texts, ops };
}

/** Colours used by a bubble/badge glyph and by NO character base sprite pixel. */
function bubbleOnlyColors(ch: Character): Set<string> {
  const baseColors = new Set<string>();
  const baseSprite = getCharacterSprite(ch, getCharacterSprites(ch.hueShift));
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

// ── 05-13: handoff dialogue draw pass (closes VERIFICATION gap 1) ─────────
// Every symbol that does not exist before 05-13 (new constants,
// resolveDialogueBox, the MAX caps) is imported with await import(...) inside
// the test body — a static named import of a missing export is an ESM link
// failure, which would turn RED into a load crash (05-10 precedent).

function handoffRequested(id: string, taskId: string, fromAgentId: string, toAgentId: string): CompanyEvent {
  return {
    id,
    version: 1,
    occurredAt: "2026-09-21T00:00:00.000Z",
    companyId: "company-1",
    taskId,
    visibility: "INTERNAL",
    type: "agent.handoff_requested",
    payload: { taskId, fromAgentId, toAgentId },
  } as CompanyEvent;
}

/** Seats n agents through the REAL layout; positions/hues are read back from
 *  the returned Characters, never hardcoded (05-13 coupling_note with 05-14). */
function seatReal(n: number): Character[] {
  const out: Character[] = [];
  for (let i = 1; i <= n; i++) {
    upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
    out.push(getCharacter(`agent-${i}`)!);
  }
  return out;
}

/** drawY renderScene uses for a character at offset 0 / zoom 1. */
function ownerDrawY(ch: Character): number {
  const sprite = getCharacterSprite(ch, getCharacterSprites(ch.hueShift));
  const sitting = ch.state === CharacterState.TYPE ? 6 : 0;
  return Math.round(ch.y + sitting - sprite.length);
}

describe("renderScene dialogue pass — handoff text reaches the canvas, owner-bound (05-13)", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("tracer: a real handoff's capped 'requested' line is drawn once, in a box containing the sender's centre x and entirely above its sprite", async () => {
    const { DIALOGUE_BOX_COLOR } = await import("../constants.js");
    upsertCharacterFromAgent("sender", AgentStatus.IDLE);
    upsertCharacterFromAgent("receiver", AgentStatus.IDLE);
    const sender = getCharacter("sender")!;
    const receiver = getCharacter("receiver")!;
    const title = "Refactor the entire authentication subsystem for tenancy now"; // 60 chars
    expect(Array.from(title).length).toBe(60);
    registerTaskTitle("task-1", title);

    handleHandoffEvent(handoffRequested("5fa85f64-5717-4562-b3fc-2c963f66afa6", "task-1", "sender", "receiver"));
    for (let i = 0; i < 200 && !(sender.path.length === 0 && sender.state === CharacterState.IDLE); i++) {
      updateCharacter(sender, 0.05);
    }
    expect(sender.state).toBe(CharacterState.IDLE);
    checkHandoffArrivals();

    const { ctx, rects, texts } = mockCtx();
    renderScene(ctx, [sender, receiver], 0, 0, 1);

    expect(texts.length).toBe(1);
    const t = texts[0];
    expect(t.text).toBe(sender.bubbleText);
    const titleSegment = t.text.split('"')[1];
    expect(titleSegment.endsWith("\u2026")).toBe(true);
    expect(Array.from(t.text).length).toBeLessThanOrEqual(46);

    const boxes = rects.filter((r) => r.color.toLowerCase() === DIALOGUE_BOX_COLOR.toLowerCase());
    expect(boxes.length).toBe(1);
    const box = boxes[0];
    expect(box.x).toBeLessThanOrEqual(sender.x);
    expect(box.x + box.w).toBeGreaterThanOrEqual(sender.x);
    expect(box.y + box.h).toBeLessThanOrEqual(sender.y - 32);
    expect(t.x).toBeGreaterThanOrEqual(box.x);
    expect(t.x).toBeLessThan(box.x + box.w);
    expect(t.y).toBeGreaterThanOrEqual(box.y);
    expect(t.y).toBeLessThan(box.y + box.h);
  });

  it("draws no text and no dialogue box when bubbleText is null, undefined or empty", async () => {
    const { DIALOGUE_BOX_COLOR } = await import("../constants.js");
    for (const value of [null, undefined, ""]) {
      _resetForTests();
      const [ch] = seatReal(1);
      ch.bubbleText = value;
      const { ctx, rects, texts } = mockCtx();
      renderScene(ctx, [ch], 0, 0, 1);
      expect(texts.length).toBe(0);
      expect(rects.filter((r) => r.color.toLowerCase() === DIALOGUE_BOX_COLOR.toLowerCase()).length).toBe(0);
    }
  });

  it("stacks a row-6 owner's box directly above its own glyph slot", async () => {
    const { DIALOGUE_BOX_COLOR } = await import("../constants.js");
    const chars = seatReal(19);
    const owner = chars[18];
    expect(owner.seatRow).toBe(6);
    owner.bubbleText = "Handing off \"Fix login bug\" to agent-2";

    const { ctx, rects } = mockCtx();
    renderScene(ctx, chars, 0, 0, 1);

    const drawY = ownerDrawY(owner);
    expect(drawY).toBe(72);
    const glyphSlotTop = resolveBubbleY(drawY, 13, 1);
    const box = rects.find((r) => r.color.toLowerCase() === DIALOGUE_BOX_COLOR.toLowerCase())!;
    expect(box).toBeDefined();
    expect(box.y).toBe(glyphSlotTop - 2 - 13);
    expect(box.y).toBe(42);
    expect(box.y + box.h).toBeLessThanOrEqual(glyphSlotTop);
  });

  it("clamps a wide box into the canvas horizontally while still containing its owner's centre x", async () => {
    const { DIALOGUE_BOX_COLOR } = await import("../constants.js");
    const chars = seatReal(18);
    const left = chars.reduce((a, b) => (b.seatCol < a.seatCol ? b : a));
    const right = chars.reduce((a, b) => (b.seatCol > a.seatCol ? b : a));
    expect(left.seatCol).toBe(1);
    expect(right.seatCol).toBe(18);
    const wide = "x".repeat(30); // 210px at the mock's 7px/char — wider than half of 320

    for (const [owner, edge] of [
      [left, "left"],
      [right, "right"],
    ] as const) {
      for (const c of chars) c.bubbleText = null;
      owner.bubbleText = wide;
      const { ctx, rects } = mockCtx();
      renderScene(ctx, chars, 0, 0, 1);
      const box = rects.find((r) => r.color.toLowerCase() === DIALOGUE_BOX_COLOR.toLowerCase())!;
      expect(box).toBeDefined();
      expect(box.w).toBeGreaterThan(160);
      if (edge === "left") expect(box.x).toBe(0);
      else expect(box.x + box.w).toBe(320);
      expect(box.x).toBeLessThanOrEqual(owner.x);
      expect(box.x + box.w).toBeGreaterThanOrEqual(owner.x);
    }
  });

  it("resolveDialogueBox: centred, stacked above the glyph slot, clamped at y = 0", async () => {
    const { resolveDialogueBox } = await import("./renderer.js");
    // Row-3 owner: glyph slot at 9, box would be at -6 -> clamped to 0.
    expect(resolveDialogueBox(100, 24, 50, 1, 320)).toEqual({ x: 73, y: 0, w: 54, h: 13 });
    // Row-6 owner: glyph slot at 57, box at 42.
    expect(resolveDialogueBox(100, 72, 50, 1, 320).y).toBe(42);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { AgentStatus } from "event-schema";
import type { CompanyEvent } from "event-schema";
import { renderFrame, renderScene, resolveBubbleY } from "./renderer.js";
import { FURNITURE, FURNITURE_BLOCKED_TILES, OFFICE_TILE_MAP, SEATS, STANDING_SPOTS, isOwnSeat } from "../layout/officeLayout.js";
import officeSprites from "../sprites/office-metrocity.json" with { type: "json" };
import { CHARACTER_SITTING_OFFSET_PX, WALL_COLOR } from "../constants.js";
import { createCharacter, getCharacterSprite, updateCharacter, walkCharacterTo } from "./characters.js";
import { getCharacterSprites } from "../sprites/spriteData.js";
import { BUBBLE_SPRITES } from "../sprites/bubbleSprites.js";
import { STATUS_MAP } from "../status/status-mapping.js";
import {
  upsertCharacterFromAgent,
  getCharacter,
  registerTaskTitle,
  handleHandoffEvent,
  checkHandoffArrivals,
  stepOffice,
  _resetForTests,
} from "../index.js";
import type { Character, SpriteData } from "../types.js";
import { CharacterState, Direction, TileType } from "../types.js";

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

type RecordedOp =
  | ({ kind: "rect" } & RecordedRect)
  | ({ kind: "text" } & RecordedText)
  | { kind: "image"; image: unknown; x: number; y: number };

/** Minimal CanvasRenderingContext2D stand-in recording every painted cell,
 *  every text draw, and one ordered log of both (layering tests need order). */
function mockCtx(): {
  ctx: CanvasRenderingContext2D;
  rects: RecordedRect[];
  texts: RecordedText[];
  ops: RecordedOp[];
  images: Array<{ image: unknown; x: number; y: number }>;
} {
  const images: Array<{ image: unknown; x: number; y: number }> = [];
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
    // Monospace model tied to the font actually set (05-28): 0.6 em per code point.
    measureText(text: string) {
      return { width: Array.from(text).length * 0.6 * parseFloat(this.font) };
    },
    clearRect() {},
    drawImage(image: unknown, x: number, y: number) {
      images.push({ image, x, y });
      ops.push({ kind: "image", image, x, y });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, texts, ops, images };
}

/** Colours used by a bubble/badge glyph and by NO base sprite pixel of any
 *  given character (pass every character in the scene: neighbours with other
 *  identity hues paint colours the owner's own sprite does not). */
function bubbleOnlyColors(...chars: Character[]): Set<string> {
  const baseColors = new Set<string>();
  for (const ch of chars) {
    const baseSprite = getCharacterSprite(ch, getCharacterSprites(ch.hueShift));
    for (const row of baseSprite) for (const cell of row) if (cell) baseColors.add(cell.toLowerCase());
  }

  const bubbleColors = new Set<string>();
  for (const sprite of Object.values(BUBBLE_SPRITES)) {
    for (const row of sprite) for (const cell of row) if (cell && !baseColors.has(cell.toLowerCase())) bubbleColors.add(cell.toLowerCase());
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

/** The sitting offset renderScene applies: a character RESTING (not walking)
 *  on its own layout seat is sunk into its desk whatever its status
 *  (05-32 / G-05-P3, superseding 05-25's TYPE-only rule). */
const sittingOffsetOf = (ch: Character): number =>
  ch.state !== CharacterState.WALK && isOwnSeat(ch) ? CHARACTER_SITTING_OFFSET_PX : 0;

/** The canvas box renderScene paints a character's base sprite into, at
 *  offset 0,0 / zoom 1 — bottom-center anchored and sunk by the sitting
 *  offset, exactly as renderScene itself computes drawX/drawY. */
function spriteBox(ch: Character): { left: number; right: number; top: number; bottom: number } {
  const left = Math.round(ch.x - SPRITE_W / 2);
  const top = Math.round(ch.y + sittingOffsetOf(ch) - SPRITE_H);
  return { left, right: left + SPRITE_W, top, bottom: top + SPRITE_H };
}

describe("resolveBubbleY — owner-bound glyph placement (CR-02, head-anchored 05-30)", () => {
  it("puts the glyph's lowest ink row 1 px above the owner's first opaque row when there is headroom", () => {
    // Seat row 4 IDLE: drawY 40, head ink from frame row 3, blocked ink rows 0..11.
    // Head at y 43, glyph bottom edge at 42, glyph top at 42 - 12 = 30.
    expect(resolveBubbleY(40, 3, 11, 1)).toBe(30);
    // Same at zoom 3: every term scales.
    expect(resolveBubbleY(120, 3, 11, 3)).toBe(90);
  });

  it("attaches the glyph to the owner's own sprite top — never a canvas row a neighbour owns — when there is no headroom", () => {
    // drawY -8 (interior row 1): no room above, floored at 0 inside the owner's box.
    expect(resolveBubbleY(-8, 3, 11, 1)).toBe(0);
    // drawY 5: head at 8 cannot fit a 12-row glyph above it, so the glyph
    // starts at the owner's own sprite top (5), not at y 0.
    expect(resolveBubbleY(5, 3, 11, 1)).toBe(5);
  });
});

// ── 05-30 (G-05-1c): glyph anchored to the visible head, on the floor ─────

const ALL_GLYPHS = Object.keys(BUBBLE_SPRITES) as Array<keyof typeof BUBBLE_SPRITES>;

/** Renders ch alone with and without its glyph; returns the head's first
 *  opaque y and the glyph's ink rects (pass 3 follows the sprite cells). */
function headAndGlyph(ch: Character, glyph: keyof typeof BUBBLE_SPRITES, zoom: number) {
  ch.bubbleType = null;
  const control = mockCtx();
  renderScene(control.ctx, [ch], 0, 0, zoom);
  ch.bubbleType = glyph;
  const withGlyph = mockCtx();
  renderScene(withGlyph.ctx, [ch], 0, 0, zoom);
  const headTop = Math.min(...control.rects.map((r) => r.y));
  return { headTop, glyphRects: withGlyph.rects.slice(control.rects.length) };
}

describe("glyph sits on its owner's head (05-30, G-05-1c)", () => {
  const seat = SEATS[0];
  const poses: Array<[string, () => Character]> = [
    ["IDLE on a seat", () => createCharacter("a", seat.col, seat.row)],
    ["TYPE seated", () => Object.assign(createCharacter("a", seat.col, seat.row), { state: CharacterState.TYPE })],
    [
      "TYPE off-seat",
      () => Object.assign(createCharacter("a", seat.col, seat.row), { state: CharacterState.TYPE, seatCol: seat.col + 1 }),
    ],
    ...[Direction.DOWN, Direction.UP, Direction.RIGHT].flatMap((dir) =>
      [0, 1, 2, 3].map(
        (frame): [string, () => Character] => [
          `WALK dir ${dir} frame ${frame}`,
          () => Object.assign(createCharacter("a", seat.col, seat.row), { state: CharacterState.WALK, dir, frame }),
        ],
      ),
    ),
  ];

  it("leaves exactly BUBBLE_ICON_GAP_PX of air between every glyph's ink and the head, in every pose, at zoom 1 and 3", async () => {
    const { BUBBLE_ICON_GAP_PX } = await import("../constants.js");
    expect(BUBBLE_ICON_GAP_PX).toBe(1);
    for (const zoom of [1, 3]) {
      for (const [pose, make] of poses) {
        for (const glyph of ALL_GLYPHS) {
          const { headTop, glyphRects } = headAndGlyph(make(), glyph, zoom);
          expect(glyphRects.length).toBeGreaterThan(0);
          const inkBottom = Math.max(...glyphRects.map((r) => r.y + r.h));
          expect(inkBottom + BUBBLE_ICON_GAP_PX * zoom, `${glyph} / ${pose} / zoom ${zoom}`).toBe(headTop);
        }
      }
    }
  });

  it("keeps every glyph on the floor for every seat and standing spot, standing and seated", () => {
    for (const tile of [...SEATS, ...STANDING_SPOTS]) {
      for (const state of [CharacterState.IDLE, CharacterState.TYPE]) {
        for (const glyph of ALL_GLYPHS) {
          const ch = Object.assign(createCharacter("a", tile.col, tile.row), { state });
          const { glyphRects } = headAndGlyph(ch, glyph, 1);
          const where = `${glyph} at (${tile.col},${tile.row}) ${state}`;
          expect(Math.min(...glyphRects.map((r) => r.y)), where).toBeGreaterThanOrEqual(TILE_PX);
          expect(Math.min(...glyphRects.map((r) => r.x)), where).toBeGreaterThanOrEqual(TILE_PX);
          expect(Math.max(...glyphRects.map((r) => r.x + r.w)), where).toBeLessThanOrEqual(19 * TILE_PX);
        }
      }
    }
  });
});

const TILE_PX = 16;

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
   * Seats 9 agents so agent-1 (1,4) and agent-9 (1,8) land in the same column
   * on consecutive layout seat rows (05-25), blocks ONLY the later-row agent, and
   * isolates that agent's glyph rects via a control render (a colour
   * partition cannot: bubble-blocked shares #000000/#ffffff with the
   * character sprite).
   */
  function renderBlockedNine(): { first: Character; later: Character; glyphRects: RecordedRect[] } {
    const control = seatAgents(9);
    const { ctx: controlCtx, rects: controlRects } = mockCtx();
    renderScene(controlCtx, control, 0, 0, 1);

    _resetForTests();
    const chars = seatAgents(9);
    const first = chars[0];
    const later = chars[8];
    upsertCharacterFromAgent("agent-9", AgentStatus.BLOCKED);

    const { ctx, rects } = mockCtx();
    renderScene(ctx, chars, 0, 0, 1);

    const painted = new Set(controlRects.map((r) => `${r.x},${r.y}`));
    const glyphRects = rects.filter((r) => !painted.has(`${r.x},${r.y}`));
    return { first, later, glyphRects };
  }

  it("never paints a later-row agent's blocked glyph inside the sprite box of the agent seated in front of it", () => {
    const { first, later, glyphRects } = renderBlockedNine();

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

    // Concrete expected geometry, so a silent layout drift is caught too.
    // Both agents rest IDLE on their own seats, so both are sunk by
    // CHARACTER_SITTING_OFFSET_PX (6) — 05-32 / G-05-P3, where before this plan
    // only TYPE sank and these boxes were y 40..72 and y 104..136.
    // Seat rows 4 and 8 => foot y 72 and 136 => sprite boxes y 46..78 and
    // y 110..142. agent-9's IDLE head ink starts at frame row 3 (y 113); the
    // blocked glyph (ink rows 0..11, 12 rows) ends 1 px above it, y 100..112 —
    // strictly below agent-1's box (05-30).
    expect(firstBox).toMatchObject({ top: 46, bottom: 78 });
    expect(laterBox.top).toBe(110);
    expect(Math.min(...glyphRects.map((r) => r.y))).toBe(100);
    expect(Math.max(...glyphRects.map((r) => r.y + r.h))).toBe(112);
    expect(Math.min(...glyphRects.map((r) => r.y))).toBeGreaterThan(firstBox.bottom);
  });

  it("keeps the glyph's horizontal extent inside its own character's sprite extent — the property that makes a horizontal clamp unnecessary", () => {
    const { later, glyphRects } = renderBlockedNine();
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
  return Math.round(ch.y + sittingOffsetOf(ch) - sprite.length);
}

function handoffCompleted(id: string, taskId: string, toAgentId: string): CompanyEvent {
  return {
    id,
    version: 1,
    occurredAt: "2026-09-21T00:01:00.000Z",
    companyId: "company-1",
    taskId,
    visibility: "INTERNAL",
    type: "agent.handoff_completed",
    payload: { taskId, toAgentId },
  } as CompanyEvent;
}

describe("renderScene dialogue pass — nothing to say, nothing drawn (05-13)", () => {
  beforeEach(() => {
    _resetForTests();
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
});

// ── 05-28: partner-spanning speech bubble under the speaker's feet ────────
// New symbols (DIALOGUE_TAIL_PX, the new resolveDialogueBox signature) are
// imported with await import(...) so RED is a failing assertion, not a load crash.

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const spansX = (b: Box, x: number): boolean => b.x <= x && x <= b.x + b.w;
/** Sprite box renderScene paints a character into (offset 0, zoom 1). */
const spriteRect = (ch: Character): Box => ({ x: Math.round(ch.x - SPRITE_W / 2), y: ownerDrawY(ch), w: SPRITE_W, h: SPRITE_H });
const TILE = 16;
const FLOOR_LEFT = 16;
const FLOOR_RIGHT = 304;

/** Renders one frame and splits the op log: the bubble fill, its text, the ink
 *  rects, and pass 3 (every rect after the last text op is a state glyph). */
async function renderBubbleFrame(chars: Character[]) {
  const { DIALOGUE_BOX_COLOR, DIALOGUE_TEXT_COLOR } = await import("../constants.js");
  const { ctx, ops, texts } = mockCtx();
  renderScene(ctx, chars, 0, 0, 1, FURNITURE);
  const rectOps = (list: RecordedOp[]) => list.filter((op): op is { kind: "rect" } & RecordedRect => op.kind === "rect");
  const fills = rectOps(ops).filter((r) => r.color.toLowerCase() === DIALOGUE_BOX_COLOR.toLowerCase());
  const ink = rectOps(ops).filter((r) => r.color.toLowerCase() === DIALOGUE_TEXT_COLOR.toLowerCase());
  let lastText = -1;
  ops.forEach((op, i) => op.kind === "text" && (lastText = i));
  const glyphs = lastText < 0 ? [] : rectOps(ops.slice(lastText + 1));
  return { fills, ink, texts, glyphs };
}

/** Requests from -> to through the public API and steps the real loop until the sender waits. */
function requestAndWait(from: Character, to: Character): void {
  registerTaskTitle("task-1", "Fix login bug");
  handleHandoffEvent(handoffRequested("7fa85f64-5717-4562-b3fc-2c963f66afa6", "task-1", from.id, to.id));
  for (let i = 0; i < 3600 && !from.bubbleText; i++) stepOffice(1 / 60);
  expect(from.bubbleText, `${from.id} never started talking`).toBeTruthy();
}

describe("handoff speech bubble (05-28, G-05-4 / G-05-1b)", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("tracer: the requested line is a bubble under the sender's feet spanning sender and receiver, tail at the sender", async () => {
    const { DIALOGUE_TAIL_PX } = await import("../constants.js");
    const chars = seatReal(3);
    const [sender, , receiver] = chars;
    requestAndWait(sender, receiver);
    expect(sender.tileRow).toBe(receiver.tileRow);

    const { fills, ink, texts } = await renderBubbleFrame(chars);
    expect(fills).toHaveLength(1);
    const box = fills[0];
    expect(spansX(box, sender.x), `box ${JSON.stringify(box)} misses the sender (${sender.x})`).toBe(true);
    expect(spansX(box, receiver.x), `box ${JSON.stringify(box)} misses the receiver (${receiver.x})`).toBe(true);
    expect(box.y).toBeGreaterThanOrEqual(sender.y + DIALOGUE_TAIL_PX);
    const tail = ink.find((r) => r.y >= sender.y && r.y + r.h <= box.y && spansX(r, sender.x));
    expect(tail, `no ink tail at x ${sender.x} between y ${sender.y} and ${box.y}`).toBeDefined();
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe(sender.bubbleText);
    expect(texts[0].font).toBe("5px monospace");
    expect(box.h).toBe(9);
    expect(overlaps({ x: texts[0].x, y: texts[0].y, w: 1, h: 1 }, box)).toBe(true);
  });

  it("layout guard: every speaker row's bubble band is clear", async () => {
    const { resolveDialogueBox } = await import("./renderer.js");
    const { DIALOGUE_BOX_PAD_X_PX: DIALOGUE_PAD } = await import("../constants.js");
    const positions = [...SEATS, ...STANDING_SPOTS];
    const speakerRows = [...new Set(positions.map((p) => p.row))];
    const fullWidthText = FLOOR_RIGHT - FLOOR_LEFT - 2 * (DIALOGUE_PAD + 1);
    for (const r of speakerRows) {
      const footY = r * TILE + TILE / 2;
      const band = resolveDialogueBox(FLOOR_LEFT + TILE / 2, null, footY, fullWidthText, 1, FLOOR_LEFT, FLOOR_RIGHT);
      expect(band.x).toBe(FLOOR_LEFT);
      expect(band.x + band.w).toBe(FLOOR_RIGHT);
      // The first all-wall row below the speaker row ends the floor.
      const wallRow = OFFICE_TILE_MAP.findIndex((line, i) => i > r && line.every((t) => t === TileType.WALL));
      expect(band.y + band.h, `row ${r} band runs into the bottom wall`).toBeLessThanOrEqual(wallRow * TILE);
      for (const p of positions.filter((q) => q.row !== r)) {
        const poses: Character[] = [];
        const standing = createCharacter("guard", p.col, p.row);
        standing.state = CharacterState.IDLE;
        standing.bubbleType = "blocked";
        poses.push(standing);
        if (SEATS.some((s) => s.col === p.col && s.row === p.row)) {
          const seated = createCharacter("guard", p.col, p.row);
          seated.state = CharacterState.TYPE;
          seated.bubbleType = "blocked";
          expect(isOwnSeat(seated)).toBe(true);
          poses.push(seated);
        }
        for (const ch of poses) {
          const { ctx, rects } = mockCtx();
          renderScene(ctx, [ch], 0, 0, 1);
          for (const rect of rects) {
            expect(
              overlaps(rect, band),
              `row ${r} speaker band ${JSON.stringify(band)} is hit by the ${ch.state} agent at (${p.col},${p.row}): ${JSON.stringify(rect)}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("attributed at every position: all 16 seats and 4 standing spots as receiver", async () => {
    const positions = [...SEATS, ...STANDING_SPOTS];
    expect(positions).toHaveLength(20);
    for (const p of positions) {
      _resetForTests();
      const chars = seatReal(20);
      const receiver = chars.find((c) => c.seatCol === p.col && c.seatRow === p.row)!;
      const sender = chars.find((c) => c.seatRow !== p.row)!;
      for (const c of chars) if (c !== sender && c !== receiver) upsertCharacterFromAgent(c.id, AgentStatus.BLOCKED);
      requestAndWait(sender, receiver);

      const where = `receiver (${p.col},${p.row}), sender at (${sender.tileCol},${sender.tileRow})`;
      const { fills, glyphs } = await renderBubbleFrame(chars);
      expect(fills, where).toHaveLength(1);
      const box = fills[0];
      expect(box.x, where).toBeGreaterThanOrEqual(FLOOR_LEFT);
      expect(box.x + box.w, where).toBeLessThanOrEqual(FLOOR_RIGHT);
      expect(spansX(box, sender.x) && spansX(box, receiver.x), `${where}: box ${JSON.stringify(box)}`).toBe(true);
      expect(glyphs.length, where).toBeGreaterThan(0);
      for (const g of glyphs) expect(overlaps(g, box), `${where}: glyph ${JSON.stringify(g)} under box ${JSON.stringify(box)}`).toBe(false);
      for (const c of chars) {
        if (c === sender || c === receiver || c.tileRow === sender.tileRow) continue;
        expect(overlaps(spriteRect(c), box), `${where}: ${c.id} at (${c.tileCol},${c.tileRow}) under box ${JSON.stringify(box)}`).toBe(false);
      }
    }
  });

  it("the accepted bubble belongs to the receiver alone", async () => {
    const chars = seatReal(3);
    const [sender, , receiver] = chars;
    requestAndWait(sender, receiver);
    handleHandoffEvent(handoffCompleted("8fa85f64-5717-4562-b3fc-2c963f66afa6", "task-1", receiver.id));
    expect(receiver.bubbleText).toContain("accepts");
    expect(receiver.bubbleTextPartnerId ?? null).toBeNull();
    expect(sender.bubbleText ?? null).toBeNull();
    expect(sender.bubbleTextPartnerId ?? null).toBeNull();

    const { fills, ink } = await renderBubbleFrame(chars);
    expect(fills).toHaveLength(1);
    const box = fills[0];
    expect(spansX(box, receiver.x)).toBe(true);
    const tail = ink.find((r) => r.y >= receiver.y && r.y + r.h <= box.y && spansX(r, receiver.x));
    expect(tail, `no tail at the receiver's centre ${receiver.x}`).toBeDefined();
  });

  it("resolveDialogueBox: centred on the pair, clamped only to the floor interior, x3 at zoom 3", async () => {
    const { resolveDialogueBox } = await import("./renderer.js");
    const { DIALOGUE_BOX_HEIGHT_PX, DIALOGUE_TAIL_PX, DIALOGUE_BOX_PAD_X_PX } = await import("../constants.js");
    const cx = (col: number) => col * TILE + TILE / 2;
    for (const zoom of [1, 3]) {
      const ox = 7; // any offsetX: the floor edges carry it
      const left = ox + TILE * zoom;
      const right = ox + 19 * TILE * zoom;
      const text = 60 * zoom;
      const w = text + 2 * (DIALOGUE_BOX_PAD_X_PX + 1) * zoom;
      const at = (col: number) => ox + cx(col) * zoom;
      // Room to spare: centred on the pair's midpoint, under the feet, tail at the speaker.
      const mid = resolveDialogueBox(at(8), at(10), 72 * zoom, text, zoom, left, right);
      expect(mid).toEqual({
        x: Math.round((at(8) + at(10)) / 2 - w / 2),
        y: 72 * zoom + DIALOGUE_TAIL_PX * zoom,
        w,
        h: DIALOGUE_BOX_HEIGHT_PX * zoom,
        tailX: at(8),
      });
      // Pair at cols 1-2: clamped to the left floor edge, never x = 0, still containing both.
      const l = resolveDialogueBox(at(1), at(2), 72 * zoom, text, zoom, left, right);
      expect(l.x).toBe(left);
      expect(spansX(l, at(1)) && spansX(l, at(2))).toBe(true);
      // Pair at cols 16-17: clamped to the right floor edge.
      const r = resolveDialogueBox(at(17), at(16), 72 * zoom, text, zoom, left, right);
      expect(r.x + r.w).toBe(right);
      expect(spansX(r, at(16)) && spansX(r, at(17))).toBe(true);
      expect(r.tailX).toBe(at(17));
      // No partner: centred on the speaker alone.
      expect(resolveDialogueBox(at(8), null, 72 * zoom, text, zoom, left, right).x).toBe(Math.round(at(8) - w / 2));
    }
  });
});

describe("renderScene pass order — state glyphs are the top layer (05-13)", () => {
  beforeEach(() => {
    _resetForTests();
  });

  const lastIndex = (ops: RecordedOp[], pred: (op: RecordedOp) => boolean): number => {
    for (let i = ops.length - 1; i >= 0; i--) if (pred(ops[i])) return i;
    return -1;
  };

  it("paints a neighbour's blocked glyph after a dialogue box that crosses its column", async () => {
    const { DIALOGUE_BOX_COLOR } = await import("../constants.js");
    const chars = seatReal(3);
    const [first, middle] = chars;
    expect(first.seatRow).toBe(middle.seatRow);
    upsertCharacterFromAgent(middle.id, AgentStatus.BLOCKED);
    expect(middle.bubbleType).toBe("blocked");
    first.bubbleText = "Handing off \"Fix login bug\" to agent-2";

    const { ctx, ops } = mockCtx();
    renderScene(ctx, chars, 0, 0, 1);

    const isBox = (op: RecordedOp): boolean => op.kind === "rect" && op.color.toLowerCase() === DIALOGUE_BOX_COLOR.toLowerCase();
    const box = ops.find(isBox) as RecordedRect | undefined;
    expect(box).toBeDefined();
    // Non-vacuity: the box genuinely spans the blocked agent's glyph column.
    expect(box!.x).toBeLessThanOrEqual(middle.x - 6);
    expect(box!.x + box!.w).toBeGreaterThanOrEqual(middle.x + 6);

    const glyphColors = bubbleOnlyColors(...chars);
    const glyphIdx = ops.map((op, i) => (op.kind === "rect" && glyphColors.has(op.color.toLowerCase()) ? i : -1)).filter((i) => i >= 0);
    expect(glyphIdx.length).toBeGreaterThan(0);
    const lastBox = lastIndex(ops, isBox);
    const lastText = lastIndex(ops, (op) => op.kind === "text");
    expect(lastText).toBeGreaterThanOrEqual(0);
    expect(Math.min(...glyphIdx), "a glyph rect was painted before the dialogue box/text").toBeGreaterThan(Math.max(lastBox, lastText));
  });

  it("paints the owner's own handoff-task glyph after its own dialogue box", async () => {
    const { DIALOGUE_BOX_COLOR } = await import("../constants.js");
    upsertCharacterFromAgent("sender", AgentStatus.IDLE);
    upsertCharacterFromAgent("receiver", AgentStatus.IDLE);
    const sender = getCharacter("sender")!;
    const receiver = getCharacter("receiver")!;
    registerTaskTitle("task-1", "Fix login bug");
    handleHandoffEvent(handoffRequested("6fa85f64-5717-4562-b3fc-2c963f66afa6", "task-1", "sender", "receiver"));
    for (let i = 0; i < 200 && !(sender.path.length === 0 && sender.state === CharacterState.IDLE); i++) updateCharacter(sender, 0.05);
    checkHandoffArrivals();
    expect(sender.bubbleType).toBe("handoff-task");
    expect(sender.bubbleText).toBeTruthy();

    const { ctx, ops } = mockCtx();
    renderScene(ctx, [sender, receiver], 0, 0, 1);

    const glyphColors = bubbleOnlyColors(sender, receiver);
    const firstGlyph = ops.findIndex((op) => op.kind === "rect" && glyphColors.has(op.color.toLowerCase()));
    const lastBox = lastIndex(ops, (op) => op.kind === "rect" && op.color.toLowerCase() === DIALOGUE_BOX_COLOR.toLowerCase());
    expect(firstGlyph).toBeGreaterThanOrEqual(0);
    expect(lastBox).toBeGreaterThanOrEqual(0);
    expect(firstGlyph).toBeGreaterThan(lastBox);
  });
});

describe("dialogue colours are unambiguous (05-13 guard)", () => {
  const rgb = (hex: string): [number, number, number] => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)!;
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  };

  /** Every colour any character (any identity hue) or state glyph can paint. */
  function paletteColors(): Set<string> {
    const all = new Set<string>();
    const add = (sprite: SpriteData): void => {
      for (const row of sprite) for (const cell of row) if (cell) all.add(cell.toLowerCase());
    };
    for (let h = 0; h < 360; h += 30) {
      const s = getCharacterSprites(h);
      for (const set of [s.walk, s.typing, s.reading]) for (const dir of Object.values(set)) for (const frame of dir) add(frame);
    }
    for (const sprite of Object.values(BUBBLE_SPRITES)) add(sprite);
    return all;
  }

  it("uses achromatic colours absent from every sprite/glyph palette, floor and wall", async () => {
    const { DIALOGUE_BOX_COLOR, DIALOGUE_TEXT_COLOR, FALLBACK_FLOOR_COLOR, WALL_COLOR } = await import("../constants.js");
    const palette = paletteColors();
    expect(palette.size).toBeGreaterThan(10);
    for (const c of [DIALOGUE_BOX_COLOR, DIALOGUE_TEXT_COLOR]) {
      const [r, g, b] = rgb(c);
      expect(r === g && g === b, `${c} is not achromatic`).toBe(true);
      expect(palette.has(c.toLowerCase()), `${c} is also painted by a character or glyph`).toBe(false);
      expect(c.toLowerCase()).not.toBe(FALLBACK_FLOOR_COLOR.toLowerCase());
      expect(c.toLowerCase()).not.toBe(WALL_COLOR.toLowerCase());
    }
    // 05-28 (G-05-1b): a light speech bubble with dark ink, not a black banner.
    expect(rgb(DIALOGUE_BOX_COLOR)[0]).toBeGreaterThanOrEqual(0xc0);
    expect(rgb(DIALOGUE_TEXT_COLOR)[0]).toBeLessThanOrEqual(0x40);
  });
});

describe("furnished office (G-05-1e)", () => {
  const office = officeSprites.sprites as unknown as Record<string, { data: SpriteData | SpriteData[] }>;
  const cellKeys = (sprite: SpriteData, x: number, y: number): Set<string> => {
    const keys = new Set<string>();
    sprite.forEach((row, r) => row.forEach((c, col) => c && keys.add(`${x + col},${y + r},${c.toLowerCase()}`)));
    return keys;
  };
  const opKey = (op: RecordedOp): string => (op.kind === "rect" ? `${op.x},${op.y},${op.color.toLowerCase()}` : "");
  /** Rect indices whose cell belongs to `mine` and to none of `others`. */
  const indicesOf = (ops: RecordedOp[], mine: Set<string>, ...others: Set<string>[]): number[] =>
    ops.flatMap((op, i) => {
      const k = opKey(op);
      return k && mine.has(k) && !others.some((o) => o.has(k)) ? [i] : [];
    });
  const charKeys = (ch: Character): Set<string> => {
    const { ctx, rects } = mockCtx();
    renderScene(ctx, [ch], 0, 0, 1);
    return new Set(rects.map((r) => `${r.x},${r.y},${r.color.toLowerCase()}`));
  };

  it("renderFrame paints MetroCity floor and wall tiles", () => {
    const { ctx, rects } = mockCtx();
    renderFrame(ctx, 320, 176, OFFICE_TILE_MAP, [], 1, FURNITURE);
    const painted = new Set(rects.filter((r) => r.w === 1 && r.h === 1).map((r) => `${r.x},${r.y},${r.color.toLowerCase()}`));
    const floor = (office.floorTiles.data as SpriteData[])[(1 % 2) * 2 + (1 % 2)];
    const floorKeys = cellKeys(floor, 16, 16);
    expect(floorKeys.size).toBe(256);
    for (const k of floorKeys) expect(painted.has(k), k).toBe(true);
    for (const k of cellKeys(office.wallTop.data as SpriteData, 80, 0)) expect(painted.has(k), k).toBe(true);
    const side = rects.filter((r) => r.x === 0 && r.y === 80 && r.w === 16 && r.h === 16);
    expect(side).toHaveLength(1);
    expect(side[0].color).toBe(WALL_COLOR);
  });

  it("every furniture piece is painted at its footprint", () => {
    const { ctx, rects } = mockCtx();
    renderFrame(ctx, 320, 176, OFFICE_TILE_MAP, [], 1, FURNITURE);
    const painted = new Set(rects.map((r) => `${r.x},${r.y},${r.color.toLowerCase()}`));
    expect(FURNITURE.length).toBe(8 + 16 + 4 + 2);
    for (const f of FURNITURE) for (const k of cellKeys(f.sprite, f.x, f.y)) expect(painted.has(k), k).toBe(true);
  });

  it("a desk covers the agent seated behind it, and an agent in the lane in front covers the desk", () => {
    const seated = createCharacter("seated", 1, 4);
    const walker = createCharacter("walker", 2, 6, 90);
    const desk = FURNITURE.find((f) => f.x === 17 && f.sprite === office.desk.data)!;
    expect(desk).toBeDefined();
    const deskKeys = cellKeys(desk.sprite, desk.x, desk.y);
    const aKeys = charKeys(seated);
    const bKeys = charKeys(walker);
    const { ctx, ops } = mockCtx();
    renderScene(ctx, [walker, seated], 0, 0, 1, FURNITURE);
    const a = indicesOf(ops, aKeys, deskKeys, bKeys);
    const b = indicesOf(ops, bKeys, deskKeys, aKeys);
    const d = indicesOf(ops, deskKeys, aKeys, bKeys);
    expect(a.length && b.length && d.length).toBeTruthy();
    expect(d[0]).toBeGreaterThan(Math.max(...a));
    expect(d[0]).toBeLessThan(b[0]);
  });

  it("wall decor is behind characters", () => {
    const chars = [createCharacter("x", 4, 1), createCharacter("y", 12, 1, 60)];
    const charSet = new Set([...charKeys(chars[0]), ...charKeys(chars[1])]);
    const paintings = FURNITURE.filter((f) => f.sprite === office.painting.data);
    expect(paintings).toHaveLength(2);
    const paintKeys = new Set(paintings.flatMap((p) => [...cellKeys(p.sprite, p.x, p.y)]));
    const { ctx, ops } = mockCtx();
    renderScene(ctx, chars, 0, 0, 1, FURNITURE);
    const p = indicesOf(ops, paintKeys, charSet);
    const c = indicesOf(ops, charSet, paintKeys);
    expect(p.length && c.length).toBeTruthy();
    expect(Math.max(...p)).toBeLessThan(Math.min(...c));
  });

  it("the layout's seat model is well-formed", () => {
    const isFloor = (col: number, row: number) => OFFICE_TILE_MAP[row]?.[col] === TileType.FLOOR_1;
    const seen = new Set<string>();
    expect(SEATS).toHaveLength(16);
    expect(STANDING_SPOTS).toHaveLength(4);
    for (const s of SEATS) {
      expect(isFloor(s.col, s.row)).toBe(true);
      expect(FURNITURE_BLOCKED_TILES.has(`${s.col},${s.row + 1}`)).toBe(true);
      expect(seen.has(`${s.col},${s.row}`)).toBe(false);
      seen.add(`${s.col},${s.row}`);
    }
    for (const s of STANDING_SPOTS) {
      const k = `${s.col},${s.row}`;
      expect(isFloor(s.col, s.row)).toBe(true);
      expect(FURNITURE_BLOCKED_TILES.has(k)).toBe(false);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    for (const s of [...SEATS, ...STANDING_SPOTS]) expect([4, 8]).toContain(s.row);
    const own = createCharacter("s", 1, 4);
    expect(isOwnSeat(own)).toBe(true);
    expect(isOwnSeat(createCharacter("t", 2, 6))).toBe(false);
  });
});

describe("sprite cache (05-24, T-05-24-01)", () => {
  it("sprites are rasterised once per (sprite, zoom) when OffscreenCanvas exists", () => {
    const made: Array<{ width: number; height: number; rects: number }> = [];
    class FakeOffscreenCanvas {
      rec: { width: number; height: number; rects: number };
      constructor(width: number, height: number) {
        this.rec = { width, height, rects: 0 };
        made.push(this.rec);
      }
      getContext() {
        const rec = this.rec;
        return { fillStyle: "", fillRect() { rec.rects++; } };
      }
    }
    const g = globalThis as { OffscreenCanvas?: unknown };
    const prev = g.OffscreenCanvas;
    g.OffscreenCanvas = FakeOffscreenCanvas;
    try {
      // A zoom no other test uses, so the module-level cache starts cold for it.
      const zoom = 3;
      const chars = [createCharacter("a", 1, 4), createCharacter("b", 2, 6, 150)];
      const f1 = mockCtx();
      renderFrame(f1.ctx, 960, 528, OFFICE_TILE_MAP, chars, zoom, FURNITURE);
      const distinct = new Set(f1.images.map((i) => i.image));
      expect(f1.images.length).toBeGreaterThan(200);
      expect(made.length).toBe(distinct.size);
      // Only wall-colour tile fills remain on the fillRect path.
      expect(f1.rects.every((r) => r.w === 16 * zoom && r.h === 16 * zoom)).toBe(true);
      for (const m of made) expect(m.rects).toBeGreaterThan(0);

      const before = made.length;
      const f2 = mockCtx();
      renderFrame(f2.ctx, 960, 528, OFFICE_TILE_MAP, chars, zoom, FURNITURE);
      expect(made.length).toBe(before);
      expect(f2.images.length).toBe(f1.images.length);
    } finally {
      if (prev === undefined) delete g.OffscreenCanvas;
      else g.OffscreenCanvas = prev;
    }
  });
});

describe("seated whenever resting on the own seat (05-25, G-05-P3)", () => {
  beforeEach(() => {
    _resetForTests();
  });

  /** Top y of a lone character's painted sprite at zoom 1, glyph suppressed
   *  (pass 3 would otherwise paint above the head and win the min). */
  const topY = (ch: Character) => {
    const prev = ch.bubbleType;
    ch.bubbleType = null;
    const { ctx, rects } = mockCtx();
    renderScene(ctx, [ch], 0, 0, 1);
    ch.bubbleType = prev;
    return Math.min(...rects.map((r) => r.y));
  };
  /** The drawY renderScene actually used — the painted top minus the DRAWN
   *  frame's own first ink row, so poses with different ink bounds compare. */
  const drawYOf = (ch: Character) => {
    const frame = getCharacterSprite(ch, getCharacterSprites(ch.hueShift));
    return topY(ch) - frame.findIndex((row) => row.some(Boolean));
  };
  const standingDrawY = (ch: Character) => ch.y - SPRITE_H;
  const seatedDrawY = (ch: Character) => ch.y - SPRITE_H + CHARACTER_SITTING_OFFSET_PX;
  /** The frame the pose alone dictates (D-01: the seat never swaps frames). */
  const poseFrame = (ch: Character): SpriteData => {
    const s = getCharacterSprites(ch.hueShift);
    return ch.state === CharacterState.TYPE ? s.typing[ch.dir][ch.frame % 2] : s.walk[ch.dir][1];
  };
  /** Rows on which this character's own paint SURVIVES the composited frame
   *  (furniture on, glyph and dialogue off): a cell counts when adding the
   *  character changes the final colour at that cell versus a furniture-only
   *  control render. The desk is drawn after a seated agent, so its rows are
   *  genuinely gone rather than merely shifted. */
  const visibleBodyRows = (ch: Character): Set<number> => {
    const finalColors = (chars: Character[]) => {
      const { ctx, rects } = mockCtx();
      renderScene(ctx, chars, 0, 0, 1, FURNITURE);
      const m = new Map<string, string>();
      for (const r of rects) m.set(`${r.x},${r.y}`, r.color.toLowerCase());
      return m;
    };
    const prev = ch.bubbleType;
    ch.bubbleType = null;
    const control = finalColors([]);
    const withCh = finalColors([ch]);
    ch.bubbleType = prev;
    const rows = new Set<number>();
    for (const [cell, color] of withCh) if (control.get(cell) !== color) rows.add(Number(cell.split(",")[1]));
    return rows;
  };

  const RESTING_STATUSES = [
    AgentStatus.IDLE,
    AgentStatus.BLOCKED,
    AgentStatus.WAITING_FOR_AGENT,
    AgentStatus.WAITING_FOR_CEO,
    AgentStatus.FAILED,
    AgentStatus.COMPLETED,
    AgentStatus.CODING,
  ];

  it.each(RESTING_STATUSES)(
    "a %s agent resting on its own seat is drawn seated, keeping its pose's own frame (G-05-P3, D-01)",
    (status) => {
      _resetForTests();
      upsertCharacterFromAgent("rest", status);
      const ch = getCharacter("rest")!;
      expect(ch.tileCol).toBe(SEATS[0].col);
      expect(ch.tileRow).toBe(SEATS[0].row);
      expect(isOwnSeat(ch)).toBe(true);
      // The real STATUS_MAP pose, frozen flag and glyph are in play.
      expect(ch.state).toBe(STATUS_MAP[status].pose);
      expect(ch.bubbleType ?? undefined).toBe(STATUS_MAP[status].bubble);
      const frame = getCharacterSprite(ch, getCharacterSprites(ch.hueShift));
      expect(frame, `${status}: the drawn frame must come from the pose`).toBe(poseFrame(ch));

      expect(drawYOf(ch), `${status} on its own seat`).toBe(seatedDrawY(ch));

      // The same character, same tile, same frame — but the seat is elsewhere.
      ch.seatCol = SEATS[1].col;
      ch.seatRow = SEATS[1].row;
      expect(isOwnSeat(ch)).toBe(false);
      expect(getCharacterSprite(ch, getCharacterSprites(ch.hueShift))).toBe(frame);
      expect(drawYOf(ch), `${status} off its seat`).toBe(standingDrawY(ch));
    },
  );

  it("only an off-seat character stands: walking, on a standing spot, or away from home (G-05-P3)", () => {
    const walking = createCharacter("w", SEATS[0].col, SEATS[0].row);
    walking.state = CharacterState.WALK;
    expect(isOwnSeat(walking)).toBe(true); // on its seat tile, but moving
    expect(drawYOf(walking), "a walker on its own seat tile").toBe(standingDrawY(walking));

    const onStandingSpot = createCharacter("s", STANDING_SPOTS[0].col, STANDING_SPOTS[0].row);
    expect(isOwnSeat(onStandingSpot)).toBe(false);
    expect(drawYOf(onStandingSpot), "a standing spot is never a seat").toBe(standingDrawY(onStandingSpot));

    const visiting = createCharacter("v", SEATS[1].col, SEATS[1].row);
    visiting.seatCol = SEATS[0].col;
    visiting.seatRow = SEATS[0].row;
    expect(isOwnSeat(visiting)).toBe(false);
    expect(drawYOf(visiting), "resting on someone else's seat").toBe(standingDrawY(visiting));
  });

  it("a resting agent at its own desk shows at least 8 fewer visible body rows than the same agent standing in the aisle (G-05-P3)", () => {
    const seated = createCharacter("r", SEATS[0].col, SEATS[0].row);
    expect(isOwnSeat(seated)).toBe(true);
    expect(seated.state).toBe(CharacterState.IDLE);

    // Open aisle, no furniture on rows 6-7 and nothing sorts in front there.
    const standing = createCharacter("r", 2, 6);
    expect(isOwnSeat(standing)).toBe(false);
    expect(standing.state).toBe(CharacterState.IDLE);
    expect(getCharacterSprite(seated, getCharacterSprites(seated.hueShift))).toBe(
      getCharacterSprite(standing, getCharacterSprites(standing.hueShift)),
    );

    const seatedRows = visibleBodyRows(seated).size;
    const standingRows = visibleBodyRows(standing).size;
    expect(seatedRows).toBeGreaterThan(0);
    expect(
      standingRows - seatedRows,
      `seated shows ${seatedRows} body rows, standing shows ${standingRows}`,
    ).toBeGreaterThanOrEqual(8);
  });

  const typer = (col: number, row: number) => {
    const ch = createCharacter("t", col, row);
    ch.state = CharacterState.TYPE;
    return ch;
  };
  const isTypingFrame = (ch: Character) =>
    getCharacterSprite(ch, getCharacterSprites(ch.hueShift)) === getCharacterSprites(ch.hueShift).typing[ch.dir][ch.frame % 2];

  it("a TYPE agent on its own seat is drawn seated", () => {
    const seated = typer(SEATS[0].col, SEATS[0].row);
    expect(isOwnSeat(seated)).toBe(true);
    const off = typer(SEATS[0].col, SEATS[0].row);
    off.seatCol = SEATS[1].col; // same tile and frame, but not its own seat
    expect(topY(seated) - topY(off)).toBe(CHARACTER_SITTING_OFFSET_PX);
    expect(isTypingFrame(seated)).toBe(true);
  });

  it("a TYPE agent off its seat keeps typing but is not lowered (D-01)", () => {
    const seated = typer(SEATS[0].col, SEATS[0].row);
    const visiting = typer(SEATS[0].col, SEATS[0].row);
    visiting.seatCol = SEATS[1].col;
    const standing = typer(STANDING_SPOTS[0].col, STANDING_SPOTS[0].row);
    expect(STANDING_SPOTS[0].row).toBe(SEATS[0].row);
    for (const ch of [visiting, standing]) {
      expect(isOwnSeat(ch)).toBe(false);
      expect(topY(ch)).toBe(topY(seated) - CHARACTER_SITTING_OFFSET_PX);
      expect(isTypingFrame(ch)).toBe(true);
    }
  });

  it("a walk that ends at home faces down", () => {
    const blocked = new Set(FURNITURE_BLOCKED_TILES);
    const walk = (ch: Character, col: number, row: number) => {
      walkCharacterTo(ch, col, row, OFFICE_TILE_MAP, blocked);
      for (let i = 0; i < 600 && ch.state === CharacterState.WALK; i++) updateCharacter(ch, 1 / 60);
      expect(ch.state).not.toBe(CharacterState.WALK);
    };
    const ch = createCharacter("w", SEATS[0].col, SEATS[0].row);
    walk(ch, SEATS[0].col + 1, SEATS[0].row);
    expect(ch.dir).toBe(Direction.RIGHT); // away from home: keeps its walking direction
    walk(ch, SEATS[0].col, SEATS[0].row);
    expect(ch.dir).toBe(Direction.DOWN);
  });
});

// 06-07 (CEO-01, D-10): agents that need the CEO walk to the CEO room's queue
// and walk home when they no longer do. Every position here comes from the real
// stepOffice loop, never a direct assignment.
import { AgentStatus } from "event-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { renderScene } from "../engine/renderer.js";
import { _resetForTests, getCharacter, stepOffice, upsertCharacterFromAgent } from "../index.js";
import { CEO_QUEUE_SLOTS, FURNITURE, FURNITURE_BLOCKED_TILES, SEATS } from "../layout/officeLayout.js";
import type { Character } from "../types.js";
import { CharacterState, Direction } from "../types.js";
import * as ceoQueue from "./ceo-queue.js";

const occupants = (): ReadonlyMap<string, number> => ceoQueue.getCeoQueueOccupants?.() ?? new Map();
const run = (seconds = 20): void => {
  for (let i = 0; i < seconds * 60; i++) stepOffice(1 / 60);
};
const ch = (id: string): Character => getCharacter(id)!;
const at = (c: Character) => ({ col: c.tileCol, row: c.tileRow });
/** Seats `n` idle agents a0..a(n-1) on SEATS[0..n-1]. */
const seat = (n: number): void => {
  for (let i = 0; i < n; i++) upsertCharacterFromAgent(`a${i}`, AgentStatus.IDLE);
};

beforeEach(() => {
  _resetForTests();
});

describe("CEO queue (06-07, CEO-01)", () => {
  it("walks a waiting agent to the front slot with its glyph up from the start, and stands it there facing down", () => {
    seat(1);
    upsertCharacterFromAgent("a0", AgentStatus.WAITING_FOR_CEO);
    const a = ch("a0");
    expect(a.bubbleType).toBe("permission");
    expect(at(a)).toEqual(SEATS[0]);
    expect(a.state).toBe(CharacterState.WALK);
    const path = a.path.map((t) => `${t.col},${t.row}`);
    expect(path.filter((k) => FURNITURE_BLOCKED_TILES.has(k))).toEqual([]);
    run();
    expect({ tileCol: a.tileCol, tileRow: a.tileRow, dir: a.dir }).toEqual({ tileCol: 21, tileRow: 8, dir: Direction.DOWN });
    expect(a.state).toBe(CharacterState.IDLE);
    expect(a.bubbleType).toBe("permission");
  });

  it("fills slots 0..3 in upsert order and leaves a fifth waiting agent seated with its glyph", () => {
    seat(5);
    for (let i = 0; i < 5; i++) upsertCharacterFromAgent(`a${i}`, AgentStatus.WAITING_FOR_CEO);
    expect(ch("a4").state).not.toBe(CharacterState.WALK);
    run();
    for (let i = 0; i < 4; i++) {
      expect(occupants().get(`a${i}`)).toBe(i);
      expect(at(ch(`a${i}`))).toEqual(CEO_QUEUE_SLOTS[i]);
    }
    expect(occupants().has("a4")).toBe(false);
    expect(at(ch("a4"))).toEqual(SEATS[4]);
    expect(ch("a4").bubbleType).toBe("permission");
  });

  it("releases the slot and walks the agent home the moment it stops waiting, with no shuffle and no walk-in from overflow", () => {
    seat(6);
    for (let i = 0; i < 5; i++) upsertCharacterFromAgent(`a${i}`, AgentStatus.WAITING_FOR_CEO);
    run();
    const slot1 = at(ch("a1"));

    upsertCharacterFromAgent("a0", AgentStatus.CODING);
    const a0 = ch("a0");
    expect(occupants().has("a0")).toBe(false);
    expect(a0.bubbleType).toBeNull();
    expect(a0.path[a0.path.length - 1]).toEqual(SEATS[0]);

    run();
    expect(at(a0)).toEqual(SEATS[0]);
    expect(a0.state).toBe(CharacterState.TYPE);
    expect(at(ch("a1"))).toEqual(slot1);
    // The overflow agent keeps waiting at its desk for its whole wait.
    expect(at(ch("a4"))).toEqual(SEATS[4]);
    expect(occupants().has("a4")).toBe(false);

    upsertCharacterFromAgent("a5", AgentStatus.WAITING_FOR_CEO);
    run();
    expect(occupants().get("a5")).toBe(0);
    expect(at(ch("a5"))).toEqual(CEO_QUEUE_SLOTS[0]);
  });

  it("frees the slot of an agent that goes offline while queued", () => {
    seat(1);
    upsertCharacterFromAgent("a0", AgentStatus.WAITING_FOR_CEO);
    run();
    expect(occupants().get("a0")).toBe(0);
    upsertCharacterFromAgent("a0", AgentStatus.OFFLINE);
    expect(getCharacter("a0")).toBeUndefined();
    expect(occupants().size).toBe(0);
  });

  it("draws no text for a queued agent: the glyph is the whole signal", () => {
    seat(1);
    upsertCharacterFromAgent("a0", AgentStatus.WAITING_FOR_CEO);
    run();
    let texts = 0;
    const ctx = {
      fillStyle: "",
      font: "",
      fillRect() {},
      fillText() {
        texts++;
      },
      measureText: () => ({ width: 0 }),
      clearRect() {},
      drawImage() {},
    } as unknown as CanvasRenderingContext2D;
    renderScene(ctx, [ch("a0")], 0, 0, 1, FURNITURE);
    expect(texts).toBe(0);
  });
});

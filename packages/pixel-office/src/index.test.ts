import { describe, it, expect, beforeEach } from "vitest";
import { AgentStatus } from "event-schema";
import { upsertCharacterFromAgent, getCharacter, _resetForTests, DEFAULT_ROWS } from "./index";
import { CharacterState, Direction } from "./types";
import { findPath } from "./layout/tileMap";
import { TileType } from "./types";
import { getCharacterSprites } from "./sprites/spriteData";

beforeEach(() => {
  _resetForTests();
});

describe("upsertCharacterFromAgent", () => {
  it("creates a character with state === CharacterState.IDLE for AgentStatus.IDLE", () => {
    upsertCharacterFromAgent("agent-1", AgentStatus.IDLE);
    const ch = getCharacter("agent-1");
    expect(ch).toBeDefined();
    expect(ch?.state).toBe(CharacterState.IDLE);
  });

  it("resolves every AgentStatus via status-mapping's exhaustive STATUS_MAP — CODING now creates a TYPE-pose character (05-02, not 05-01's IDLE-only stub)", () => {
    upsertCharacterFromAgent("agent-2", AgentStatus.CODING);
    const ch = getCharacter("agent-2");
    expect(ch).toBeDefined();
    expect(ch?.state).toBe(CharacterState.TYPE);
  });

  it("freezes and applies a distinct bubble for blocked/waiting_for_agent/waiting_for_ceo (D-03)", () => {
    upsertCharacterFromAgent("agent-3", AgentStatus.BLOCKED);
    upsertCharacterFromAgent("agent-4", AgentStatus.WAITING_FOR_AGENT);
    upsertCharacterFromAgent("agent-5", AgentStatus.WAITING_FOR_CEO);

    const blocked = getCharacter("agent-3");
    const waitingAgent = getCharacter("agent-4");
    const waitingCeo = getCharacter("agent-5");

    expect(blocked?.frozen).toBe(true);
    expect(waitingAgent?.frozen).toBe(true);
    expect(waitingCeo?.frozen).toBe(true);
    expect(waitingAgent?.bubbleType).not.toBe(waitingCeo?.bubbleType);
  });

  it("despawns (removes) the character for AgentStatus.OFFLINE — the offline sentinel is never rendered", () => {
    upsertCharacterFromAgent("agent-6", AgentStatus.IDLE);
    expect(getCharacter("agent-6")).toBeDefined();

    upsertCharacterFromAgent("agent-6", AgentStatus.OFFLINE);
    expect(getCharacter("agent-6")).toBeUndefined();
  });

  it("applies deploying's 1.5x frameSpeedMultiplier — the one legitimate procedural-variation state signal", () => {
    upsertCharacterFromAgent("agent-7", AgentStatus.DEPLOYING);
    expect(getCharacter("agent-7")?.frameSpeedMultiplier).toBe(1.5);
  });
});

describe("per-agent identity hue (WR-08)", () => {
  const IDS = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5", "agent-6"];

  function seedAndRead(): Array<{ id: string; hueShift: number }> {
    for (const id of IDS) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    return IDS.map((id) => ({ id, hueShift: getCharacter(id)!.hueShift }));
  }

  it("gives different agent ids different hues, and those hues produce different pixel data", () => {
    const seeded = seedAndRead();
    const hues = seeded.map((s) => s.hueShift);
    expect(new Set(hues).size).toBeGreaterThan(1);

    const a = seeded[0];
    const b = seeded.find((s) => s.hueShift !== a.hueShift)!;
    const spriteA = getCharacterSprites(a.hueShift).walk[Direction.DOWN][0];
    const spriteB = getCharacterSprites(b.hueShift).walk[Direction.DOWN][0];
    expect(spriteA).not.toEqual(spriteB);
  });

  it("derives the hue deterministically — the same agent id yields the same hue across resets", () => {
    const first = seedAndRead();
    _resetForTests();
    const second = seedAndRead();
    expect(second).toEqual(first);
  });

  it("maps every hue onto one of the twelve 30-degree identity buckets", () => {
    const buckets = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    for (const { hueShift } of seedAndRead()) expect(buckets).toContain(hueShift);
  });
});

describe("desk layout headroom (CR-02)", () => {
  /** Seats n agents through the real layout and returns their desk rows. */
  function seatRows(n: number): number[] {
    for (let i = 0; i < n; i++) upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
    return Array.from({ length: n }, (_, i) => getCharacter(`agent-${i}`)!.seatRow);
  }

  it("seats the first desk row at interior row 3 and the next at interior row 6, sharing column 1", () => {
    const rows = seatRows(19);
    for (let i = 0; i < 18; i++) expect(rows[i]).toBe(3);
    expect(rows[18]).toBe(6);
    expect(getCharacter("agent-0")!.seatCol).toBe(1);
    expect(getCharacter("agent-18")!.seatCol).toBe(1);
  });

  it("never seats a desk on interior row 1 or 2, and keeps consecutive desk rows at least 3 apart", () => {
    const distinct = [...new Set(seatRows(60))].sort((a, b) => a - b);
    expect(distinct[0]).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < distinct.length; i++) {
      expect(distinct[i] - distinct[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });

  it("clamps overflow desks to the last interior row rather than seating a character inside the wall border", () => {
    const rows = seatRows(80);
    for (const row of rows) expect(row).toBeLessThanOrEqual(DEFAULT_ROWS - 2);
  });

  /** "col,row" of every id's seat, asserting no two share a tile. */
  function expectDistinctSeats(ids: string[]): void {
    const seats = ids.map((id) => {
      const ch = getCharacter(id)!;
      return `${ch.seatCol},${ch.seatRow}`;
    });
    expect(new Set(seats).size).toBe(seats.length);
  }

  it("reclaims a despawned agent's desk across heavy offline/online churn (WR-03)", () => {
    for (const id of ["agent-a", "agent-b", "agent-c"]) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    const b = getCharacter("agent-b")!;
    const original = { col: b.seatCol, row: b.seatRow };
    for (let i = 0; i < 100; i++) {
      upsertCharacterFromAgent("agent-b", AgentStatus.OFFLINE);
      upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    }
    const after = getCharacter("agent-b")!;
    expect({ col: after.seatCol, row: after.seatRow }).toEqual(original);
    expectDistinctSeats(["agent-a", "agent-b", "agent-c"]);
  });

  it("never seats two concurrently seated characters on one tile after churn (<= 54 seated)", () => {
    const ids = Array.from({ length: 37 }, (_, i) => `agent-${i}`);
    for (const id of ids) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    expect(getCharacter("agent-36")!.seatRow).toBe(9);
    expect(getCharacter("agent-36")!.seatCol).toBe(1);
    for (let i = 0; i < 18; i++) {
      upsertCharacterFromAgent("agent-0", AgentStatus.OFFLINE);
      upsertCharacterFromAgent("agent-0", AgentStatus.IDLE);
    }
    expectDistinctSeats(ids);
  });

  it("gives the next new character the lowest-numbered free desk", () => {
    for (let i = 0; i < 5; i++) upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
    upsertCharacterFromAgent("agent-1", AgentStatus.OFFLINE);
    upsertCharacterFromAgent("agent-3", AgentStatus.OFFLINE);
    upsertCharacterFromAgent("new-1", AgentStatus.IDLE);
    upsertCharacterFromAgent("new-2", AgentStatus.IDLE);
    expect(getCharacter("new-1")).toMatchObject({ seatCol: 2, seatRow: 3 });
    expect(getCharacter("new-2")).toMatchObject({ seatCol: 4, seatRow: 3 });
  });
});

describe("layout/tileMap findPath (forked, sanity check)", () => {
  it("returns an empty array when start === end", () => {
    const tileMap = [
      [TileType.FLOOR_1, TileType.FLOOR_1],
      [TileType.FLOOR_1, TileType.FLOOR_1],
    ];
    expect(findPath(0, 0, 0, 0, tileMap, new Set())).toEqual([]);
  });
});

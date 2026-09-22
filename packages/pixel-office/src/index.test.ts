import { describe, it, expect, beforeEach } from "vitest";
import { AgentStatus } from "event-schema";
import {
  upsertCharacterFromAgent,
  getCharacter,
  _resetForTests,
  MIN_DISPLAY_SCALE,
  displayScaleFor,
} from "./index";
import { CharacterState, Direction } from "./types";
import { findPath } from "./layout/tileMap";
import { TileType } from "./types";
import { FURNITURE_BLOCKED_TILES, OFFICE_TILE_MAP, SEATS, STANDING_SPOTS } from "./layout/officeLayout";
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

  // The ten ids 05-VERIFICATION.md gap 2 measured (seven distinct hues under 05-10).
  const MEASURED = ["alpha", "beta", "agent-1", "agent-2", "claude-1", "engineer", "qa", "worker-a", "worker-b", "ceo"];
  const hueOf = (id: string) => getCharacter(id)!.hueShift;

  it("gives the ten measured ids ten distinct hues and pairwise-different pixel data", () => {
    for (const id of MEASURED) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    const hues = MEASURED.map(hueOf);
    expect(new Set(hues).size).toBe(10);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(getCharacterSprites(hues[i]).walk[Direction.DOWN][0]).not.toEqual(
          getCharacterSprites(hues[j]).walk[Direction.DOWN][0],
        );
      }
    }
  });

  it("holds twelve distinct hues for twelve seated agents, and exactly twelve for thirteen (the ceiling)", () => {
    const ids = Array.from({ length: 13 }, (_, i) => `seat-${i}`);
    for (const id of ids.slice(0, 12)) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    expect(new Set(ids.slice(0, 12).map(hueOf)).size).toBe(12);
    upsertCharacterFromAgent(ids[12], AgentStatus.IDLE);
    expect(new Set(ids.map(hueOf)).size).toBe(12);
  });

  it("frees a despawned agent's hue for the next new agent when all twelve are held", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `seat-${i}`);
    for (const id of ids) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    const freed = hueOf("seat-5");
    upsertCharacterFromAgent("seat-5", AgentStatus.OFFLINE);
    upsertCharacterFromAgent("newcomer", AgentStatus.IDLE);
    expect(hueOf("newcomer")).toBe(freed);
  });

  it("never lets AgentStatus feed the identity hue", () => {
    for (const id of MEASURED) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    const idle = MEASURED.map(hueOf);
    _resetForTests();
    MEASURED.forEach((id, i) => upsertCharacterFromAgent(id, i % 2 ? AgentStatus.CODING : AgentStatus.BLOCKED));
    expect(MEASURED.map(hueOf)).toEqual(idle);
  });
});

describe("office layout seats (G-05-1e)", () => {
  const seatOf = (id: string) => {
    const ch = getCharacter(id)!;
    return { col: ch.seatCol, row: ch.seatRow };
  };
  const seatAgents = (n: number) => {
    for (let i = 0; i < n; i++) upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
  };

  it("seats the 1st, 2nd and 9th agents at SEATS[0], SEATS[1] and SEATS[8]", () => {
    seatAgents(9);
    expect(SEATS[0]).toEqual({ col: 1, row: 4 });
    expect(SEATS[1]).toEqual({ col: 3, row: 4 });
    expect(SEATS[8]).toEqual({ col: 1, row: 8 });
    expect(seatOf("agent-0")).toEqual(SEATS[0]);
    expect(seatOf("agent-1")).toEqual(SEATS[1]);
    expect(seatOf("agent-8")).toEqual(SEATS[8]);
  });

  /** "col,row" of every id's seat, asserting no two share a tile. */
  function expectDistinctSeats(ids: string[]): void {
    const seats = ids.map((id) => `${seatOf(id).col},${seatOf(id).row}`);
    expect(new Set(seats).size).toBe(seats.length);
  }

  it("reclaims a despawned agent's seat across heavy offline/online churn (WR-03)", () => {
    for (const id of ["agent-a", "agent-b", "agent-c"]) upsertCharacterFromAgent(id, AgentStatus.IDLE);
    const original = seatOf("agent-b");
    for (let i = 0; i < 100; i++) {
      upsertCharacterFromAgent("agent-b", AgentStatus.OFFLINE);
      upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    }
    expect(seatOf("agent-b")).toEqual(original);
    expectDistinctSeats(["agent-a", "agent-b", "agent-c"]);
  });

  it("gives the next new agent the lowest free seat", () => {
    seatAgents(5);
    upsertCharacterFromAgent("agent-1", AgentStatus.OFFLINE);
    upsertCharacterFromAgent("agent-3", AgentStatus.OFFLINE);
    upsertCharacterFromAgent("new-1", AgentStatus.IDLE);
    upsertCharacterFromAgent("new-2", AgentStatus.IDLE);
    expect(seatOf("new-1")).toEqual(SEATS[1]);
    expect(seatOf("new-2")).toEqual(SEATS[3]);
  });

  it("stands the 17th agent on STANDING_SPOTS[0] and keeps 20 present agents on 20 distinct tiles", () => {
    seatAgents(20);
    expect(seatOf("agent-16")).toEqual(STANDING_SPOTS[0]);
    const ids = Array.from({ length: 20 }, (_, i) => `agent-${i}`);
    expectDistinctSeats(ids);
    for (let i = 0; i < 20; i++) {
      upsertCharacterFromAgent("agent-4", AgentStatus.OFFLINE);
      upsertCharacterFromAgent("agent-4", AgentStatus.IDLE);
    }
    expectDistinctSeats(ids);
  });

  it("shares the last standing spot from the 21st agent (the documented ceiling)", () => {
    seatAgents(21);
    expect(seatOf("agent-20")).toEqual(STANDING_SPOTS[STANDING_SPOTS.length - 1]);
    expect(seatOf("agent-19")).toEqual(STANDING_SPOTS[STANDING_SPOTS.length - 1]);
  });

  it("links every seat and standing spot to every other over the furniture-blocked tiles", () => {
    const homes = [...SEATS, ...STANDING_SPOTS];
    const blocked = new Set(FURNITURE_BLOCKED_TILES);
    for (const a of homes) {
      for (const b of homes) {
        if (a === b) continue;
        const path = findPath(a.col, a.row, b.col, b.row, OFFICE_TILE_MAP, blocked);
        expect(path.length, `${a.col},${a.row} -> ${b.col},${b.row}`).toBeGreaterThan(0);
        expect(path[path.length - 1]).toEqual(b);
      }
    }
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

describe("display scale (G-05-1a)", () => {
  it("never presents the office below 3x", () => {
    expect(MIN_DISPLAY_SCALE).toBe(3);
  });

  it("picks the largest integer scale that fits, floored at the minimum", () => {
    const cases: [number, number, number][] = [
      [1920, 1056, 6],
      [1280, 696, 3],
      [3840, 2136, 12],
      [800, 600, 3],
      [1400, 900, 4],
    ];
    for (const [w, h, n] of cases) {
      const got = displayScaleFor(w, h);
      expect(got).toBe(n);
      expect(Number.isInteger(got)).toBe(true);
    }
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { AgentStatus } from "event-schema";
import { upsertCharacterFromAgent, getCharacter, _resetForTests } from "./index";
import { CharacterState } from "./types";
import { findPath } from "./layout/tileMap";
import { TileType } from "./types";

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

describe("layout/tileMap findPath (forked, sanity check)", () => {
  it("returns an empty array when start === end", () => {
    const tileMap = [
      [TileType.FLOOR_1, TileType.FLOOR_1],
      [TileType.FLOOR_1, TileType.FLOOR_1],
    ];
    expect(findPath(0, 0, 0, 0, tileMap, new Set())).toEqual([]);
  });
});

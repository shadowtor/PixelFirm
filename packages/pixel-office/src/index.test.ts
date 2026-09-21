import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("no-ops (with a console.warn) for any AgentStatus other than IDLE — the exhaustive mapping is 05-02's job", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    upsertCharacterFromAgent("agent-2", AgentStatus.CODING);
    expect(getCharacter("agent-2")).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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

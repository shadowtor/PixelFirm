import { describe, it, expect, beforeEach } from "vitest";
import type { CompanyEvent } from "event-schema";
import { AgentStatus } from "event-schema";
import { upsertCharacterFromAgent, getCharacter, getTileMap, _resetForTests } from "../index";
import { CharacterState } from "../types";
import { findPath } from "../layout/tileMap";
import { handleHandoffEvent, checkHandoffArrivals } from "./handoff-choreography";

function requestedEvent(taskId: string, fromAgentId: string, toAgentId: string): CompanyEvent {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    version: 1,
    occurredAt: "2026-09-21T00:00:00.000Z",
    companyId: "company-1",
    taskId,
    visibility: "INTERNAL",
    type: "agent.handoff_requested",
    payload: { taskId, fromAgentId, toAgentId },
  } as CompanyEvent;
}

function completedEvent(taskId: string, toAgentId: string): CompanyEvent {
  return {
    id: "4fa85f64-5717-4562-b3fc-2c963f66afa6",
    version: 1,
    occurredAt: "2026-09-21T00:01:00.000Z",
    companyId: "company-1",
    taskId,
    visibility: "INTERNAL",
    type: "agent.handoff_completed",
    payload: { taskId, toAgentId },
  } as CompanyEvent;
}

/** Drives a WALK-state character's path to completion exactly the way
 *  engine/characters.ts's updateCharacter does when the path array empties
 *  (snap to target tile, go IDLE) — avoids re-implementing frame-by-frame
 *  dt stepping just to reach the same terminal state a real game-loop tick
 *  would produce. */
function finishWalk(ch: { tileCol: number; tileRow: number; path: Array<{ col: number; row: number }>; state: CharacterState }): void {
  const last = ch.path[ch.path.length - 1];
  ch.tileCol = last.col;
  ch.tileRow = last.row;
  ch.path = [];
  ch.state = CharacterState.IDLE;
}

beforeEach(() => {
  _resetForTests();
});

describe("handleHandoffEvent — agent.handoff_requested", () => {
  it("sets the sending character's state to WALK with a non-empty path computed via the real forked findPath (not a stub)", () => {
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE); // first desk of row DESK_ROW_START
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE); // next desk along the same row
    const fromChar = getCharacter("agent-a")!;
    const toChar = getCharacter("agent-b")!;

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));

    expect(fromChar.state).toBe(CharacterState.WALK);
    expect(fromChar.path.length).toBeGreaterThan(0);

    const realPath = findPath(fromChar.tileCol, fromChar.tileRow, toChar.seatCol, toChar.seatRow, getTileMap(), new Set());
    expect(fromChar.path).toEqual(realPath);
    expect(fromChar.path[0]).toBeDefined();
    expect(fromChar.path[fromChar.path.length - 1]).toEqual({ col: toChar.seatCol, row: toChar.seatRow });
  });

  it("the receiving character's state remains whatever it already was — NOT TYPE — immediately after agent.handoff_requested alone", () => {
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    const toChar = getCharacter("agent-b")!;
    const priorState = toChar.state;

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));

    expect(toChar.state).toBe(priorState);
    expect(toChar.state).not.toBe(CharacterState.TYPE);
  });
});

describe("handleHandoffEvent — agent.handoff_completed", () => {
  it("is a safe no-op when the walk hasn't reached ICON_VISIBLE yet (no arrival detected)", () => {
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    const toChar = getCharacter("agent-b")!;

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    handleHandoffEvent(completedEvent("task-1", "agent-b"));

    // Never reached ICON_VISIBLE (no arrival tick ran) — the completed
    // event has nothing to complete yet, so it no-ops rather than
    // fabricating an acceptance.
    expect(toChar.state).not.toBe(CharacterState.TYPE);
  });

  it("transitions the receiving character to TYPE only once handoff_completed arrives for a taskId that has reached ICON_VISIBLE", () => {
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    const fromChar = getCharacter("agent-a")!;
    const toChar = getCharacter("agent-b")!;

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    finishWalk(fromChar);
    checkHandoffArrivals();

    expect(fromChar.bubbleType).toBe("handoff-task");
    expect(toChar.state).not.toBe(CharacterState.TYPE);

    handleHandoffEvent(completedEvent("task-1", "agent-b"));

    expect(toChar.state).toBe(CharacterState.TYPE);
  });

  it("clears the sending character's task-icon bubble and walks it back toward its own desk once completed", () => {
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    const fromChar = getCharacter("agent-a")!;

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    finishWalk(fromChar);
    checkHandoffArrivals();
    handleHandoffEvent(completedEvent("task-1", "agent-b"));

    expect(fromChar.bubbleType).toBeNull();
    expect(fromChar.state).toBe(CharacterState.WALK);
    expect(fromChar.path[fromChar.path.length - 1]).toEqual({ col: fromChar.seatCol, row: fromChar.seatRow });
  });

  it("an agent.handoff_completed with no matching prior agent.handoff_requested for its taskId is a safe no-op — no state change, no throw", () => {
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    const toChar = getCharacter("agent-b")!;
    const priorState = toChar.state;

    expect(() => handleHandoffEvent(completedEvent("no-such-task", "agent-b"))).not.toThrow();
    expect(toChar.state).toBe(priorState);
  });
});

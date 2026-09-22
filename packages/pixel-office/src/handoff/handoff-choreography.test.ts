import { describe, it, expect, beforeEach } from "vitest";
import type { CompanyEvent } from "event-schema";
import { AgentStatus } from "event-schema";
import { upsertCharacterFromAgent, getCharacter, getTileMap, stepOffice, _resetForTests } from "../index";
import { CharacterState } from "../types";
import type { Character } from "../types";
import { findPath } from "../layout/tileMap";
import { handleHandoffEvent, checkHandoffArrivals } from "./handoff-choreography";

function requestedEvent(
  taskId: string,
  fromAgentId: string,
  toAgentId: string,
  id = "3fa85f64-5717-4562-b3fc-2c963f66afa6",
): CompanyEvent {
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

function completedEvent(taskId: string, toAgentId: string, id = "4fa85f64-5717-4562-b3fc-2c963f66afa6"): CompanyEvent {
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

describe("handoff sequence end + re-delivery idempotence (05-13, CR-01)", () => {
  /** Seats a/b, drives requested -> arrival -> completed. Returns both characters. */
  function toReturning(): { fromChar: Character; toChar: Character } {
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    const fromChar = getCharacter("agent-a")!;
    const toChar = getCharacter("agent-b")!;
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    finishWalk(fromChar);
    checkHandoffArrivals();
    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    return { fromChar, toChar };
  }

  it("clears both dialogue lines once the sender is back at its own desk", () => {
    const { fromChar, toChar } = toReturning();
    expect(toChar.bubbleText).toBeTruthy();
    finishWalk(fromChar);
    checkHandoffArrivals();
    expect(toChar.bubbleText).toBeNull();
    expect(fromChar.bubbleText).toBeNull();
  });

  it("leaves the receiver's line alone if it was replaced by a different string before the sequence ended", () => {
    const { fromChar, toChar } = toReturning();
    toChar.bubbleText = "a newer line";
    finishWalk(fromChar);
    checkHandoffArrivals();
    expect(toChar.bubbleText).toBe("a newer line");
  });

  it("never re-drives the walk when the same requested event is re-delivered after the sequence finished", () => {
    const { fromChar, toChar } = toReturning();
    finishWalk(fromChar);
    checkHandoffArrivals();

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    expect(fromChar.path).toEqual([]);
    expect(fromChar.state).not.toBe(CharacterState.WALK);
    checkHandoffArrivals();
    expect(fromChar.bubbleType).not.toBe("handoff-task");

    const before = JSON.stringify([fromChar, toChar]);
    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    expect(JSON.stringify([fromChar, toChar])).toBe(before);
  });

  it("a duplicate requested event mid-sequence does not strand the sender holding the task icon", () => {
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    upsertCharacterFromAgent("agent-b", AgentStatus.IDLE);
    const fromChar = getCharacter("agent-a")!;
    const toChar = getCharacter("agent-b")!;
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    finishWalk(fromChar);
    checkHandoffArrivals();
    expect(fromChar.bubbleType).toBe("handoff-task");

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    handleHandoffEvent(completedEvent("task-1", "agent-b"));

    expect(toChar.state).toBe(CharacterState.TYPE);
    expect(toChar.bubbleText).toContain("accepts");
    expect(fromChar.bubbleType).toBeNull();
    expect(fromChar.state).toBe(CharacterState.WALK);
    expect(fromChar.path[fromChar.path.length - 1]).toEqual({ col: fromChar.seatCol, row: fromChar.seatRow });
  });

  it("a different requested event (new id) for the same task still animates after the first sequence finished", () => {
    const { fromChar } = toReturning();
    finishWalk(fromChar);
    checkHandoffArrivals();

    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b", "7fa85f64-5717-4562-b3fc-2c963f66afa6"));
    expect(fromChar.state).toBe(CharacterState.WALK);
    expect(fromChar.path.length).toBeGreaterThan(0);
  });
});

describe("handoff robustness under interruption (05-17, WR-02): real update loop", () => {
  const NEW_REQUEST_ID = "8fa85f64-5717-4562-b3fc-2c963f66afa6";

  /** Runs the production per-frame update at 60 fps for `seconds`. */
  function run(seconds: number): void {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) stepOffice(1 / 60);
  }

  /** a at col 1, b at col 5 (4-tile walk), c at col 6, all on row 3. */
  function seatAll(): void {
    for (const id of ["agent-a", "filler-1", "filler-2", "filler-3", "agent-b", "agent-c"]) {
      upsertCharacterFromAgent(id, AgentStatus.IDLE);
    }
  }

  function expectHomeIdle(ch: Character): void {
    expect(ch.tileCol).toBe(ch.seatCol);
    expect(ch.tileRow).toBe(ch.seatRow);
    expect(ch.path.length).toBe(0);
    expect(ch.state).toBe(CharacterState.IDLE);
  }

  function onSeatOf(ch: Character, other: Character): boolean {
    return ch.tileCol === other.seatCol && ch.tileRow === other.seatRow;
  }

  function toIconVisible(): { a: Character; b: Character } {
    seatAll();
    const a = getCharacter("agent-a")!;
    const b = getCharacter("agent-b")!;
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    run(3);
    expect(onSeatOf(a, b)).toBe(true);
    expect(a.bubbleType).toBe("handoff-task");
    expect(a.bubbleText).toContain("Handing off");
    return { a, b };
  }

  function toReturningMidWalk(): { a: Character; b: Character } {
    const { a, b } = toIconVisible();
    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    run(0.2);
    expect(a.path.length).toBeGreaterThan(0);
    expect(b.bubbleText).toContain("accepts");
    return { a, b };
  }

  it("a1: a CODING status mid-return does not stop the walk home, and both lines clear", () => {
    const { a, b } = toReturningMidWalk();
    upsertCharacterFromAgent("agent-a", AgentStatus.CODING);
    run(5);
    expectHomeIdle(a);
    expect(b.bubbleText).toBeNull();
    expect(a.bubbleText).toBeNull();
  });

  it("a2: a frozen status mid-walk to the receiver holds frame 0 but the walk still completes", () => {
    seatAll();
    const a = getCharacter("agent-a")!;
    const b = getCharacter("agent-b")!;
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    run(0.2);
    expect(a.path.length).toBe(4);
    upsertCharacterFromAgent("agent-a", AgentStatus.WAITING_FOR_AGENT);
    run(0.5);
    expect(a.frame).toBe(0);
    expect(a.frozen).toBe(true);
    expect(a.path.length).toBeLessThan(4);

    run(3);
    expect(onSeatOf(a, b)).toBe(true);
    expect(a.bubbleText).toContain("Handing off");

    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    expect(b.state).toBe(CharacterState.TYPE);

    run(5);
    expectHomeIdle(a);
    expect(a.bubbleText ?? null).toBeNull();
    expect(b.bubbleText).toBeNull();
  });

  it("a3: frozen while standing at the receiver, then walking home, still gets home", () => {
    const { a, b } = toIconVisible();
    const pathBefore = a.path.length;
    upsertCharacterFromAgent("agent-a", AgentStatus.BLOCKED);
    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    const homePath = a.path.length;
    run(0.5);
    expect(a.frame).toBe(0);
    expect(!onSeatOf(a, b) || a.path.length < homePath).toBe(true);
    expect(pathBefore).toBe(0);

    run(5);
    expectHomeIdle(a);
    expect(a.bubbleText).toBeNull();
    expect(b.bubbleText).toBeNull();
  });
});

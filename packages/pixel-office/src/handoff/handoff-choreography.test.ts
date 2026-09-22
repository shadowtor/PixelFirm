import { describe, it, expect, beforeEach } from "vitest";
import type { CompanyEvent } from "event-schema";
import { AgentStatus } from "event-schema";
import { upsertCharacterFromAgent, getCharacter, getTileMap, stepOffice, _resetForTests } from "../index";
import { CharacterState, Direction } from "../types";
import type { Character } from "../types";
import { findPath } from "../layout/tileMap";
import { FURNITURE_BLOCKED_TILES, SEATS, STANDING_SPOTS } from "../layout/officeLayout";
import { renderScene } from "../engine/renderer";
import { handleHandoffEvent, checkHandoffArrivals, isWaitingHandoffSender } from "./handoff-choreography";

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

  /** a at (1,4), b at (9,4) (8-tile walk), c at (11,4) — layout seats (05-25). */
  function seatAll(): void {
    for (const id of ["agent-a", "filler-1", "filler-2", "filler-3", "agent-b", "agent-c"]) {
      upsertCharacterFromAgent(id, AgentStatus.IDLE);
    }
  }

  function expectHome(ch: Character, pose: CharacterState): void {
    expect(ch.tileCol).toBe(ch.seatCol);
    expect(ch.tileRow).toBe(ch.seatRow);
    expect(ch.path.length).toBe(0);
    expect(ch.state).toBe(pose);
  }

  function expectHomeIdle(ch: Character): void {
    expectHome(ch, CharacterState.IDLE);
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
    // 05-19 (IN-03): the CODING pose that landed mid-return applies when the walk ends.
    expectHome(a, CharacterState.TYPE);
    expect(b.bubbleText).toBeNull();
    expect(a.bubbleText).toBeNull();
  });

  it("a2: a frozen status mid-walk to the receiver holds frame 0 but the walk still completes", () => {
    seatAll();
    const a = getCharacter("agent-a")!;
    const b = getCharacter("agent-b")!;
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    run(0.2);
    expect(a.path.length).toBe(8); // 05-25: layout seats are two columns apart
    upsertCharacterFromAgent("agent-a", AgentStatus.WAITING_FOR_AGENT);
    run(0.5);
    expect(a.frame).toBe(0);
    expect(a.frozen).toBe(true);
    expect(a.path.length).toBeLessThan(8);

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

  it("b: sender OFFLINE mid-return clears the receiver's line at the next tick; a re-seated sender carries no handoff", () => {
    const { b } = toReturningMidWalk();
    upsertCharacterFromAgent("agent-a", AgentStatus.OFFLINE);
    run(0.1);
    expect(b.bubbleText).toBeNull();
    upsertCharacterFromAgent("agent-b", AgentStatus.CODING);
    run(0.1);
    expect(b.bubbleText).toBeNull();

    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    run(1);
    const a = getCharacter("agent-a")!;
    expectHomeIdle(a);
    expect(a.bubbleText ?? null).toBeNull();
    expect(a.bubbleType).not.toBe("handoff-task");
  });

  it("b2: sender OFFLINE mid-walk to the receiver retires the record; a re-seated sender is never shown handing off", () => {
    seatAll();
    const b = getCharacter("agent-b")!;
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    run(0.2);
    upsertCharacterFromAgent("agent-a", AgentStatus.OFFLINE);
    run(0.1);
    upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
    run(1);
    const a = getCharacter("agent-a")!;
    expect(a.bubbleType).not.toBe("handoff-task");
    expect(a.bubbleText ?? null).toBeNull();

    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    expect(b.state).not.toBe(CharacterState.TYPE);
  });

  it("c1: a new request for the same task while RETURNING_TO_DESK retires the old record's accepted line", () => {
    const { a, b } = toReturningMidWalk();
    handleHandoffEvent(requestedEvent("task-1", "agent-c", "agent-b", NEW_REQUEST_ID));
    expect(b.bubbleText).toBeNull();
    run(5);
    expectHomeIdle(a);
  });

  it("c2: a new request from a different sender while ICON_VISIBLE sends the old sender home clean", () => {
    const { a, b } = toIconVisible();
    handleHandoffEvent(requestedEvent("task-1", "agent-c", "agent-b", NEW_REQUEST_ID));
    expect(a.bubbleText).toBeNull();
    expect(a.bubbleType).toBeNull();
    run(5);
    expectHomeIdle(a);
    const c = getCharacter("agent-c")!;
    expect(onSeatOf(c, b)).toBe(true);
    expect(c.bubbleType).toBe("handoff-task");
  });

  it("c3: a new request from the same sender while ICON_VISIBLE keeps it at the receiver, then completes normally", () => {
    const { a, b } = toIconVisible();
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b", NEW_REQUEST_ID));
    run(0.5);
    expect(onSeatOf(a, b)).toBe(true);
    expect(a.bubbleType).toBe("handoff-task");
    expect(a.bubbleText).toContain("Handing off");

    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    run(5);
    expectHomeIdle(a);
    expect(b.bubbleText).toBeNull();
  });

  it("d: a real status glyph set during the handoff survives completion", () => {
    const { a } = toIconVisible();
    upsertCharacterFromAgent("agent-a", AgentStatus.BLOCKED);
    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    run(5);
    expectHomeIdle(a);
    expect(a.bubbleType).toBe("blocked");
  });

  describe("CR-01 stranding paths (05-19): real update loop", () => {
    /** Steps the real loop until the path empties: the one frame where state is still WALK. */
    function stepToArrivalFrame(ch: Character): void {
      for (let i = 0; i < 600 && ch.path.length > 0; i++) stepOffice(1 / 60);
    }

    it("(a) a CODING status in the arrival frame does not strand the sender", () => {
      seatAll();
      const a = getCharacter("agent-a")!;
      const b = getCharacter("agent-b")!;
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      stepToArrivalFrame(a);
      expect(a.path.length).toBe(0);
      expect(a.state).toBe(CharacterState.WALK);

      upsertCharacterFromAgent("agent-a", AgentStatus.CODING);
      run(5);
      expect(onSeatOf(a, b)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain("Handing off");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).toBe(CharacterState.TYPE);

      run(5);
      expectHome(a, CharacterState.TYPE);
      expect(a.bubbleText ?? null).toBeNull();
      expect(b.bubbleText ?? null).toBeNull();
    });

    it("(b) a same-sender re-request while typing at the receiver re-arrives there", () => {
      const { a, b } = toIconVisible();
      upsertCharacterFromAgent("agent-a", AgentStatus.CODING);
      expect(a.state).toBe(CharacterState.TYPE);

      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b", NEW_REQUEST_ID));
      run(0.5);
      expect(onSeatOf(a, b)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain("Handing off");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).toBe(CharacterState.TYPE);

      run(5);
      expectHome(a, CharacterState.TYPE);
      expect(a.bubbleText ?? null).toBeNull();
      expect(b.bubbleText ?? null).toBeNull();
    });

    it("(b2) a same-sender re-request just after leaving the receiver's tile brings it back there", () => {
      const { a, b } = toReturningMidWalk();
      expect(onSeatOf(a, b)).toBe(true);
      expect(a.path.length).toBeGreaterThan(0);

      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b", NEW_REQUEST_ID));
      expect(b.bubbleText ?? null).toBeNull();

      run(3);
      expect(onSeatOf(a, b)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain("Handing off");

      handleHandoffEvent(completedEvent("task-1", "agent-b", "5fa85f64-5717-4562-b3fc-2c963f66afa6"));
      expect(b.bubbleText).toContain("accepts");

      run(5);
      expectHome(a, CharacterState.IDLE);
      expect(a.bubbleText ?? null).toBeNull();
      expect(b.bubbleText ?? null).toBeNull();
    });

    it("(c) a receiver mid-walk on its own handoff keeps walking when its incoming handoff completes", () => {
      for (const id of ["agent-a", "agent-b", "filler-1", "filler-2", "filler-3", "agent-c"]) {
        upsertCharacterFromAgent(id, AgentStatus.IDLE);
      }
      const a = getCharacter("agent-a")!;
      const b = getCharacter("agent-b")!;
      const c = getCharacter("agent-c")!;

      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      run(2);
      expect(a.bubbleType).toBe("handoff-task");

      handleHandoffEvent(requestedEvent("task-2", "agent-b", "agent-c", NEW_REQUEST_ID));
      for (let i = 0; i < 20; i++) stepOffice(1 / 60);
      expect(b.state).toBe(CharacterState.WALK);
      expect(b.path.length).toBeGreaterThan(0);
      const pathBefore = b.path.length;

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      stepOffice(1 / 60);
      expect(b.state).toBe(CharacterState.WALK);

      upsertCharacterFromAgent("agent-b", AgentStatus.CODING);
      run(0.4);
      expect(b.path.length).toBeLessThan(pathBefore);

      run(3);
      expect(onSeatOf(b, c)).toBe(true);
      expect(b.bubbleType).toBe("handoff-task");

      handleHandoffEvent(completedEvent("task-2", "agent-c", "5fa85f64-5717-4562-b3fc-2c963f66afa6"));
      expect(c.state).toBe(CharacterState.TYPE);

      run(5);
      expectHome(a, CharacterState.IDLE);
      expectHome(b, CharacterState.TYPE);
      expect(a.bubbleText ?? null).toBeNull();
      expect(b.bubbleText ?? null).toBeNull();
      expect(c.bubbleText ?? null).toBeNull();
    });
  });

  describe("one sender, one handoff (05-19, WR-01/WR-02/WR-03): real update loop", () => {
    it("WR-01: a second task from the same sender supersedes the first; the first's completion is a no-op", () => {
      const { a, b } = toIconVisible();
      const c = getCharacter("agent-c")!;
      handleHandoffEvent(requestedEvent("task-2", "agent-a", "agent-c", NEW_REQUEST_ID));
      run(1);
      expect(onSeatOf(a, c)).toBe(true);
      expect(a.bubbleText).toContain("task-2");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      run(0.2);
      expect(onSeatOf(a, c)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain("task-2");
      expect(b.state).not.toBe(CharacterState.TYPE);

      handleHandoffEvent(completedEvent("task-2", "agent-c", "5fa85f64-5717-4562-b3fc-2c963f66afa6"));
      expect(c.state).toBe(CharacterState.TYPE);
      run(0.2);
      expect(c.bubbleText).toContain("accepts");

      run(5);
      expectHomeIdle(a);
      expect(a.bubbleText ?? null).toBeNull();
      expect(b.bubbleText ?? null).toBeNull();
      expect(c.bubbleText ?? null).toBeNull();
    });

    it("WR-02: the handoff-task icon survives a glyph-less status; a real glyph shows, then the icon returns", () => {
      const { a } = toIconVisible();
      upsertCharacterFromAgent("agent-a", AgentStatus.CODING);
      expect(a.bubbleType).toBe("handoff-task");
      upsertCharacterFromAgent("agent-a", AgentStatus.BLOCKED);
      expect(a.bubbleType).toBe("blocked");
      upsertCharacterFromAgent("agent-a", AgentStatus.CODING);
      expect(a.bubbleType).toBe("handoff-task");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      run(5);
      expectHome(a, CharacterState.TYPE);
      expect(a.bubbleType).toBeNull();
    });

    it("WR-03: OFFLINE and re-seat in the same frame never inherit the old record's arrival", () => {
      seatAll();
      const b = getCharacter("agent-b")!;
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      run(0.2);
      upsertCharacterFromAgent("agent-a", AgentStatus.OFFLINE);
      upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
      run(1);

      const a = getCharacter("agent-a")!;
      expectHomeIdle(a);
      expect(a.bubbleType).not.toBe("handoff-task");
      expect(a.bubbleText ?? null).toBeNull();

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).not.toBe(CharacterState.TYPE);
    });
  });

  describe("status glyph survives a handoff (05-20, review CR-01): real update loop", () => {
    it.each([
      { status: AgentStatus.TESTING, atReceiver: "handoff-task", pose: CharacterState.TYPE, home: "testing" },
      { status: AgentStatus.BLOCKED, atReceiver: "blocked", pose: CharacterState.IDLE, home: "blocked" },
      { status: AgentStatus.WAITING_FOR_CEO, atReceiver: "permission", pose: CharacterState.IDLE, home: "permission" },
    ])("CR-01: a $status sender comes home with its own glyph", ({ status, atReceiver, pose, home }) => {
      seatAll();
      upsertCharacterFromAgent("agent-a", status);
      const a = getCharacter("agent-a")!;
      const b = getCharacter("agent-b")!;
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      run(3);
      expect(onSeatOf(a, b)).toBe(true);
      expect(a.bubbleType).toBe(atReceiver);
      expect(a.bubbleText).toContain("Handing off");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).toBe(CharacterState.TYPE);

      run(5);
      expectHome(a, pose);
      expect(a.bubbleType).toBe(home);
      expect(a.bubbleText ?? null).toBeNull();
      expect(b.bubbleText ?? null).toBeNull();
    });

    it("CR-01 retire: a TESTING sender superseded at the receiver goes home with its glyph", () => {
      seatAll();
      upsertCharacterFromAgent("agent-a", AgentStatus.TESTING);
      const a = getCharacter("agent-a")!;
      const b = getCharacter("agent-b")!;
      const c = getCharacter("agent-c")!;
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      run(3);
      expect(a.bubbleType).toBe("handoff-task");

      handleHandoffEvent(requestedEvent("task-1", "agent-c", "agent-b", NEW_REQUEST_ID));
      expect(a.bubbleType).toBe("testing");

      run(5);
      expectHome(a, CharacterState.TYPE);
      expect(a.bubbleType).toBe("testing");
      expect(a.bubbleText ?? null).toBeNull();
      expect(onSeatOf(c, b)).toBe(true);
      expect(c.bubbleType).toBe("handoff-task");
    });

    it("CR-01 order: a status that lands while waiting follows the same rule as one set before the walk", () => {
      const { a, b } = toIconVisible();
      upsertCharacterFromAgent("agent-a", AgentStatus.TESTING);
      expect(a.bubbleType).toBe("handoff-task");
      upsertCharacterFromAgent("agent-a", AgentStatus.WAITING_FOR_CEO);
      expect(a.bubbleType).toBe("permission");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).toBe(CharacterState.TYPE);

      run(5);
      expectHome(a, CharacterState.IDLE);
      expect(a.bubbleType).toBe("permission");
      expect(a.bubbleText ?? null).toBeNull();
    });
  });

  describe("sender identity in every phase (05-20, review WR-01): real update loop", () => {
    it("WR-01 tick: a sender that goes OFFLINE while waiting at the receiver retires its record", () => {
      const { a, b } = toIconVisible();
      upsertCharacterFromAgent("agent-a", AgentStatus.OFFLINE);
      run(0.1);
      expect(isWaitingHandoffSender(a)).toBe(false);
      expect(b.bubbleText ?? null).toBeNull();

      upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
      run(1);
      const a2 = getCharacter("agent-a")!;
      expectHomeIdle(a2);
      expect(a2.bubbleType).not.toBe("handoff-task");
      expect(a2.bubbleText ?? null).toBeNull();

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).not.toBe(CharacterState.TYPE);
      expect(b.bubbleText ?? null).toBeNull();
    });

    it("WR-01 same frame: OFFLINE, re-seat and completion with no step between paint no accepted line", () => {
      const { b } = toIconVisible();
      upsertCharacterFromAgent("agent-a", AgentStatus.OFFLINE);
      upsertCharacterFromAgent("agent-a", AgentStatus.IDLE);
      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).not.toBe(CharacterState.TYPE);
      expect(b.bubbleText ?? null).toBeNull();

      run(1);
      const a2 = getCharacter("agent-a")!;
      expectHomeIdle(a2);
      expect(a2.bubbleType).not.toBe("handoff-task");
      expect(a2.bubbleText ?? null).toBeNull();
    });
  });

  describe("interaction tile (05-27, G-05-1d): real update loop", () => {
    const key = (col: number, row: number): string => `${col},${row}`;

    /** Tiles and seats of every present character other than `walker`. */
    function othersTiles(walker: Character): Set<string> {
      const ids = ["agent-a", "filler-1", "filler-2", "filler-3", "agent-b", "agent-c"];
      const out = new Set<string>();
      for (const id of ids) {
        const ch = getCharacter(id);
        if (!ch || ch === walker) continue;
        out.add(key(ch.seatCol, ch.seatRow));
        out.add(key(ch.tileCol, ch.tileRow));
      }
      return out;
    }

    function expectPathClear(walker: Character): void {
      const occupied = othersTiles(walker);
      for (const step of walker.path) {
        expect(FURNITURE_BLOCKED_TILES.has(key(step.col, step.row)), `furniture at ${key(step.col, step.row)}`).toBe(false);
        expect(occupied.has(key(step.col, step.row)), `agent at ${key(step.col, step.row)}`).toBe(false);
      }
    }

    const adjacent = (p: Character, q: Character): boolean =>
      Math.abs(p.tileCol - q.tileCol) + Math.abs(p.tileRow - q.tileRow) === 1;

    it("the sender stops beside the receiver, never on it", () => {
      const { a, b } = toIconVisible();
      expect(adjacent(a, b)).toBe(true);
      expect(onSeatOf(a, b)).toBe(false);
      expect({ col: a.tileCol, row: a.tileRow }).toEqual({ col: 8, row: 4 });
    });

    it("the walk never enters furniture or another agent's tile", () => {
      seatAll();
      const a = getCharacter("agent-a")!;
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      expect(a.path.length).toBeGreaterThan(0);
      expectPathClear(a);
      expect(a.path[a.path.length - 1]).toEqual({ col: 8, row: 4 });
    });

    it("both stay visible", () => {
      const { a, b } = toIconVisible();
      expect(b.x - a.x).toBe(16);
      /** Cells ("x,y" -> colour) of `ch`'s body sprite alone (no bubble, no line). */
      const cells = (chars: Character[]): Map<string, string> => {
        const out = new Map<string, string>();
        const ctx = {
          fillStyle: "",
          font: "",
          textBaseline: "alphabetic",
          fillRect(x: number, y: number) {
            out.set(key(x, y), String(this.fillStyle));
          },
          fillText() {},
          measureText: (t: string) => ({ width: t.length * 6 }),
          drawImage() {},
        } as unknown as CanvasRenderingContext2D;
        renderScene(ctx, chars.map((ch) => ({ ...ch, bubbleType: null, bubbleText: null })), 0, 0, 1);
        return out;
      };
      const both = cells([a, b]);
      for (const ch of [a, b]) {
        const solo = cells([ch]);
        expect(solo.size).toBeGreaterThan(0);
        const survived = [...solo].filter(([k, c]) => both.get(k) === c).length;
        expect(survived, `${ch.id}: ${survived}/${solo.size} px visible`).toBe(solo.size);
      }
    });

    it("the sender faces the receiver on arrival", () => {
      const { a, b } = toIconVisible();
      expect({ col: a.tileCol, row: a.tileRow }).toEqual({ col: 8, row: 4 });
      expect({ col: b.tileCol, row: b.tileRow }).toEqual({ col: 9, row: 4 });
      expect(a.dir).toBe(Direction.RIGHT);
    });

    it("two concurrent senders get two tiles", () => {
      const { a, b } = toIconVisible();
      const c = getCharacter("agent-c")!;
      handleHandoffEvent(requestedEvent("task-2", "agent-c", "agent-b", NEW_REQUEST_ID));
      run(2);
      expect(c.bubbleType).toBe("handoff-task");
      expect({ col: c.tileCol, row: c.tileRow }).toEqual({ col: 10, row: 4 });
      expect(adjacent(c, b)).toBe(true);
      expect({ col: a.tileCol, row: a.tileRow }).toEqual({ col: 8, row: 4 });
      expect(a.bubbleType).toBe("handoff-task");
    });

    it("the walk home avoids agents too", () => {
      const { a } = toIconVisible();
      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(a.path[a.path.length - 1]).toEqual({ col: a.seatCol, row: a.seatRow });
      expectPathClear(a);
      run(5);
      expectHomeIdle(a);
      expect(a.dir).toBe(Direction.DOWN);
    });

    it("search order stays on the seat row", () => {
      seatAll();
      const a = getCharacter("agent-a")!;
      const c = getCharacter("agent-c")!;
      const f2 = getCharacter("filler-2")!;
      expect({ col: f2.seatCol, row: f2.seatRow }).toEqual({ col: 5, row: 4 });
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      handleHandoffEvent(requestedEvent("task-2", "agent-c", "agent-b", NEW_REQUEST_ID));
      handleHandoffEvent(requestedEvent("task-3", "filler-2", "agent-b", "9fa85f64-5717-4562-b3fc-2c963f66afa6"));
      run(6);
      expect({ col: a.tileCol, row: a.tileRow }).toEqual({ col: 8, row: 4 });
      expect({ col: c.tileCol, row: c.tileRow }).toEqual({ col: 10, row: 4 });
      expect({ col: f2.tileCol, row: f2.tileRow }).toEqual({ col: 6, row: 4 });
      for (const ch of [a, c, f2]) expect(ch.bubbleType).toBe("handoff-task");
    });

    it("the interaction tile is always on the receiver's seat row", () => {
      const homes = [...SEATS, ...STANDING_SPOTS];
      expect(homes.length).toBe(20);
      for (let r = 0; r < homes.length; r++) {
        _resetForTests();
        for (let i = 0; i < homes.length; i++) upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
        const receiver = getCharacter(`agent-${r}`)!;
        const s = homes.findIndex((h) => h.row !== receiver.seatRow);
        const sender = getCharacter(`agent-${s}`)!;
        expect(sender.seatRow).not.toBe(receiver.seatRow);
        handleHandoffEvent(requestedEvent(`task-${r}`, sender.id, receiver.id));
        run(12);
        expect(sender.bubbleType, `receiver ${r}`).toBe("handoff-task");
        expect(sender.tileRow, `receiver ${r}`).toBe(receiver.seatRow);
        expect(Math.abs(sender.tileCol - receiver.seatCol), `receiver ${r}`).toBeGreaterThan(0);
      }

      // Receiver mid-walk at request time: the target is still on its seat row.
      _resetForTests();
      seatAll();
      for (let i = 0; i < 10; i++) upsertCharacterFromAgent(`more-${i}`, AgentStatus.IDLE);
      const a = getCharacter("agent-a")!;
      const b = getCharacter("agent-b")!;
      expect(getCharacter("more-5")!.seatRow).toBe(8);
      handleHandoffEvent(requestedEvent("task-x", "agent-b", "more-5", NEW_REQUEST_ID));
      run(0.5);
      expect(b.state).toBe(CharacterState.WALK);
      expect(onSeatOf(b, b)).toBe(false);
      handleHandoffEvent(requestedEvent("task-y", "agent-a", "agent-b"));
      expect(a.path[a.path.length - 1].row).toBe(b.seatRow);
      run(8);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.tileRow).toBe(b.seatRow);
    });
  });
});

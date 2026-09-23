import { describe, it, expect, beforeEach } from "vitest";
import type { CompanyEvent } from "event-schema";
import { AgentStatus } from "event-schema";
import { upsertCharacterFromAgent, getCharacter, getCharacters, getTileMap, stepOffice, _resetForTests } from "../index";
import { CharacterState, Direction } from "../types";
import type { Character } from "../types";
import { findPath } from "../layout/tileMap";
import { FURNITURE, FURNITURE_BLOCKED_TILES, SEATS, STANDING_SPOTS } from "../layout/officeLayout";
import { TileType } from "../types";
import { renderScene } from "../engine/renderer";
import { handleHandoffEvent, checkHandoffArrivals, isWaitingHandoffSender, blockedTilesFor } from "./handoff-choreography";

type TileRef = { col: number; row: number };

// 05-34 (G-05-P2): the new officeLayout export is reached through a dynamic
// import so a RED run fails on assertions rather than crashing at ESM link
// time (05-33/05-10 precedent). `slotsFor` is the only way this file names a
// waiting sender's tile — no test restates the aisle row or the offsets.
const officeLayoutModule = (await import("../layout/officeLayout")) as {
  interactionSlotsFor?: (home: TileRef) => ReadonlyArray<TileRef>;
};
const slotsFor = (home: TileRef): ReadonlyArray<TileRef> => officeLayoutModule.interactionSlotsFor?.(home) ?? [];
/** The fixed slots of a character's HOME — where a sender handing off to it waits. */
const slotsOfHome = (ch: Character): ReadonlyArray<TileRef> => slotsFor({ col: ch.seatCol, row: ch.seatRow });

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

describe("interaction slots (05-34, G-05-P2): layout data alone", () => {
  it("every home has a slot, and every slot the layout can produce is clear floor two tiles from every home", () => {
    expect(typeof officeLayoutModule.interactionSlotsFor, "officeLayout must export interactionSlotsFor (05-34)").toBe(
      "function",
    );
    const homes = [...SEATS, ...STANDING_SPOTS];
    expect(homes.length).toBe(20);
    const tileMap = getTileMap();
    for (const home of homes) {
      const slots = slotsFor(home);
      expect(slots.length, `home (${home.col},${home.row}) has no interaction slot`).toBeGreaterThan(0);
      for (const s of slots) {
        const where = `slot (${s.col},${s.row}) of home (${home.col},${home.row})`;
        expect(tileMap[s.row]?.[s.col], `${where} is not a floor tile`).toBe(TileType.FLOOR_1);
        expect(FURNITURE_BLOCKED_TILES.has(`${s.col},${s.row}`), `${where} is furniture`).toBe(false);
        expect(
          homes.some((h) => h.col === s.col && h.row === s.row),
          `${where} is itself a home (review WR-05)`,
        ).toBe(false);
        // The whole point of the aisle row: no slot can ever be
        // shoulder-to-shoulder with a seated or standing agent.
        for (const h of homes) {
          const chebyshev = Math.max(Math.abs(h.col - s.col), Math.abs(h.row - s.row));
          expect(chebyshev, `${where} is only ${chebyshev} tile(s) from home (${h.col},${h.row})`).toBeGreaterThanOrEqual(
            2,
          );
        }
      }
    }
  });
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

    // 05-34: the target is the receiver's FIRST fixed aisle slot (b at (3,4),
    // so its home's first offset), pathed with the same occupancy-aware set.
    const target = slotsOfHome(toChar)[0]!;
    expect(target, "the receiver's home has no interaction slot").toBeDefined();
    const realPath = findPath(fromChar.tileCol, fromChar.tileRow, target.col, target.row, getTileMap(), blockedTilesFor(fromChar, target));
    expect(fromChar.path).toEqual(realPath);
    expect(fromChar.path[0]).toBeDefined();
    expect(fromChar.path[fromChar.path.length - 1]).toEqual(target);
    expect(target.row).not.toBe(toChar.seatRow);
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

  /** 05-34 (G-05-P2, superseding 05-27's seat-row rule): the waiting sender
   *  stands on one of the receiver HOME's fixed aisle slots — never on the
   *  receiver, never beside a seat. */
  function atInteractionSlot(ch: Character, other: Character): boolean {
    return slotsOfHome(other).some((s) => s.col === ch.tileCol && s.row === ch.tileRow);
  }

  /** Walks to an aisle slot cross the office (up to ~15 tiles plus a lane
   *  detour), so every handoff leg here is timed generously rather than pinned
   *  to one layout's step count. */
  const WALK_SECONDS = 10;

  function toIconVisible(): { a: Character; b: Character } {
    seatAll();
    const a = getCharacter("agent-a")!;
    const b = getCharacter("agent-b")!;
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
    run(WALK_SECONDS);
    expect(atInteractionSlot(a, b)).toBe(true);
    expect(a.bubbleType).toBe("handoff-task");
    expect(a.bubbleText).toContain(" → ");
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
    run(WALK_SECONDS);
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
    // 05-34: measured from the walk itself, not pinned to one layout's step
    // count — the aisle slot is further away than 05-27's seat-row tile.
    const steps = a.path.length;
    expect(steps).toBeGreaterThan(0);
    upsertCharacterFromAgent("agent-a", AgentStatus.WAITING_FOR_AGENT);
    run(0.5);
    expect(a.frame).toBe(0);
    expect(a.frozen).toBe(true);
    expect(a.path.length).toBeLessThan(steps);

    run(WALK_SECONDS);
    expect(atInteractionSlot(a, b)).toBe(true);
    expect(a.bubbleText).toContain(" → ");

    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    expect(b.state).toBe(CharacterState.TYPE);

    run(WALK_SECONDS);
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
    expect(!atInteractionSlot(a, b) || a.path.length < homePath).toBe(true);
    expect(pathBefore).toBe(0);

    run(WALK_SECONDS);
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
    run(WALK_SECONDS);
    expectHomeIdle(a);
  });

  it("c2: a new request from a different sender while ICON_VISIBLE sends the old sender home clean", () => {
    const { a, b } = toIconVisible();
    handleHandoffEvent(requestedEvent("task-1", "agent-c", "agent-b", NEW_REQUEST_ID));
    expect(a.bubbleText).toBeNull();
    expect(a.bubbleType).toBeNull();
    run(WALK_SECONDS);
    expectHomeIdle(a);
    const c = getCharacter("agent-c")!;
    expect(atInteractionSlot(c, b)).toBe(true);
    expect(c.bubbleType).toBe("handoff-task");
  });

  it("c3: a new request from the same sender while ICON_VISIBLE keeps it at the receiver, then completes normally", () => {
    const { a, b } = toIconVisible();
    handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b", NEW_REQUEST_ID));
    run(0.5);
    expect(atInteractionSlot(a, b)).toBe(true);
    expect(a.bubbleType).toBe("handoff-task");
    expect(a.bubbleText).toContain(" → ");

    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    run(WALK_SECONDS);
    expectHomeIdle(a);
    expect(b.bubbleText).toBeNull();
  });

  it("d: a real status glyph set during the handoff survives completion", () => {
    const { a } = toIconVisible();
    upsertCharacterFromAgent("agent-a", AgentStatus.BLOCKED);
    handleHandoffEvent(completedEvent("task-1", "agent-b"));
    run(WALK_SECONDS);
    expectHomeIdle(a);
    expect(a.bubbleType).toBe("blocked");
  });

  describe("CR-01 stranding paths (05-19): real update loop", () => {
    /** Steps the real loop until the path empties: the one frame where state is still WALK. */
    function stepToArrivalFrame(ch: Character): void {
      for (let i = 0; i < 1800 && ch.path.length > 0; i++) stepOffice(1 / 60);
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
      run(WALK_SECONDS);
      expect(atInteractionSlot(a, b)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain(" → ");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).toBe(CharacterState.TYPE);

      run(WALK_SECONDS);
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
      expect(atInteractionSlot(a, b)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain(" → ");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).toBe(CharacterState.TYPE);

      run(WALK_SECONDS);
      expectHome(a, CharacterState.TYPE);
      expect(a.bubbleText ?? null).toBeNull();
      expect(b.bubbleText ?? null).toBeNull();
    });

    it("(b2) a same-sender re-request just after leaving the receiver's tile brings it back there", () => {
      const { a, b } = toReturningMidWalk();
      expect(atInteractionSlot(a, b)).toBe(true);
      expect(a.path.length).toBeGreaterThan(0);

      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b", NEW_REQUEST_ID));
      expect(b.bubbleText ?? null).toBeNull();

      run(WALK_SECONDS);
      expect(atInteractionSlot(a, b)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain(" → ");

      handleHandoffEvent(completedEvent("task-1", "agent-b", "5fa85f64-5717-4562-b3fc-2c963f66afa6"));
      expect(b.bubbleText).toContain("accepts");

      run(WALK_SECONDS);
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
      run(WALK_SECONDS);
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

      run(WALK_SECONDS);
      expect(atInteractionSlot(b, c)).toBe(true);
      expect(b.bubbleType).toBe("handoff-task");

      handleHandoffEvent(completedEvent("task-2", "agent-c", "5fa85f64-5717-4562-b3fc-2c963f66afa6"));
      expect(c.state).toBe(CharacterState.TYPE);

      run(WALK_SECONDS);
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
      run(WALK_SECONDS);
      expect(atInteractionSlot(a, c)).toBe(true);
      expect(a.bubbleText).toContain("task-2");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      run(0.2);
      expect(atInteractionSlot(a, c)).toBe(true);
      expect(a.bubbleType).toBe("handoff-task");
      expect(a.bubbleText).toContain("task-2");
      expect(b.state).not.toBe(CharacterState.TYPE);

      handleHandoffEvent(completedEvent("task-2", "agent-c", "5fa85f64-5717-4562-b3fc-2c963f66afa6"));
      expect(c.state).toBe(CharacterState.TYPE);
      run(0.2);
      expect(c.bubbleText).toContain("accepts");

      run(WALK_SECONDS);
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
      run(WALK_SECONDS);
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
      run(WALK_SECONDS);
      expect(atInteractionSlot(a, b)).toBe(true);
      expect(a.bubbleType).toBe(atReceiver);
      expect(a.bubbleText).toContain(" → ");

      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(b.state).toBe(CharacterState.TYPE);

      run(WALK_SECONDS);
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
      run(WALK_SECONDS);
      expect(a.bubbleType).toBe("handoff-task");

      handleHandoffEvent(requestedEvent("task-1", "agent-c", "agent-b", NEW_REQUEST_ID));
      expect(a.bubbleType).toBe("testing");

      run(WALK_SECONDS);
      expectHome(a, CharacterState.TYPE);
      expect(a.bubbleType).toBe("testing");
      expect(a.bubbleText ?? null).toBeNull();
      expect(atInteractionSlot(c, b)).toBe(true);
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

      run(WALK_SECONDS);
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

  describe("interaction tile (05-27, G-05-1d; fixed slots 05-34, G-05-P2): real update loop", () => {
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

    /** 05-34's tracer pin: the first (preferred) slot of the receiver HOME's fixed list. */
    const firstSlotOf = (receiver: Character): TileRef => {
      const slot = slotsOfHome(receiver)[0];
      expect(slot, `${receiver.id}'s home has no interaction slot`).toBeDefined();
      return slot!;
    };

    it("the sender stops on the receiver's first fixed slot, never on the receiver", () => {
      const { a, b } = toIconVisible();
      expect(onSeatOf(a, b)).toBe(false);
      expect({ col: a.tileCol, row: a.tileRow }).toEqual(firstSlotOf(b));
      // The pin the gap is about: b's home is (9,4), so the slot is the aisle
      // tile at +1 col, two rows clear of every seat.
      expect({ col: a.tileCol, row: a.tileRow }).toEqual({ col: 10, row: 6 });
    });

    it("a row-8 receiver is faced DOWN from the aisle, a row-4 receiver UP", () => {
      for (let i = 0; i < 12; i++) upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
      const sender = getCharacter("agent-0")!;
      const receiver = getCharacter("agent-9")!;
      expect(receiver.seatRow).toBe(8);
      expect(sender.seatRow).toBe(4);
      handleHandoffEvent(requestedEvent("task-1", sender.id, receiver.id));
      run(WALK_SECONDS);
      expect(sender.bubbleType).toBe("handoff-task");
      expect({ col: sender.tileCol, row: sender.tileRow }).toEqual(firstSlotOf(receiver));
      expect(sender.dir).toBe(Direction.DOWN);
    });

    it("the walk never enters furniture or another agent's tile", () => {
      seatAll();
      const a = getCharacter("agent-a")!;
      const b = getCharacter("agent-b")!;
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      expect(a.path.length).toBeGreaterThan(0);
      expectPathClear(a);
      expect(a.path[a.path.length - 1]).toEqual(firstSlotOf(b));
    });

    it("both stay visible", () => {
      const { a, b } = toIconVisible();
      /** Cells ("x,y" -> colour) of `ch`'s body sprite alone (no bubble, no line). */
      const cells = (chars: Character[]): Map<string, string> => {
        const out = new Map<string, string>();
        const ctx = {
          fillStyle: "",
          font: "",
          textBaseline: "alphabetic",
          fillRect(this: { fillStyle: string }, x: number, y: number) {
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

    it("the sender faces the receiver on arrival, on the dominant axis", () => {
      const { a, b } = toIconVisible();
      expect({ col: a.tileCol, row: a.tileRow }).toEqual({ col: 10, row: 6 });
      expect({ col: b.tileCol, row: b.tileRow }).toEqual({ col: 9, row: 4 });
      // |dr| (2) beats |dc| (1): the sender looks UP across the receiver's desk.
      expect(a.dir).toBe(Direction.UP);
    });

    it("the second concurrent sender gets the next fixed slot", () => {
      const { a, b } = toIconVisible();
      const c = getCharacter("agent-c")!;
      handleHandoffEvent(requestedEvent("task-2", "agent-c", "agent-b", NEW_REQUEST_ID));
      run(WALK_SECONDS);
      expect(c.bubbleType).toBe("handoff-task");
      const slots = slotsOfHome(b);
      expect({ col: a.tileCol, row: a.tileRow }).toEqual(slots[0]);
      expect({ col: c.tileCol, row: c.tileRow }).toEqual(slots[1]);
      expect({ col: c.tileCol, row: c.tileRow }).toEqual({ col: 8, row: 6 });
      // Two slots apart: never shoulder-to-shoulder with each other either.
      expect(Math.max(Math.abs(a.tileCol - c.tileCol), Math.abs(a.tileRow - c.tileRow))).toBeGreaterThan(1);
      expect(a.bubbleType).toBe("handoff-task");
    });

    it("the walk home avoids agents too", () => {
      const { a } = toIconVisible();
      handleHandoffEvent(completedEvent("task-1", "agent-b"));
      expect(a.path[a.path.length - 1]).toEqual({ col: a.seatCol, row: a.seatRow });
      expectPathClear(a);
      run(WALK_SECONDS);
      expectHomeIdle(a);
      expect(a.dir).toBe(Direction.DOWN);
    });

    it("three senders take the fixed preference order", () => {
      seatAll();
      const a = getCharacter("agent-a")!;
      const b = getCharacter("agent-b")!;
      const c = getCharacter("agent-c")!;
      const f2 = getCharacter("filler-2")!;
      expect({ col: f2.seatCol, row: f2.seatRow }).toEqual({ col: 5, row: 4 });
      handleHandoffEvent(requestedEvent("task-1", "agent-a", "agent-b"));
      handleHandoffEvent(requestedEvent("task-2", "agent-c", "agent-b", NEW_REQUEST_ID));
      handleHandoffEvent(requestedEvent("task-3", "filler-2", "agent-b", "9fa85f64-5717-4562-b3fc-2c963f66afa6"));
      run(WALK_SECONDS);
      const slots = slotsOfHome(b);
      expect({ col: a.tileCol, row: a.tileRow }).toEqual(slots[0]);
      expect({ col: c.tileCol, row: c.tileRow }).toEqual(slots[1]);
      expect({ col: f2.tileCol, row: f2.tileRow }).toEqual(slots[2]);
      expect([
        { col: a.tileCol, row: a.tileRow },
        { col: c.tileCol, row: c.tileRow },
        { col: f2.tileCol, row: f2.tileRow },
      ]).toEqual([
        { col: 10, row: 6 },
        { col: 8, row: 6 },
        { col: 12, row: 6 },
      ]);
      for (const ch of [a, c, f2]) expect(ch.bubbleType).toBe("handoff-task");
    });

    it("the interaction tile is always a fixed slot of the receiver's home", () => {
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
        run(WALK_SECONDS + 6);
        expect(sender.bubbleType, `receiver ${r}`).toBe("handoff-task");
        expect(atInteractionSlot(sender, receiver), `receiver ${r}: sender at (${sender.tileCol},${sender.tileRow})`).toBe(
          true,
        );
      }

      // Receiver mid-walk at request time: the target is still a slot of its HOME.
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
      const last = a.path[a.path.length - 1]!;
      expect(slotsOfHome(b).some((s) => s.col === last.col && s.row === last.row)).toBe(true);
      run(WALK_SECONDS + 4);
      expect(a.bubbleType).toBe("handoff-task");
      expect(atInteractionSlot(a, b)).toBe(true);
    });

    // ── 05-34 (G-05-P2) missing item 3: prove it for EVERY receiver position
    // in a full 20-agent office, not just for agent-b. Both sweeps go red on a
    // seat-row search (see the SUMMARY's recorded RED evidence).
    describe("spacing over every receiver position (05-34, G-05-P2)", () => {
      const homes = [...SEATS, ...STANDING_SPOTS];
      /** Minimum clear air between the waiting sender's visible ink and a
       *  neighbour's, on at least one axis. The shoulder-to-shoulder seat-row
       *  layout this supersedes measured 2 px. */
      const MIN_INK_GAP_PX = 3;
      type Box = { minX: number; minY: number; maxX: number; maxY: number };

      /** Seats one agent per home, then drives a handoff from the other pod row
       *  into `homes[r]` until the sender is waiting. Returns both characters. */
      function senderWaitingAt(r: number): { sender: Character; receiver: Character } {
        _resetForTests();
        for (let i = 0; i < homes.length; i++) upsertCharacterFromAgent(`agent-${i}`, AgentStatus.IDLE);
        const receiver = getCharacter(`agent-${r}`)!;
        const sender = getCharacter(`agent-${homes.findIndex((h) => h.row !== receiver.seatRow)}`)!;
        expect(sender.seatRow, `receiver ${r}`).not.toBe(receiver.seatRow);
        handleHandoffEvent(requestedEvent(`task-${r}`, sender.id, receiver.id));
        run(WALK_SECONDS + 6);
        expect(sender.bubbleType, `receiver ${r}: the sender never reached its slot`).toBe("handoff-task");
        return { sender, receiver };
      }

      /** Cells ("x,y" -> colour) painted by `chars` over the real FURNITURE,
       *  with bubbles and lines off (05-27's "both stay visible" replay). */
      function cells(chars: Character[]): Map<string, string> {
        const out = new Map<string, string>();
        const ctx = {
          fillStyle: "",
          font: "",
          textBaseline: "alphabetic",
          fillRect(this: { fillStyle: string }, x: number, y: number) {
            out.set(key(x, y), String(this.fillStyle));
          },
          fillText() {},
          measureText: (t: string) => ({ width: t.length * 6 }),
          drawImage() {},
        } as unknown as CanvasRenderingContext2D;
        renderScene(
          ctx,
          chars.map((ch) => ({ ...ch, bubbleType: null, bubbleText: null })),
          0,
          0,
          1,
          FURNITURE,
        );
        return out;
      }

      /** Bounding box of the ink of `ch` a viewer actually SEES: its own solo
       *  cells that survive the full composite, minus anything the furniture
       *  pass already owned — so a seated agent's desk-hidden lower body is not
       *  counted as visible ink. */
      function visibleInk(
        ch: Character,
        composite: Map<string, string>,
        furnitureOnly: Map<string, string>,
      ): Box | null {
        let box: Box | null = null;
        for (const [k, colour] of cells([ch])) {
          if (composite.get(k) !== colour || furnitureOnly.get(k) === colour) continue;
          const [x, y] = k.split(",").map(Number) as [number, number];
          box = box
            ? {
                minX: Math.min(box.minX, x),
                minY: Math.min(box.minY, y),
                maxX: Math.max(box.maxX, x),
                maxY: Math.max(box.maxY, y),
              }
            : { minX: x, minY: y, maxX: x, maxY: y };
        }
        return box;
      }

      it("never shoulder-to-shoulder: no other character's seat or resting tile touches the waiting sender", () => {
        for (let r = 0; r < homes.length; r++) {
          const { sender } = senderWaitingAt(r);
          const at = `(${sender.tileCol},${sender.tileRow})`;
          for (const other of [...getCharacters()]) {
            if (other === sender) continue;
            const tiles = [{ col: other.seatCol, row: other.seatRow }];
            if (other.state !== CharacterState.WALK) tiles.push({ col: other.tileCol, row: other.tileRow });
            for (const t of tiles) {
              const chebyshev = Math.max(Math.abs(t.col - sender.tileCol), Math.abs(t.row - sender.tileRow));
              expect(
                chebyshev,
                `receiver ${r}: ${other.id} at (${t.col},${t.row}) is ${chebyshev} tile(s) from the sender at ${at}`,
              ).toBeGreaterThan(1);
            }
          }
        }
      });

      it("clear ink separation: the sender's visible ink stays clear of every character within 2 tiles", () => {
        const furnitureOnly = cells([]);
        let pairs = 0;
        let tightest = Number.POSITIVE_INFINITY;
        for (let r = 0; r < homes.length; r++) {
          const { sender } = senderWaitingAt(r);
          const all = [...getCharacters()];
          const composite = cells(all);
          const senderBox = visibleInk(sender, composite, furnitureOnly);
          expect(senderBox, `receiver ${r}: the waiting sender paints no visible ink at all`).not.toBeNull();
          for (const other of all) {
            if (other === sender) continue;
            const tileGap = Math.max(Math.abs(other.tileCol - sender.tileCol), Math.abs(other.tileRow - sender.tileRow));
            if (tileGap > 2) continue;
            const otherBox = visibleInk(other, composite, furnitureOnly);
            if (!otherBox) continue;
            pairs++;
            const gapX = Math.max(0, otherBox.minX - senderBox!.maxX - 1, senderBox!.minX - otherBox.maxX - 1);
            const gapY = Math.max(0, otherBox.minY - senderBox!.maxY - 1, senderBox!.minY - otherBox.maxY - 1);
            const gap = Math.max(gapX, gapY);
            tightest = Math.min(tightest, gap);
            expect(
              gap,
              `receiver ${r}: sender (${sender.tileCol},${sender.tileRow}) ink ${JSON.stringify(senderBox)} vs ` +
                `${other.id} (${other.tileCol},${other.tileRow}) ink ${JSON.stringify(otherBox)} — ` +
                `${gapX} px across, ${gapY} px apart`,
            ).toBeGreaterThanOrEqual(MIN_INK_GAP_PX);
          }
        }
        // Non-vacuity: a sweep that never found a neighbour would prove nothing.
        expect(pairs, "no character was within 2 tiles of the sender in any scene").toBeGreaterThan(0);
        expect(tightest).toBeGreaterThanOrEqual(MIN_INK_GAP_PX);
      });
    });
  });
});

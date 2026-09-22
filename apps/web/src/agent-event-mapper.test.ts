import { beforeEach, describe, expect, it } from "vitest";
// Vite's ?raw is the filesystem read available here without adding
// @types/node to a browser package (apps/web has no node typings).
import appSource from "./App.tsx?raw";
import { AgentStatus, type CompanyEvent } from "event-schema";
import { emptyState, fold } from "company-core";
import {
  _resetForTests,
  getCharacter,
  handleHandoffEvent,
  registerTaskTitle,
  upsertCharacterFromAgent,
} from "pixel-office";
// Namespace import on purpose (05-10 precedent): a named import of a
// not-yet-existing export is an ESM link failure, which classifies as
// INVALID_RED rather than a genuine assertion failure in the target test.
import * as mapper from "./agent-event-mapper";

const BASE = {
  version: 1,
  occurredAt: "2026-09-21T00:00:00.000Z",
  companyId: "company-1",
  visibility: "INTERNAL" as const,
};

let eventSeq = 0;
function nextId(): string {
  eventSeq += 1;
  return `00000000-0000-4000-8000-${String(eventSeq).padStart(12, "0")}`;
}

type TaskStatus = "starting" | "running" | "paused" | "blocked" | "waiting_for_review" | "waiting_for_handoff" | "completed" | "failed" | "cancelled";

function taskStatusChanged(agentId: string | undefined, taskId: string, status: TaskStatus): CompanyEvent {
  return {
    ...BASE,
    id: nextId(),
    type: "task.status_changed",
    taskId,
    ...(agentId ? { sourceAgentId: agentId } : {}),
    payload: { taskId, status },
  } as CompanyEvent;
}

function taskCreated(taskId: string, title: string): CompanyEvent {
  return {
    ...BASE,
    id: nextId(),
    type: "task.created",
    taskId,
    payload: { title },
  } as CompanyEvent;
}

function handoffRequested(taskId: string, fromAgentId: string, toAgentId: string): CompanyEvent {
  return {
    ...BASE,
    id: nextId(),
    type: "agent.handoff_requested",
    taskId,
    sourceAgentId: fromAgentId,
    payload: { taskId, fromAgentId, toAgentId },
  } as CompanyEvent;
}

function gsdPhaseObserved(category: string): CompanyEvent {
  return {
    ...BASE,
    id: nextId(),
    type: "gsd.phase_observed",
    payload: { phase: "05", status: "executing", category, role: "Engineering", active: true },
  } as CompanyEvent;
}

describe("applyLiveEvent", () => {
  beforeEach(() => {
    _resetForTests();
  });

  // Test 1 (CR-01): a relayed status event produces an upsert for its own agent.
  it("turns a relayed task.status_changed into exactly one upsert for the owning agent", () => {
    const { upserts } = mapper.applyLiveEvent(emptyState(), taskStatusChanged("agent-a", "task-1", "blocked"));

    expect(upserts).toEqual([{ agentId: "agent-a", status: AgentStatus.BLOCKED }]);
  });

  // Test 2 (spans two packages): the upsert produces a real frozen, bubbled
  // Character in pixel-office — not merely a status string.
  it("produces a frozen, blocked-bubbled Character when its upsert is applied to pixel-office", () => {
    const { upserts } = mapper.applyLiveEvent(emptyState(), taskStatusChanged("agent-a", "task-1", "blocked"));
    for (const u of upserts) upsertCharacterFromAgent(u.agentId, u.status, u.name);

    const ch = getCharacter("agent-a");
    expect(ch).toBeDefined();
    expect(ch?.frozen).toBe(true);
    expect(ch?.bubbleType).toBe("blocked");
  });

  // Test 3 (anti-drift): the live path IS the fold path. Threading events one
  // at a time through applyLiveEvent must land on the same agent projections
  // company-core's own fold() produces for the same array.
  it("cannot drift from company-core's fold path over the same event stream", () => {
    const events = [
      taskCreated("task-1", "Close CR-01"),
      taskStatusChanged("agent-a", "task-1", "running"),
      gsdPhaseObserved("research"),
      taskStatusChanged("agent-b", "task-2", "blocked"),
      taskStatusChanged("agent-a", "task-1", "waiting_for_review"),
    ];

    let live = emptyState();
    for (const event of events) {
      live = mapper.applyLiveEvent(live, event).state;
    }

    expect(live.agents).toEqual(fold(events).agents);
  });

  // Test 4: the case a stateless event->status mapper provably cannot reach —
  // gsdCategory lives in ProjectionState, never on the event.
  it("resolves RESEARCHING from a gsd.phase_observed arriving after a running task, which no stateless mapper could", () => {
    const afterRunning = mapper.applyLiveEvent(emptyState(), taskStatusChanged("agent-a", "task-1", "running")).state;

    const { upserts } = mapper.applyLiveEvent(afterRunning, gsdPhaseObserved("research"));

    expect(upserts).toEqual([{ agentId: "agent-a", status: AgentStatus.RESEARCHING }]);
  });

  // Test 5: an event that touches no agent upserts nothing and leaves every
  // agent entry reference-identical (the diff signal must stay sound).
  it("emits no upserts for an event that touches no agent", () => {
    const seeded = mapper.applyLiveEvent(emptyState(), taskStatusChanged("agent-a", "task-1", "running")).state;

    const { state, upserts } = mapper.applyLiveEvent(seeded, taskCreated("task-9", "Unrelated"));

    expect(upserts).toEqual([]);
    for (const agentId of Object.keys(seeded.agents)) {
      expect(state.agents[agentId]).toBe(seeded.agents[agentId]);
    }
  });

  // Test 6 (preserves WR-02's guard intent): sourceAgentId is optional on
  // BaseEnvelope — an identity-less event must never create an
  // "undefined"-keyed agent.
  it("never creates an undefined-keyed agent from a task.status_changed with no sourceAgentId", () => {
    const { state, upserts } = mapper.applyLiveEvent(emptyState(), taskStatusChanged(undefined, "task-1", "blocked"));

    expect(upserts).toEqual([]);
    expect(Object.keys(state.agents)).toEqual([]);
  });
});

// HANDOFF-01 (CR-01): before 05-09 nothing on the live path created a
// Character, so handoff-choreography.ts's `if (!fromChar || !toChar) return;`
// guard could never be satisfied in production — the choreography was
// unreachable without a page reload. These tests drive the whole sequence
// through the real modules, never hand-built Character objects.
describe("live handoff path", () => {
  const SENDER = "agent-sender";
  const RECEIVER = "agent-receiver";
  const TASK = "task-handoff-1";

  beforeEach(() => {
    _resetForTests();
  });

  /** Fold one event into the live projection and apply the Characters it changed. */
  function thread(state: ReturnType<typeof emptyState>, event: CompanyEvent) {
    const { state: next, upserts } = mapper.applyLiveEvent(state, event);
    for (const u of upserts) upsertCharacterFromAgent(u.agentId, u.status, u.name);
    return next;
  }

  function liveUpToHandoff(): { state: ReturnType<typeof emptyState>; handoff: CompanyEvent } {
    let state = emptyState();
    state = thread(state, taskStatusChanged(SENDER, TASK, "running"));
    // Matches how App.tsx feeds titles (snapshot + task.created) so the FSM's
    // dialogue interpolates a real TaskState.title, not the raw taskId.
    registerTaskTitle(TASK, "Close CR-01");
    return { state, handoff: handoffRequested(TASK, SENDER, RECEIVER) };
  }

  it("creates both handoff participants from live events alone — no snapshot, no reload", () => {
    const { state, handoff } = liveUpToHandoff();

    thread(state, handoff);

    expect(getCharacter(SENDER)).toBeDefined();
    expect(getCharacter(RECEIVER)).toBeDefined();
  });

  it("walks the sender to the receiver's desk when the choreography runs after the upserts", () => {
    const { state, handoff } = liveUpToHandoff();
    thread(state, handoff);

    handleHandoffEvent(handoff);

    const sender = getCharacter(SENDER);
    const receiver = getCharacter(RECEIVER);
    // "walk" is CharacterState.WALK (packages/pixel-office/src/types.ts) —
    // that const object is not part of this package's public surface.
    expect(sender?.state).toBe("walk");
    expect(sender?.path.length).toBeGreaterThan(0);
    // 05-27 (G-05-1d): the sender stops beside the receiver on its seat row, never on it.
    const end = sender!.path.at(-1)!;
    expect(end.row).toBe(receiver?.seatRow);
    expect(Math.abs(end.col - receiver!.seatCol)).toBe(1);
  });

  it("leaves the sender standing still when the choreography runs before the upserts — the ordering in App.tsx is load-bearing", () => {
    const { state, handoff } = liveUpToHandoff();
    const senderBefore = getCharacter(SENDER);
    expect(senderBefore).toBeDefined();
    const stateBefore = senderBefore?.state;

    // Deliberately inverted: choreography first, projection upserts second.
    handleHandoffEvent(handoff);

    const sender = getCharacter(SENDER);
    expect(sender?.path.length).toBe(0);
    expect(sender?.state).toBe(stateBefore);

    // ...and the receiver only ever exists once the upserts are applied.
    expect(getCharacter(RECEIVER)).toBeUndefined();
    thread(state, handoff);
    expect(getCharacter(RECEIVER)).toBeDefined();
  });

  // The test above proves the guard fires when the order is wrong; this one
  // pins the order itself. App.tsx's onEvent closure is not exported and its
  // effect never runs under a static render, so the source order is the only
  // observable form this invariant has.
  it("keeps App.tsx's handleHandoffEvent call below its upsert loop", () => {
    const upsertLine = appSource.indexOf("upsertCharacterFromAgent(upsert.agentId");
    const handoffLine = appSource.indexOf("handleHandoffEvent(event)");

    expect(upsertLine).toBeGreaterThan(-1);
    expect(handoffLine).toBeGreaterThan(-1);
    expect(upsertLine).toBeLessThan(handoffLine);
  });
});

import { describe, it, expect } from "vitest";
import type { CompanyEvent } from "event-schema";
import {
  applyDecisionEvent,
  decisionHistory,
  emptyDecisions,
  foldDecisions,
  isResumable,
  pendingQueue,
} from "./decisions.js";

let seq = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const at = (minute: number) => new Date(Date.UTC(2026, 8, 24, 0, minute)).toISOString();

function envelope(type: string, occurredAt: string, payload: object, extra: object = {}): CompanyEvent {
  seq += 1;
  return {
    id: uuid(900_000 + seq),
    version: 1,
    occurredAt,
    companyId: "company-1",
    visibility: "PRIVATE",
    type,
    payload,
    ...extra,
  } as CompanyEvent;
}

function request(decisionId: string, minute: number, opts: { threadId?: string; taskId?: string } = {}): CompanyEvent {
  return envelope(
    "ceo.approval_requested",
    at(minute),
    {
      taskId: opts.taskId ?? "task-1",
      reason: "gated",
      decisionId,
      threadId: opts.threadId ?? decisionId,
      kind: "ceo_gated_tool",
      title: `title ${decisionId}`,
    },
    { sourceAgentId: "agent-1" },
  );
}

const made = (decisionId: string, minute: number, action = "approve", taskId = "task-1"): CompanyEvent =>
  envelope("ceo.decision_made", at(minute), { decisionId, taskId, action, note: "n", decidedBy: "ceo@example.com" });
const applied = (decisionId: string, minute: number, taskId = "task-1"): CompanyEvent =>
  envelope("ceo.decision_applied", at(minute), { decisionId, taskId, action: "approve", outcome: "allowed" });
const expired = (decisionId: string, minute: number, taskId = "task-1"): CompanyEvent =>
  envelope("ceo.approval_expired", at(minute), { decisionId, taskId, reason: "worker_restarted" });
const resume = (minute: number, taskId = "task-1"): CompanyEvent =>
  envelope("ceo.task_resume_requested", at(minute), { taskId, decidedBy: "ceo@example.com" });

const A = uuid(1);
const B = uuid(2);
const C = uuid(3);

describe("foldDecisions — empty edge (CEO-02)", () => {
  it("foldDecisions([]) equals emptyDecisions() with no pending and no history", () => {
    const state = foldDecisions([]);
    expect(state).toEqual(emptyDecisions());
    expect(pendingQueue(state)).toEqual([]);
    expect(decisionHistory(state)).toEqual([]);
  });

  it("a Phase 4 request without a decisionId produces no record", () => {
    const phase4 = envelope("ceo.approval_requested", at(0), { taskId: "task-1", reason: "legacy" });
    expect(foldDecisions([phase4])).toEqual(emptyDecisions());
  });
});

describe("pendingQueue — adjacency and ordering (CEO-02)", () => {
  it("two pending requests in two threads stay two items, oldest first by requestedAt", () => {
    const state = foldDecisions([request(B, 5), request(A, 1)]);
    expect(pendingQueue(state).map((item) => item.record.request.decisionId)).toEqual([A, B]);
  });

  it("equal requestedAt keeps arrival order", () => {
    const state = foldDecisions([request(B, 3), request(A, 3)]);
    expect(pendingQueue(state).map((item) => item.record.request.decisionId)).toEqual([B, A]);
  });

  it("a Discuss thread shows one item for its newest pending round, with the earlier rounds", () => {
    const T = uuid(50);
    const state = foldDecisions([request(A, 1, { threadId: T }), made(A, 2, "discuss"), request(B, 3, { threadId: T })]);
    const queue = pendingQueue(state);
    expect(queue.map((item) => ({ id: item.record.request.decisionId, round: item.round }))).toEqual([{ id: B, round: 2 }]);
    expect(queue[0]!.earlier.map((r) => r.request.decisionId)).toEqual([A]);
  });
});

describe("applyDecisionEvent — decision lifecycle (CEO-05)", () => {
  it("request + decision_made is decided with the decision; + decision_applied adds the outcome", () => {
    const state = foldDecisions([request(A, 1), made(A, 2), applied(A, 3)]);
    const record = state.records[A]!;
    expect(record.status).toBe("decided");
    expect(record.decision).toEqual({ action: "approve", note: "n", decidedBy: "ceo@example.com", decidedAt: at(2) });
    expect(record.applied?.outcome).toBe("allowed");
  });

  it("request + decision_made + approval_expired shows expired with the decision attached", () => {
    const state = foldDecisions([request(A, 1), made(A, 2), expired(A, 3)]);
    const record = state.records[A]!;
    expect(record.status).toBe("expired");
    expect(record.decision?.action).toBe("approve");
    expect(record.expired?.reason).toBe("worker_restarted");
  });

  it("returns the same state object for a non-ceo event and never mutates its input", () => {
    const state = foldDecisions([request(A, 1)]);
    const frozen = JSON.stringify(state);
    const other = envelope("task.status_changed", at(2), { taskId: "task-1", status: "running" });
    expect(applyDecisionEvent(state, other)).toBe(state);
    applyDecisionEvent(state, made(A, 3));
    expect(JSON.stringify(state)).toBe(frozen);
  });
});

describe("decisionHistory — newest first, capped (CEO-05)", () => {
  const events: CompanyEvent[] = [];
  for (let i = 0; i < 60; i += 1) {
    const id = uuid(100 + i);
    events.push(request(id, i * 2, { taskId: `task-${i}` }), made(id, i * 2 + 1, "reject", `task-${i}`));
  }

  it("60 closed records -> 50, newest first by closed time", () => {
    const history = decisionHistory(foldDecisions(events, { historyLimit: 1000 }));
    expect(history.length).toBe(50);
    expect(history[0]!.request.decisionId).toBe(uuid(159));
    expect(history[49]!.request.decisionId).toBe(uuid(110));
  });

  it("foldDecisions with historyLimit 50 keeps every pending record and every record of a pending thread", () => {
    const T = uuid(60);
    const threadRoot = uuid(61);
    const lone = uuid(62);
    const state = foldDecisions(
      [
        request(threadRoot, -10, { threadId: T }),
        made(threadRoot, -9, "discuss"),
        ...events,
        request(lone, 500, { taskId: "task-lone" }),
        request(uuid(63), 501, { threadId: T }),
      ],
      { historyLimit: 50 },
    );
    const ids = Object.keys(state.records);
    expect(ids.length).toBe(53);
    expect([threadRoot, lone, uuid(63)].filter((id) => !ids.includes(id))).toEqual([]);
    expect(state.order.length).toBe(53);
  });
});

describe("isResumable", () => {
  it("an expired record is resumable until a resume request for its task arrives", () => {
    const before = foldDecisions([request(A, 1), expired(A, 2)]);
    expect(isResumable(before, before.records[A]!)).toBe(true);
    const after = applyDecisionEvent(before, resume(3));
    expect(isResumable(after, after.records[A]!)).toBe(false);
  });

  it("an expired record stops being resumable when a newer request for the same task arrives", () => {
    const state = foldDecisions([request(A, 1), expired(A, 2), request(C, 3)]);
    expect(isResumable(state, state.records[A]!)).toBe(false);
  });

  it("a decided record is never resumable", () => {
    const state = foldDecisions([request(A, 1), made(A, 2)]);
    expect(isResumable(state, state.records[A]!)).toBe(false);
  });
});

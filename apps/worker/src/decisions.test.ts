import { describe, expect, it } from "vitest";
// Namespace imports: a not-yet-existing export fails inside the test body
// (assertion-level RED), not as an ESM link failure.
import * as es from "event-schema";
import * as decisions from "./decisions.js";

const DECISION_ID = "0b6f7c1e-2a4d-4e8b-9f3a-6c5d4e3b2a10";
const OTHER_ID = "7d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6";

// The frame exactly as the control plane will send it (06-13): built from the
// shared wire schema, then serialised to the raw WebSocket string.
function frame(value: unknown): string {
  return JSON.stringify(es.WorkerDownlinkSchema.parse(value));
}

// Settles-or-not probe: resolves to "pending" if the promise has not settled
// after the microtask queue drains.
async function state(promise: Promise<unknown>): Promise<unknown> {
  return Promise.race([promise.then((v) => ({ resolved: v }), (e: unknown) => ({ rejected: e })), new Promise((r) => setTimeout(() => r("pending"), 0))]);
}

describe("createDecisionBroker", () => {
  it("resolves the parked awaitDecision with { action: 'approve' } from a WorkerDownlinkSchema frame", async () => {
    const broker = decisions.createDecisionBroker();
    const pending = broker.awaitDecision(DECISION_ID, new AbortController().signal);
    expect(broker.pendingCount()).toBe(1);

    broker.handleDownlink(frame({ type: "decision", decisionId: DECISION_ID, action: "approve" }));

    await expect(pending).resolves.toEqual({ action: "approve" });
    expect(broker.pendingCount()).toBe(0);
  });

  it("carries note and answers from the parsed frame", async () => {
    const broker = decisions.createDecisionBroker();
    const pending = broker.awaitDecision(DECISION_ID, new AbortController().signal);
    broker.handleDownlink(
      frame({ type: "decision", decisionId: DECISION_ID, action: "request_changes", note: "split it", answers: { q: "a" } }),
    );
    await expect(pending).resolves.toEqual({ action: "request_changes", note: "split it", answers: { q: "a" } });
  });

  it("resolves exactly once: a repeat delivery changes nothing", async () => {
    const broker = decisions.createDecisionBroker();
    const first = broker.awaitDecision(DECISION_ID, new AbortController().signal);
    broker.handleDownlink(frame({ type: "decision", decisionId: DECISION_ID, action: "reject" }));
    await expect(first).resolves.toEqual({ action: "reject" });

    // A second park under a new id is untouched by a replay of the old frame.
    const second = broker.awaitDecision(OTHER_ID, new AbortController().signal);
    broker.handleDownlink(frame({ type: "decision", decisionId: DECISION_ID, action: "approve" }));
    expect(await state(second)).toBe("pending");
    expect(broker.pendingCount()).toBe(1);
  });

  it("ignores an unknown decisionId, malformed JSON, a task.resume frame and an unknown type", async () => {
    const broker = decisions.createDecisionBroker();
    const pending = broker.awaitDecision(DECISION_ID, new AbortController().signal);

    broker.handleDownlink(frame({ type: "decision", decisionId: OTHER_ID, action: "approve" }));
    broker.handleDownlink("{not json");
    broker.handleDownlink(
      frame({ type: "task.resume", taskId: "task-1", sessionId: "s", worktreePath: "F:/wt", agentId: "agent-1" }),
    );
    broker.handleDownlink(JSON.stringify({ type: "task.start", decisionId: DECISION_ID, action: "approve", prompt: "x" }));

    expect(await state(pending)).toBe("pending");
    expect(broker.pendingCount()).toBe(1);
  });

  it("drops an extra updatedInput key: the resolved decision has only parsed fields", async () => {
    const broker = decisions.createDecisionBroker();
    const pending = broker.awaitDecision(DECISION_ID, new AbortController().signal);
    broker.handleDownlink(
      JSON.stringify({ type: "decision", decisionId: DECISION_ID, action: "approve", updatedInput: { command: "rm -rf /" } }),
    );
    await expect(pending).resolves.toEqual({ action: "approve" });
  });

  it("aborting the signal rejects the promise and removes the entry", async () => {
    const broker = decisions.createDecisionBroker();
    const controller = new AbortController();
    const pending = broker.awaitDecision(DECISION_ID, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(broker.pendingCount()).toBe(0);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const broker = decisions.createDecisionBroker();
    const controller = new AbortController();
    controller.abort();
    await expect(broker.awaitDecision(DECISION_ID, controller.signal)).rejects.toThrow();
    expect(broker.pendingCount()).toBe(0);
  });

  it("exposes a uuid bootId", () => {
    expect(decisions.createDecisionBroker().bootId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("helloMessage() is a WorkerUplinkSchema hello carrying this broker's bootId", () => {
    const broker = decisions.createDecisionBroker();
    const hello = es.WorkerUplinkSchema.parse(broker.helloMessage());
    expect(hello).toEqual({ type: "hello", bootId: broker.bootId });
  });
});

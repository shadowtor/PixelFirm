import { randomUUID } from "node:crypto";
import { type DecisionAction, WorkerDownlinkSchema } from "event-schema";

// Structurally claude-adapter's CeoDecision; typed from event-schema because
// apps/worker does not depend on claude-adapter until 06-04.
export interface BrokerDecision {
  action: DecisionAction;
  note?: string;
  answers?: Record<string, string>;
}

/**
 * Worker pending-decision broker (D-01). The runtime parks a classified tool
 * call on awaitDecision; a decision frame on the worker's WebSocket, validated
 * by the shared WorkerDownlinkSchema, resolves it exactly once. The decision
 * is built from the parsed fields only, so no wire field can reach what runs.
 * 06-04 wires handleDownlink to the ws-client message handler and task.resume.
 */
export function createDecisionBroker() {
  const pending = new Map<string, { resolve: (d: BrokerDecision) => void; reject: (err: Error) => void }>();

  return {
    bootId: randomUUID(),

    awaitDecision(decisionId: string, signal: AbortSignal): Promise<BrokerDecision> {
      if (signal.aborted) return Promise.reject(new Error(`Decision ${decisionId} aborted before it was parked`));
      return new Promise<BrokerDecision>((resolve, reject) => {
        const onAbort = () => {
          pending.delete(decisionId);
          reject(new Error(`Decision ${decisionId} aborted`));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        pending.set(decisionId, {
          resolve: (d) => {
            signal.removeEventListener("abort", onAbort);
            resolve(d);
          },
          reject,
        });
      });
    },

    // Takes the raw WebSocket string. Anything that is not a valid decision
    // frame for a parked call is ignored silently.
    handleDownlink(raw: string): void {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return;
      }
      const parsed = WorkerDownlinkSchema.safeParse(json);
      if (!parsed.success || parsed.data.type !== "decision") return;
      const { decisionId, action, note, answers } = parsed.data;
      const entry = pending.get(decisionId);
      if (!entry) return;
      pending.delete(decisionId);
      entry.resolve({ action, ...(note !== undefined ? { note } : {}), ...(answers !== undefined ? { answers } : {}) });
    },

    pendingCount(): number {
      return pending.size;
    },
  };
}

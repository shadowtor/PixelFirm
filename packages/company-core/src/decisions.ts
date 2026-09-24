import type { CompanyEvent, DecisionAction } from "event-schema";

// The CEO decisions projection (Phase 6, CEO-02/CEO-05). Kept out of reduce():
// /ws/browser sends ProjectionState to the office, and decision content is
// PRIVATE (D-08/D-09). Type-only imports so the root e2e spec can import this
// file by relative path. The server folds its snapshot with foldDecisions and
// the browser applies applyDecisionEvent to each live event: one step, so the
// two cannot drift (05-09 same-code rule).

type EventOf<T extends CompanyEvent["type"]> = Extract<CompanyEvent, { type: T }>;
type RequestPayload = EventOf<"ceo.approval_requested">["payload"];

export type DecisionRequestView = {
  decisionId: string;
  // Defaults to decisionId: a request outside a Discuss thread is its own thread.
  threadId: string;
  taskId: string;
  agentId?: string;
  kind?: RequestPayload["kind"];
  reason: string;
  toolName?: string;
  toolInput?: string;
  questions?: RequestPayload["questions"];
  title?: string;
  context?: string;
  recommendation?: string;
  links?: string[];
  diff?: RequestPayload["diff"];
  taskTitle?: string;
  worktreePath?: string;
  requestedAt: string;
};

export type DecisionRecord = {
  request: DecisionRequestView;
  status: "pending" | "decided" | "expired";
  decision?: { action: DecisionAction; note?: string; decidedBy: string; decidedAt: string };
  applied?: { outcome: "allowed" | "denied"; appliedAt: string };
  expired?: { reason: EventOf<"ceo.approval_expired">["payload"]["reason"]; expiredAt: string };
};

export type DecisionsState = {
  records: Record<string, DecisionRecord>;
  // decisionIds in arrival order; every tie-break uses the index here.
  order: string[];
  resumeRequestedAt: Record<string, string>;
};

export type PendingItem = { record: DecisionRecord; round: number; earlier: DecisionRecord[] };

export const emptyDecisions = (): DecisionsState => ({ records: {}, order: [], resumeRequestedAt: {} });

function withRecord(state: DecisionsState, id: string, patch: Partial<DecisionRecord>): DecisionsState {
  const existing = state.records[id];
  if (!existing) return state;
  return { ...state, records: { ...state.records, [id]: { ...existing, ...patch } } };
}

export function applyDecisionEvent(state: DecisionsState, event: CompanyEvent): DecisionsState {
  switch (event.type) {
    case "ceo.approval_requested": {
      const p = event.payload;
      // A Phase 4 request has no decisionId and cannot be decided; a replayed one is a no-op.
      if (!p.decisionId || state.records[p.decisionId]) return state;
      const request: DecisionRequestView = {
        decisionId: p.decisionId,
        threadId: p.threadId ?? p.decisionId,
        taskId: p.taskId,
        agentId: event.sourceAgentId,
        kind: p.kind,
        reason: p.reason,
        toolName: p.toolName,
        toolInput: p.toolInput,
        questions: p.questions,
        title: p.title,
        context: p.context,
        recommendation: p.recommendation,
        links: p.links,
        diff: p.diff,
        taskTitle: p.taskTitle,
        worktreePath: p.worktreePath,
        requestedAt: event.occurredAt,
      };
      return {
        ...state,
        records: { ...state.records, [p.decisionId]: { request, status: "pending" } },
        order: [...state.order, p.decisionId],
      };
    }
    case "ceo.decision_made": {
      const p = event.payload;
      const existing = state.records[p.decisionId];
      if (!existing) return state;
      return withRecord(state, p.decisionId, {
        // Expired wins the status (the decision never reached the worker) but keeps the decision.
        status: existing.status === "expired" ? "expired" : "decided",
        decision: { action: p.action, note: p.note, decidedBy: p.decidedBy, decidedAt: event.occurredAt },
      });
    }
    case "ceo.decision_applied":
      return withRecord(state, event.payload.decisionId, {
        applied: { outcome: event.payload.outcome, appliedAt: event.occurredAt },
      });
    case "ceo.approval_expired":
      return withRecord(state, event.payload.decisionId, {
        status: "expired",
        expired: { reason: event.payload.reason, expiredAt: event.occurredAt },
      });
    case "ceo.task_resume_requested":
      return {
        ...state,
        resumeRequestedAt: { ...state.resumeRequestedAt, [event.payload.taskId]: event.occurredAt },
      };
    default:
      return state;
  }
}

const closedAt = (r: DecisionRecord): string => r.expired?.expiredAt ?? r.decision?.decidedAt ?? r.request.requestedAt;

function records(state: DecisionsState): DecisionRecord[] {
  return state.order.map((id) => state.records[id]).filter((r): r is DecisionRecord => r !== undefined);
}

export function pendingQueue(state: DecisionsState): PendingItem[] {
  const all = records(state);
  // One item per thread: its newest pending record (latest in arrival order).
  const newest = new Map<string, number>();
  all.forEach((r, i) => {
    if (r.status === "pending") newest.set(r.request.threadId, i);
  });
  return [...newest.values()]
    .sort((a, b) => Date.parse(all[a]!.request.requestedAt) - Date.parse(all[b]!.request.requestedAt) || a - b)
    .map((i) => {
      const record = all[i]!;
      const earlier = all.slice(0, i).filter((r) => r.request.threadId === record.request.threadId);
      return { record, round: earlier.length + 1, earlier };
    });
}

export function decisionHistory(state: DecisionsState, limit = 50): DecisionRecord[] {
  return records(state)
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status !== "pending")
    .sort((a, b) => Date.parse(closedAt(b.r)) - Date.parse(closedAt(a.r)) || b.i - a.i)
    .slice(0, limit)
    .map(({ r }) => r);
}

export function foldDecisions(events: CompanyEvent[], { historyLimit = 50 } = {}): DecisionsState {
  const state = events.reduce(applyDecisionEvent, emptyDecisions());
  // Bound the snapshot (each request can carry a 64 KiB diff): keep the newest
  // historyLimit closed records plus every record of a thread still pending.
  const pendingThreads = new Set(records(state).filter((r) => r.status === "pending").map((r) => r.request.threadId));
  const keep = new Set(decisionHistory(state, historyLimit).map((r) => r.request.decisionId));
  const order = state.order.filter((id) => keep.has(id) || pendingThreads.has(state.records[id]!.request.threadId));
  if (order.length === state.order.length) return state;
  return { ...state, records: Object.fromEntries(order.map((id) => [id, state.records[id]!])), order };
}

export function isResumable(state: DecisionsState, record: DecisionRecord): boolean {
  if (record.status !== "expired" || !record.expired) return false;
  const { taskId, decisionId } = record.request;
  const resumedAt = state.resumeRequestedAt[taskId];
  if (resumedAt && Date.parse(resumedAt) >= Date.parse(record.expired.expiredAt)) return false;
  const newer = state.order.slice(state.order.indexOf(decisionId) + 1);
  return !newer.some((id) => state.records[id]?.request.taskId === taskId);
}

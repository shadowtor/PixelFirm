import type { CompanyEvent } from "event-schema";

// RED skeleton: signatures only. The implementation lands in the GREEN commit.
export type DecisionsState = { records: Record<string, unknown>; order: string[]; resumeRequestedAt: Record<string, string> };

export const emptyDecisions = (): DecisionsState => ({ records: {}, order: [], resumeRequestedAt: {} });
export const applyDecisionEvent = (state: DecisionsState, _event: CompanyEvent): DecisionsState => state;
export const foldDecisions = (_events: CompanyEvent[], _opts: { historyLimit?: number } = {}): any => emptyDecisions();
export const pendingQueue = (_state: DecisionsState): any[] => [];
export const decisionHistory = (_state: DecisionsState, _limit = 50): any[] => [];
export const isResumable = (_state: DecisionsState, _record: unknown): boolean => false;

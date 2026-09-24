export { fold, reduce } from "./reducer.js";
export { emptyState } from "./projections.js";
export type { ProjectionState, AgentState, FloorState, TeamState, ProjectState, TaskState, CompanyState } from "./projections.js";
export {
  applyDecisionEvent,
  foldDecisions,
  pendingQueue,
  decisionHistory,
  isResumable,
  emptyDecisions,
} from "./decisions.js";
export type { DecisionRequestView, DecisionRecord, DecisionsState, PendingItem } from "./decisions.js";

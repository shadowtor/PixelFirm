import type { CompanyEvent } from "event-schema";
import type { ProjectionState } from "./projections";
import { emptyState } from "./projections";

export { emptyState } from "./projections";

// Dispatch table keyed by event.type. Handlers never call Date.now(), crypto.randomUUID(),
// Math.random(), or read module-level mutable state — every value a handler needs must
// already be on the event object (Pitfall 1: non-determinism breaks replay, EVENT-04).
// Every handler returns a NEW object (spread), never mutates `state` in place.
const handlers: {
  [K in CompanyEvent["type"]]?: (state: ProjectionState, event: Extract<CompanyEvent, { type: K }>) => ProjectionState;
} = {
  "company.started": (state, event) => ({
    ...state,
    companies: {
      ...state.companies,
      [event.companyId]: { id: event.companyId, name: event.payload.name },
    },
  }),
};

// Looks up a handler for the event's type and applies it. An unrecognized type
// no-ops (returns state unchanged) rather than throwing — never a build-time
// exhaustiveness requirement in Phase 1, since the union grows incrementally (D-01).
export function reduce(state: ProjectionState, event: CompanyEvent): ProjectionState {
  const handler = handlers[event.type as CompanyEvent["type"]];
  return handler ? handler(state, event as never) : state;
}

export function fold(events: CompanyEvent[], initial: ProjectionState = emptyState()): ProjectionState {
  return events.reduce(reduce, initial);
}

import type { AgentStatus, CompanyEvent } from "event-schema";
import { reduce, type ProjectionState } from "company-core";

export interface CharacterUpsert {
  agentId: string;
  status: AgentStatus;
  name?: string;
}

/**
 * CR-01 (05-VERIFICATION.md): the live path that creates and updates
 * Characters between snapshots. Before this existed, agent appearance was
 * frozen at the connect-time fold until the user reloaded the page.
 *
 * The live path IS the fold path: this runs company-core's own `reduce` — the
 * exact function `fold()` applies — and does nothing but diff its output. No
 * status derivation is re-implemented here, so the live view and a replay of
 * the same event log cannot disagree. A stateless event -> AgentStatus mapper
 * could not deliver that: `deriveAgentStatus` needs `gsdCategory`, which lives
 * in `ProjectionState.gsdObservations`, never on the event.
 *
 * Pure by construction (no module-level mutable state, no Date.now()),
 * matching company-core/src/reducer.ts's determinism rule so this module stays
 * replay-safe.
 *
 * Every reducer handler returns a fresh object per touched agent, so reference
 * inequality against `prev.agents[agentId]` is a sound change signal — an
 * untouched agent keeps its identity and emits no upsert.
 */
export function applyLiveEvent(
  prev: ProjectionState,
  event: CompanyEvent,
): { state: ProjectionState; upserts: CharacterUpsert[] } {
  const state = reduce(prev, event);

  const upserts: CharacterUpsert[] = [];
  for (const [agentId, agent] of Object.entries(state.agents)) {
    if (agent === prev.agents[agentId]) continue;
    upserts.push({ agentId, status: agent.status, name: agent.name });
  }

  return { state, upserts };
}

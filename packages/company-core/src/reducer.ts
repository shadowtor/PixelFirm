import type { CompanyEvent } from "event-schema";
import { AgentStatus } from "event-schema";
import type { ProjectionState } from "./projections";
import { emptyState } from "./projections";
import { deriveAgentStatus } from "./agent-status-derivation";

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

  "floor.created": (state, event) => {
    const floorId = event.floorId;
    if (!floorId) return state;
    return {
      ...state,
      floors: {
        ...state.floors,
        [floorId]: { id: floorId, name: event.payload.name },
      },
    };
  },

  "project.created": (state, event) => {
    const projectId = event.projectId;
    if (!projectId) return state;
    return {
      ...state,
      projects: {
        ...state.projects,
        [projectId]: { id: projectId, name: event.payload.name },
      },
    };
  },

  "task.created": (state, event) => {
    const taskId = event.taskId;
    if (!taskId) return state;
    return {
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: { id: taskId, status: "created", title: event.payload.title },
      },
    };
  },

  // Agent comes online and joins a team — touches both `agents` and `teams`
  // from a single event (no dedicated "team" category exists among the 12
  // seeded types; team membership rides along with agent.online instead).
  "agent.online": (state, event) => {
    const agentId = event.sourceAgentId;
    if (!agentId) return state;
    return {
      ...state,
      agents: {
        ...state.agents,
        [agentId]: { id: agentId, status: AgentStatus.IDLE, name: event.payload.name },
      },
      teams: {
        ...state.teams,
        [event.payload.teamId]: state.teams[event.payload.teamId] ?? { id: event.payload.teamId },
      },
    };
  },

  // A started session defaults to the most common active state until
  // Plan 05-03's real per-task derivation refines it further.
  "session.started": (state, event) => {
    const agentId = event.sourceAgentId;
    const existing = agentId ? state.agents[agentId] : undefined;
    if (!agentId || !existing) return state;
    return {
      ...state,
      agents: {
        ...state.agents,
        [agentId]: { ...existing, status: AgentStatus.CODING },
      },
    };
  },

  // The receiving agent is waiting on the sending agent to complete the
  // handoff — the one honest, reachable derivation path for
  // waiting_for_agent this plan has (05-01 must_haves.truths).
  // Phase 5 (05-03): payload now also carries fromAgentId, but no behavior
  // change is needed on the sending agent's own state yet — HANDOFF-01's
  // walk-away visual is Plan 05-04's frontend concern, driven off the raw
  // event, not off a new AgentStatus value.
  "agent.handoff_requested": (state, event) => {
    const { taskId, toAgentId } = event.payload;
    const existingTask = state.tasks[taskId];
    const existingToAgent = state.agents[toAgentId];
    return {
      ...state,
      tasks: existingTask
        ? { ...state.tasks, [taskId]: { ...existingTask, status: "handoff_requested" } }
        : state.tasks,
      agents: {
        ...state.agents,
        [toAgentId]: {
          ...(existingToAgent ?? { id: toAgentId, status: AgentStatus.IDLE }),
          status: AgentStatus.WAITING_FOR_AGENT,
        },
      },
    };
  },

  "review.started": (state, event) => {
    const existing = state.tasks[event.payload.taskId];
    if (!existing) return state;
    return {
      ...state,
      tasks: { ...state.tasks, [event.payload.taskId]: { ...existing, status: "review" } },
    };
  },

  "ceo.approval_requested": (state, event) => {
    const existing = state.tasks[event.payload.taskId];
    if (!existing) return state;
    return {
      ...state,
      tasks: { ...state.tasks, [event.payload.taskId]: { ...existing, status: "awaiting_approval" } },
    };
  },

  "git.commit_created": (state, event) => {
    const taskId = event.taskId;
    const existing = taskId ? state.tasks[taskId] : undefined;
    if (!taskId || !existing) return state;
    return {
      ...state,
      tasks: { ...state.tasks, [taskId]: { ...existing, status: "committed" } },
    };
  },

  "deployment.started": (state, event) => {
    const projectId = event.projectId;
    const existing = projectId ? state.projects[projectId] : undefined;
    if (!projectId || !existing) return state;
    return {
      ...state,
      projects: { ...state.projects, [projectId]: { ...existing, status: "deploying" } },
    };
  },

  // viewer.event touches none of the five required projection kinds (no
  // dedicated viewer-facing slot exists in ProjectionState yet) — it no-ops
  // via the default fallback below, same as any unrecognized type.

  // WR-02: the worker (apps/worker/src/poll-loop.ts) never sets taskId on
  // the events it emits — no session-to-task correlation mechanism exists
  // yet. This handler is therefore deliberately deferred/currently
  // unreachable in production; only reducer.test.ts's hand-built fixtures
  // exercise it today. Wire a real taskId through once that correlation
  // exists.
  "git.worktree_observed": (state, event) => {
    const taskId = event.taskId;
    const existing = taskId ? state.tasks[taskId] : undefined;
    if (!taskId || !existing) return state;
    return {
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...existing,
          repo: event.payload.repoPath,
          branch: event.payload.branch,
          worktreePath: event.payload.worktreePath,
          headSha: event.payload.headSha,
          sessionId: event.payload.sessionId,
        },
      },
    };
  },

  // companyId is a required envelope field (never optional) — this handler
  // always succeeds, replacing any prior observation for the same company.
  // Phase 5 (05-03): the company-wide GSD category shift now also refines
  // every currently-active agent's fine-grained sub-state — the one
  // company-wide-not-per-agent simplification RESEARCH.md's own
  // architecture diagram implies (no per-agent GSD signal exists yet).
  "gsd.phase_observed": (state, event) => {
    const gsdObservations = {
      ...state.gsdObservations,
      [event.companyId]: {
        companyId: event.companyId,
        phase: event.payload.phase,
        status: event.payload.status,
        category: event.payload.category,
        role: event.payload.role,
        active: event.payload.active,
      },
    };
    const agents = { ...state.agents };
    for (const [agentId, agent] of Object.entries(state.agents)) {
      if (agent.rawTaskStatus === "starting" || agent.rawTaskStatus === "running") {
        agents[agentId] = {
          ...agent,
          status: deriveAgentStatus({ taskStatus: agent.rawTaskStatus, gsdCategory: event.payload.category }),
        };
      }
    }
    return { ...state, gsdObservations, agents };
  },

  // worker.heartbeat intentionally has no handler — connection status is
  // derived server-side from socket state + heartbeat receipt timing
  // (apps/api/src/ws/connection-status.ts), never part of ProjectionState.

  // Phase 4 addition (RUNTIME-02): ClaudeCodeRuntime is the first real
  // producer of task-lifecycle events and no upstream task.created producer
  // exists yet for real Claude Code tasks — gating on "task must already
  // exist" the way review.started/ceo.approval_requested do would make this
  // event silently no-op for every real demo run. Upserts unconditionally,
  // mirroring agent.handoff_requested's upsert-if-missing pattern (lines
  // 90-104 above).
  // Phase 5 addition (05-03): also requires event.sourceAgentId (now
  // populated per Task 1) to derive and upsert a real AgentStatus on the
  // owning agent. When sourceAgentId is absent (an older-shaped event, or a
  // producer that hasn't been updated), falls back to the task-only update
  // with no agent-status side effect — never throws, never fabricates an
  // agent update from nothing.
  "task.status_changed": (state, event) => {
    const { taskId, status } = event.payload;
    const tasks = {
      ...state.tasks,
      [taskId]: { ...(state.tasks[taskId] ?? { id: taskId }), status },
    };
    const sourceAgentId = event.sourceAgentId;
    if (!sourceAgentId) {
      return { ...state, tasks };
    }
    const existingAgent = state.agents[sourceAgentId];
    const gsdCategory = state.gsdObservations[event.companyId]?.category;
    return {
      ...state,
      tasks,
      agents: {
        ...state.agents,
        [sourceAgentId]: {
          ...(existingAgent ?? { id: sourceAgentId }),
          status: deriveAgentStatus({ taskStatus: status, gsdCategory }),
          currentTaskId: taskId,
          rawTaskStatus: status,
        },
      },
    };
  },

  // Phase 5 addition (HANDOFF-01, 05-03): the receiving agent has now
  // accepted and is starting real work — refined by the next
  // task.status_changed for them shortly after. Mirrors
  // agent.handoff_requested's upsert-if-missing pattern.
  "agent.handoff_completed": (state, event) => {
    const { toAgentId } = event.payload;
    const existing = state.agents[toAgentId];
    return {
      ...state,
      agents: {
        ...state.agents,
        [toAgentId]: {
          ...(existing ?? { id: toAgentId }),
          status: AgentStatus.CODING,
        },
      },
    };
  },
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

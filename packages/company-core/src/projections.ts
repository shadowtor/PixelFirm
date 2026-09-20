export interface AgentState {
  id: string;
  status: string;
  name?: string;
}

export interface FloorState {
  id: string;
  name: string;
}

export interface TeamState {
  id: string;
}

export interface ProjectState {
  id: string;
  name: string;
  status?: string;
}

export interface TaskState {
  id: string;
  status: string;
  title?: string;
  // Phase 3 additions (WORKTREE-01): populated by git.worktree_observed.
  repo?: string;
  branch?: string;
  worktreePath?: string;
  headSha?: string;
  sessionId?: string;
}

export interface CompanyState {
  id: string;
  name: string;
}

// Phase 3 addition (GSD-01): the GSD adapter's latest observed phase/status
// for a company. One slot per companyId — a new observation replaces the
// prior one (no history kept here; the event log itself is the history).
export interface GsdObservationState {
  companyId: string;
  phase?: string;
  status: string;
  category: string;
  role: string;
  active: boolean;
}

// Full projection shape per EVENT-03 — agents/floors/teams/projects/tasks are the
// five required projection kinds; `companies` is an additive slot (Claude's
// discretion per CONTEXT.md) so the company.started handler has somewhere to
// materialize a company-scoped record. Plan 02 fills in the remaining handlers
// against this same shape.
export interface ProjectionState {
  companies: Record<string, CompanyState>;
  agents: Record<string, AgentState>;
  floors: Record<string, FloorState>;
  teams: Record<string, TeamState>;
  projects: Record<string, ProjectState>;
  tasks: Record<string, TaskState>;
  gsdObservations: Record<string, GsdObservationState>;
}

export function emptyState(): ProjectionState {
  return {
    companies: {},
    agents: {},
    floors: {},
    teams: {},
    projects: {},
    tasks: {},
    gsdObservations: {},
  };
}

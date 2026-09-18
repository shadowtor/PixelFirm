export interface AgentState {
  id: string;
  status: string;
}

export interface FloorState {
  id: string;
}

export interface TeamState {
  id: string;
}

export interface ProjectState {
  id: string;
}

export interface TaskState {
  id: string;
  status: string;
}

export interface CompanyState {
  id: string;
  name: string;
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
}

export function emptyState(): ProjectionState {
  return {
    companies: {},
    agents: {},
    floors: {},
    teams: {},
    projects: {},
    tasks: {},
  };
}

import { describe, it, expect } from "vitest";
import type { CompanyEvent } from "event-schema";
import { AgentStatus } from "event-schema";
import { fold, reduce, emptyState } from "./reducer.js";
import { stubEventSequence } from "./fixtures/stub-events.js";

function companyStartedEvent(): CompanyEvent {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    version: 1,
    occurredAt: "2026-09-18T00:00:00.000Z",
    companyId: "company-1",
    visibility: "INTERNAL",
    type: "company.started",
    payload: { name: "PixelFirm" },
  } as CompanyEvent;
}

describe("fold — empty and single-event application", () => {
  it("fold([]) returns emptyState() untouched", () => {
    expect(fold([])).toEqual(emptyState());
  });

  it("fold([oneCompanyStartedEvent]) applies exactly the company.started handler", () => {
    const result = fold([companyStartedEvent()]);
    expect(result.companies["company-1"]).toBeDefined();
  });
});

describe("reduce — unknown event types", () => {
  it("returns the input state unchanged for an unrecognized type, never throws", () => {
    const state = emptyState();
    const unknownEvent = { ...companyStartedEvent(), type: "not.a.real.type" } as unknown as CompanyEvent;
    expect(() => reduce(state, unknownEvent)).not.toThrow();
    expect(reduce(state, unknownEvent)).toEqual(state);
  });
});

describe("replay determinism", () => {
  it("folding the same event twice from a fresh state produces deep-equal results", () => {
    const first = fold([companyStartedEvent()]);
    const second = fold([companyStartedEvent()]);
    expect(second).toEqual(first);
  });
});

describe("fold — full 12-event fixture (EVENT-03)", () => {
  it("populates every entity kind touched by the fixture", () => {
    const result = fold(stubEventSequence);

    expect(result.companies["company-1"]).toBeDefined();
    expect(result.floors["floor-1"]).toBeDefined();
    expect(result.projects["project-1"]).toBeDefined();
    expect(result.agents["agent-1"]).toBeDefined();
    expect(result.agents["agent-2"]).toBeDefined();
    expect(result.teams["team-eng"]).toBeDefined();
    expect(result.tasks["task-1"]).toBeDefined();
  });

  it("threads task status through handoff/review/approval/commit/deployment", () => {
    const result = fold(stubEventSequence);

    expect(result.tasks["task-1"].status).toBe("committed");
    expect(result.projects["project-1"].status).toBe("deploying");
    expect(result.agents["agent-1"].status).toBe(AgentStatus.CODING);
    expect(result.agents["agent-2"].status).toBe(AgentStatus.WAITING_FOR_AGENT);
  });
});

describe("replay determinism — full catalog scale (EVENT-04)", () => {
  it("folding the identical 12-event fixture array twice, each from a fresh empty state, produces deep-equal results", () => {
    const first = fold(stubEventSequence, emptyState());
    const second = fold(stubEventSequence, emptyState());
    expect(second).toEqual(first);
  });
});

describe("EVENT-03 gap closure — omitted correlation id no-ops instead of corrupting state", () => {
  it("floor.created with floorId omitted no-ops", () => {
    const event = {
      id: "event-omit-01",
      version: 1,
      occurredAt: "2026-09-18T00:00:00.000Z",
      companyId: "company-1",
      visibility: "INTERNAL",
      type: "floor.created",
      payload: { name: "Ghost Floor" },
    } as CompanyEvent;
    expect(reduce(emptyState(), event)).toEqual(emptyState());
  });

  it("project.created with projectId omitted no-ops", () => {
    const event = {
      id: "event-omit-02",
      version: 1,
      occurredAt: "2026-09-18T00:00:00.000Z",
      companyId: "company-1",
      visibility: "INTERNAL",
      type: "project.created",
      payload: { name: "Ghost Project" },
    } as CompanyEvent;
    expect(reduce(emptyState(), event)).toEqual(emptyState());
  });

  it("task.created with taskId omitted no-ops", () => {
    const event = {
      id: "event-omit-03",
      version: 1,
      occurredAt: "2026-09-18T00:00:00.000Z",
      companyId: "company-1",
      visibility: "INTERNAL",
      type: "task.created",
      payload: { title: "Ghost Task" },
    } as CompanyEvent;
    expect(reduce(emptyState(), event)).toEqual(emptyState());
  });

  it("agent.online with sourceAgentId omitted no-ops entirely, including the teams side effect", () => {
    const event = {
      id: "event-omit-04",
      version: 1,
      occurredAt: "2026-09-18T00:00:00.000Z",
      companyId: "company-1",
      visibility: "INTERNAL",
      type: "agent.online",
      payload: { name: "Ghost Agent", teamId: "team-ghost" },
    } as CompanyEvent;
    expect(reduce(emptyState(), event)).toEqual(emptyState());
  });

  it("session.started with sourceAgentId omitted no-ops", () => {
    const event = {
      id: "event-omit-05",
      version: 1,
      occurredAt: "2026-09-18T00:00:00.000Z",
      companyId: "company-1",
      taskId: "task-1",
      visibility: "INTERNAL",
      type: "session.started",
      payload: { worktreeId: "wt-1" },
    } as CompanyEvent;
    expect(reduce(emptyState(), event)).toEqual(emptyState());
  });
});

// Phase 3 (RUNTIME-04, WORKTREE-01, GSD-01): git.worktree_observed,
// gsd.phase_observed, worker.heartbeat handlers.
function taskCreatedEvent(): CompanyEvent {
  return {
    id: "event-task-01",
    version: 1,
    occurredAt: "2026-09-19T00:00:00.000Z",
    companyId: "company-1",
    taskId: "task-1",
    visibility: "INTERNAL",
    type: "task.created",
    payload: { title: "Build git adapter" },
  } as CompanyEvent;
}

function worktreeObservedEvent(overrides: Partial<CompanyEvent> = {}): CompanyEvent {
  return {
    id: "event-worktree-01",
    version: 1,
    occurredAt: "2026-09-19T00:00:01.000Z",
    companyId: "company-1",
    taskId: "task-1",
    visibility: "INTERNAL",
    type: "git.worktree_observed",
    payload: {
      repoPath: "F:/Sidegigs/syncsmith",
      branch: "main",
      worktreePath: "F:/Sidegigs/syncsmith",
      headSha: "c41f51af54bbf1f9c78c501dac37511169926760",
      sessionId: "session-1",
    },
    ...overrides,
  } as CompanyEvent;
}

function phaseObservedEvent(): CompanyEvent {
  return {
    id: "event-phase-01",
    version: 1,
    occurredAt: "2026-09-19T00:00:02.000Z",
    companyId: "company-1",
    visibility: "INTERNAL",
    type: "gsd.phase_observed",
    payload: {
      phase: "03",
      status: "executing",
      category: "execution",
      role: "Engineering",
      active: true,
    },
  } as CompanyEvent;
}

function heartbeatEvent(): CompanyEvent {
  return {
    id: "event-heartbeat-01",
    version: 1,
    occurredAt: "2026-09-19T00:00:03.000Z",
    companyId: "company-1",
    visibility: "INTERNAL",
    type: "worker.heartbeat",
    payload: {},
  } as CompanyEvent;
}

describe("git.worktree_observed", () => {
  it("updates an existing task's repo/branch/worktreePath/headSha/sessionId fields, preserving existing fields", () => {
    const withTask = reduce(emptyState(), taskCreatedEvent());
    const result = reduce(withTask, worktreeObservedEvent());

    expect(result.tasks["task-1"]).toEqual({
      id: "task-1",
      status: "created",
      title: "Build git adapter",
      repo: "F:/Sidegigs/syncsmith",
      branch: "main",
      worktreePath: "F:/Sidegigs/syncsmith",
      headSha: "c41f51af54bbf1f9c78c501dac37511169926760",
      sessionId: "session-1",
    });
  });

  it("no-ops when event.taskId is omitted", () => {
    const state = emptyState();
    const event = worktreeObservedEvent({ taskId: undefined });
    expect(reduce(state, event)).toEqual(state);
  });

  it("no-ops when taskId references no existing task record", () => {
    const state = emptyState();
    const event = worktreeObservedEvent({ taskId: "no-such-task" });
    expect(reduce(state, event)).toEqual(state);
  });
});

describe("gsd.phase_observed", () => {
  it("always populates state.gsdObservations[companyId] (companyId is a required envelope field)", () => {
    const result = reduce(emptyState(), phaseObservedEvent());
    expect(result.gsdObservations["company-1"]).toEqual({
      companyId: "company-1",
      phase: "03",
      status: "executing",
      category: "execution",
      role: "Engineering",
      active: true,
    });
  });

  it("replaces a prior observation for the same companyId", () => {
    const first = reduce(emptyState(), phaseObservedEvent());
    const second = reduce(first, {
      ...phaseObservedEvent(),
      payload: { status: "verifying", category: "verification", role: "QA", active: false },
    });
    expect(second.gsdObservations["company-1"]).toEqual({
      companyId: "company-1",
      status: "verifying",
      category: "verification",
      role: "QA",
      active: false,
    });
  });
});

describe("worker.heartbeat", () => {
  it("leaves state deep-equal to the input (no handler — connection status is derived server-side)", () => {
    const state = emptyState();
    expect(reduce(state, heartbeatEvent())).toEqual(state);
  });
});

describe("replay determinism — Phase 3 event types (EVENT-04)", () => {
  it("folding a sequence with all 3 new types twice from a fresh state produces deep-equal results", () => {
    const sequence = [taskCreatedEvent(), worktreeObservedEvent(), phaseObservedEvent(), heartbeatEvent()];
    const first = fold(sequence, emptyState());
    const second = fold(sequence, emptyState());
    expect(second).toEqual(first);
  });
});

// Phase 4 (RUNTIME-02): task.status_changed — ClaudeCodeRuntime is the first
// real producer of task-lifecycle events; no upstream task.created producer
// exists yet for real Claude Code tasks, so this handler upserts rather than
// gating on "task must already exist" (mirrors agent.handoff_requested's
// upsert-if-missing pattern, lines 90-104).
function taskStatusChangedEvent(status = "completed", overrides: Partial<CompanyEvent> = {}): CompanyEvent {
  return {
    id: "event-task-status-01",
    version: 1,
    occurredAt: "2026-09-20T00:00:00.000Z",
    companyId: "company-1",
    taskId: "task-1",
    visibility: "INTERNAL",
    type: "task.status_changed",
    payload: { taskId: "task-1", status },
    ...overrides,
  } as CompanyEvent;
}

describe("task.status_changed", () => {
  it("upserts tasks[taskId].status on a fresh empty state (no prior task.created)", () => {
    const result = fold([taskStatusChangedEvent("completed")]);
    expect(result.tasks["task-1"].status).toBe("completed");
  });

  it("preserves existing task fields while updating status on an existing task", () => {
    const withTask = reduce(emptyState(), taskCreatedEvent());
    const result = reduce(withTask, taskStatusChangedEvent("failed"));
    expect(result.tasks["task-1"]).toEqual({
      id: "task-1",
      status: "failed",
      title: "Build git adapter",
    });
  });

  // Phase 5 (05-03): sourceAgentId-bearing task.status_changed events now
  // additionally derive and upsert a real AgentStatus on state.agents.
  it("upserts state.agents[sourceAgentId] with a real derived AgentStatus when sourceAgentId is present", () => {
    const event = taskStatusChangedEvent("running", { sourceAgentId: "agent-1" });
    const result = reduce(emptyState(), event);
    expect(result.agents["agent-1"]).toEqual({
      id: "agent-1",
      status: AgentStatus.CODING,
      currentTaskId: "task-1",
      rawTaskStatus: "running",
    });
  });

  it("leaves state.agents untouched when sourceAgentId is absent from the same event type (no fabricated agent update)", () => {
    const event = taskStatusChangedEvent("running");
    const result = reduce(emptyState(), event);
    expect(result.agents).toEqual({});
  });
});

describe("gsd.phase_observed re-derives active agents' AgentStatus (Phase 5, 05-03)", () => {
  it("re-derives a running agent's fine-grained status when the company-wide GSD category shifts", () => {
    const withAgent = reduce(emptyState(), taskStatusChangedEvent("running", { sourceAgentId: "agent-1" }));
    expect(withAgent.agents["agent-1"].status).toBe(AgentStatus.CODING);

    const result = reduce(withAgent, {
      ...phaseObservedEvent(),
      payload: { status: "executing", category: "research", role: "Research Agent", active: true },
    });

    expect(result.agents["agent-1"].status).toBe(AgentStatus.RESEARCHING);
  });

  it("does not touch an agent whose rawTaskStatus is not starting/running", () => {
    const withAgent = reduce(emptyState(), taskStatusChangedEvent("completed", { sourceAgentId: "agent-1" }));
    expect(withAgent.agents["agent-1"].status).toBe(AgentStatus.COMPLETED);

    const result = reduce(withAgent, {
      ...phaseObservedEvent(),
      payload: { status: "executing", category: "research", role: "Research Agent", active: true },
    });

    expect(result.agents["agent-1"].status).toBe(AgentStatus.COMPLETED);
  });
});

function handoffCompletedEvent(): CompanyEvent {
  return {
    id: "event-handoff-completed-01",
    version: 1,
    occurredAt: "2026-09-20T00:00:01.000Z",
    companyId: "company-1",
    taskId: "task-1",
    visibility: "INTERNAL",
    type: "agent.handoff_completed",
    payload: { taskId: "task-1", toAgentId: "agent-2" },
  } as CompanyEvent;
}

describe("agent.handoff_completed (Phase 5, 05-03)", () => {
  it("upserts the receiving agent to AgentStatus.CODING", () => {
    const result = reduce(emptyState(), handoffCompletedEvent());
    expect(result.agents["agent-2"].status).toBe(AgentStatus.CODING);
  });
});

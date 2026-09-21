import { z } from "zod";
import { BaseEnvelope } from "../envelope";

const CompanyStartedPayload = z.object({ name: z.string() });
const FloorCreatedPayload = z.object({ name: z.string() });
const ProjectCreatedPayload = z.object({ name: z.string() });
const TaskCreatedPayload = z.object({ title: z.string() });
const AgentOnlinePayload = z.object({ name: z.string(), teamId: z.string() });
const SessionStartedPayload = z.object({ worktreeId: z.string() });
const AgentHandoffRequestedPayload = z.object({
  taskId: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string(),
});
// Phase 5 addition (HANDOFF-01): the completion side of a handoff — emitted
// once the receiving agent has actually accepted and started the task.
const AgentHandoffCompletedPayload = z.object({ taskId: z.string(), toAgentId: z.string() });
const ReviewStartedPayload = z.object({ taskId: z.string() });
const CeoApprovalRequestedPayload = z.object({ taskId: z.string(), reason: z.string() });
const GitCommitCreatedPayload = z.object({ sha: z.string(), message: z.string() });
const DeploymentStartedPayload = z.object({ environment: z.string() });
const ViewerEventPayload = z.object({ viewerName: z.string() });

// Phase 3 additions (RUNTIME-04, WORKTREE-01, GSD-01): worker.heartbeat carries
// no identity in its payload on purpose — the authenticated connection
// (request.workerId, set by worker-auth.ts) is the sole source of identity,
// never a client-supplied field (T-03-01 Tampering mitigation).
const WorkerHeartbeatPayload = z.object({});
const GitWorktreeObservedPayload = z.object({
  repoPath: z.string(),
  branch: z.string(),
  worktreePath: z.string(),
  headSha: z.string(),
  sessionId: z.string(),
});
// Phase 4 addition (RUNTIME-02): ClaudeCodeRuntime's own task-lifecycle status
// event — distinct from task.created's title-only payload. status covers the
// full AgentTaskStatus union (orchestration-adapter/src/types.ts) so any future
// AgentRuntime implementation can emit the same event shape.
const TaskStatusChangedPayload = z.object({
  taskId: z.string(),
  status: z.enum([
    "starting",
    "running",
    "paused",
    "blocked",
    "waiting_for_review",
    "waiting_for_handoff",
    "completed",
    "failed",
    "cancelled",
  ]),
});
const GsdPhaseObservedPayload = z.object({
  phase: z.string().optional(),
  status: z.enum(["planning", "executing", "verifying", "paused", "discussing", "completed", "unknown"]),
  category: z.enum([
    "new_project",
    "research",
    "requirements",
    "planning",
    "execution",
    "verification",
    "review",
    "approval",
    "deployment",
    // Phase 3 addition (GSD-01, T-03-07 mitigation): the gsd-adapter's own
    // kept prohibition requires resolving "unknown" for any status/file-
    // presence combination the category table doesn't recognize — omitting
    // it from this enum would make CompanyEventSchema.safeParse reject the
    // exact fallback event this mitigation depends on reaching the pipeline.
    "unknown",
  ]),
  role: z.enum(["PM", "Research Agent", "Architect", "Engineering", "QA", "Reviewer", "CEO", "DevOps", "unknown"]),
  active: z.boolean(),
});

// D-01: 12 seeded discriminated-union members, one per required category
// (company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer).
// Composed via spread, never chained `.extend()` (Pitfall 2: quadratic typecheck
// cost as the union grows toward ~40 members in later phases). Every payload is a
// plain z.object() (never z.looseObject()) so unrecognized extra keys are stripped
// rather than passed through to the reducer (Tampering mitigation, T-01-01).
export const CompanyEventSchema = z.discriminatedUnion("type", [
  z.object({ ...BaseEnvelope.shape, type: z.literal("company.started"), payload: CompanyStartedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("floor.created"), payload: FloorCreatedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("project.created"), payload: ProjectCreatedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("task.created"), payload: TaskCreatedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("agent.online"), payload: AgentOnlinePayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("session.started"), payload: SessionStartedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("agent.handoff_requested"), payload: AgentHandoffRequestedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("review.started"), payload: ReviewStartedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("ceo.approval_requested"), payload: CeoApprovalRequestedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("git.commit_created"), payload: GitCommitCreatedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("deployment.started"), payload: DeploymentStartedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("viewer.event"), payload: ViewerEventPayload }),
  // Phase 3 additions — union grows from 12 to 15, appended after the
  // original 12, never reordered (see comment above).
  z.object({ ...BaseEnvelope.shape, type: z.literal("worker.heartbeat"), payload: WorkerHeartbeatPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("git.worktree_observed"), payload: GitWorktreeObservedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("gsd.phase_observed"), payload: GsdPhaseObservedPayload }),
  // Phase 4 addition — union grows from 15 to 16, appended after the prior
  // 15, never reordered (see comment above).
  z.object({ ...BaseEnvelope.shape, type: z.literal("task.status_changed"), payload: TaskStatusChangedPayload }),
  // Phase 5 addition — union grows from 16 to 17.
  z.object({ ...BaseEnvelope.shape, type: z.literal("agent.handoff_completed"), payload: AgentHandoffCompletedPayload }),
]);

export type CompanyEvent = z.infer<typeof CompanyEventSchema>;

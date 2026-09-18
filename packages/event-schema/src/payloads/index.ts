import { z } from "zod";
import { BaseEnvelope } from "../envelope";

const CompanyStartedPayload = z.object({ name: z.string() });
const FloorCreatedPayload = z.object({ name: z.string() });
const ProjectCreatedPayload = z.object({ name: z.string() });
const TaskCreatedPayload = z.object({ title: z.string() });
const AgentOnlinePayload = z.object({ name: z.string(), teamId: z.string() });
const SessionStartedPayload = z.object({ worktreeId: z.string() });
const AgentHandoffRequestedPayload = z.object({ taskId: z.string(), toAgentId: z.string() });
const ReviewStartedPayload = z.object({ taskId: z.string() });
const CeoApprovalRequestedPayload = z.object({ taskId: z.string(), reason: z.string() });
const GitCommitCreatedPayload = z.object({ sha: z.string(), message: z.string() });
const DeploymentStartedPayload = z.object({ environment: z.string() });
const ViewerEventPayload = z.object({ viewerName: z.string() });

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
]);

export type CompanyEvent = z.infer<typeof CompanyEventSchema>;

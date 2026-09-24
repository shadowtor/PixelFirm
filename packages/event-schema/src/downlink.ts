import { z } from "zod";

// Phase 6 wire contract between the control plane and a worker's WebSocket.
// A closed set (SEC-03): the control plane can send a CEO decision or a
// resume request, and nothing else. No message carries a prompt, a command or
// tool input. Plain z.object() everywhere, so an extra key (an updatedInput,
// say) is stripped, never passed through.

export const DecisionActionSchema = z.enum(["approve", "reject", "request_changes", "more_research", "discuss"]);

export const WorkerDownlinkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("decision"),
    decisionId: z.string().uuid(),
    action: DecisionActionSchema,
    note: z.string().max(4000).optional(),
    answers: z.record(z.string().max(2000), z.string().max(2000)).optional(),
  }),
  z.object({
    type: z.literal("task.resume"),
    taskId: z.string(),
    sessionId: z.string().max(200),
    worktreePath: z.string().max(1000),
    agentId: z.string().max(200),
  }),
]);

// Worker -> control plane on open: bootId is randomUUID() per worker process.
export const WorkerUplinkSchema = z.object({ type: z.literal("hello"), bootId: z.string().uuid() });

export type DecisionAction = z.infer<typeof DecisionActionSchema>;
export type WorkerDownlink = z.infer<typeof WorkerDownlinkSchema>;
export type WorkerUplink = z.infer<typeof WorkerUplinkSchema>;

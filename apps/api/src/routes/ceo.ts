import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { CompanyEventSchema, DecisionActionSchema, WorkerDownlinkSchema } from "event-schema";
import { db } from "../db/client.js";
import { events } from "../db/schema.js";
import { requireCeo } from "../auth/ceo-auth.js";
import { requireCsrf } from "../auth/csrf.js";
import { isWorkerConnected, sendToWorker } from "../ws/worker-connections.js";
import { broadcastToBrowsers } from "../ws/browser-connections.js";

const NOTE_REQUIRED = new Set(["request_changes", "more_research", "discuss"]);

// SEC-03: action, note and answers only. There is no field for tool input, an
// updatedInput or a command; the worker approves its own parked input.
export const DecisionBodySchema = z
  .object({
    action: DecisionActionSchema,
    note: z.string().max(4000).optional(),
    answers: z.record(z.string().max(2000), z.string().max(2000)).optional(),
  })
  .superRefine((body, ctx) => {
    // D-07: these actions tell the agent what to do next, so they need words.
    // reject and approve may omit the note.
    if (NOTE_REQUIRED.has(body.action) && !body.note?.trim()) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "note required for this action" });
    }
  });

const ParamsSchema = z.object({ decisionId: z.string().uuid() });
const TaskParamsSchema = z.object({ taskId: z.string().min(1).max(200) });

type RequestPayload = {
  taskId: string;
  decisionId?: string;
  workerId?: string;
  kind?: string;
  sessionId?: string;
  worktreePath?: string;
};

export async function registerCeoRoute(fastify: FastifyInstance) {
  // Who the dashboard is signed in as (header, dev-bypass banner), and a way
  // to observe 401 that a failed WebSocket upgrade hides in browsers. No CSRF
  // guard: a same-origin GET may carry no Origin, and it changes nothing.
  fastify.get(
    "/ceo/api/me",
    { preValidation: requireCeo, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => ({ email: request.ceoEmail, devBypass: request.ceoDevBypass === true }),
  );

  fastify.post(
    "/ceo/api/decisions/:decisionId",
    {
      // D-12 first: nothing is looked up or authenticated for a cross-site request.
      preValidation: [requireCsrf, requireCeo],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      // Never log request.body or any payload here (T-02-03).
      const params = ParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid decisionId" });
      const body = DecisionBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
      const { decisionId } = params.data;
      const { action, note } = body.data;

      const [requestRow] = await db
        .select()
        .from(events)
        .where(
          and(eq(events.type, "ceo.approval_requested"), sql`${events.payload}->>'decisionId' = ${decisionId}`),
        )
        .limit(1);
      if (!requestRow) return reply.code(404).send({ error: "unknown decision" });

      const requestPayload = requestRow.payload as RequestPayload;
      // Answers only mean something for a clarifying question, where approve
      // must carry them; for any other kind they are dropped before the
      // insert and the downlink.
      const isQuestion = requestPayload.kind === "clarifying_question";
      const answers = isQuestion ? body.data.answers : undefined;
      if (isQuestion && action === "approve" && Object.keys(answers ?? {}).length === 0) {
        return reply.code(400).send({ error: "answers required" });
      }

      // CEO-05: one decision per request. Fast path for the common repeat; the
      // unique index below is what actually serializes concurrent POSTs.
      const settled = await db
        .select({ type: events.type })
        .from(events)
        .where(
          and(
            inArray(events.type, ["ceo.approval_expired", "ceo.decision_made"]),
            sql`${events.payload}->>'decisionId' = ${decisionId}`,
          ),
        );
      if (settled.some((r) => r.type === "ceo.approval_expired")) {
        return reply.code(409).send({ error: "expired" });
      }
      if (settled.length > 0) return reply.code(409).send({ error: "already decided" });

      // Stamped server-side by /events from the posting worker's credential.
      const workerId = requestPayload.workerId;
      // Offline: append nothing, so the parked call keeps waiting.
      if (!workerId || !isWorkerConnected(workerId)) {
        return reply.code(503).send({ error: "worker offline" });
      }

      const taskId = requestPayload.taskId;
      // D-04: this event is the audit record of the decision.
      const event = CompanyEventSchema.parse({
        id: randomUUID(),
        type: "ceo.decision_made",
        version: 1,
        occurredAt: new Date().toISOString(),
        companyId: requestRow.companyId,
        taskId,
        visibility: "PRIVATE",
        payload: {
          decisionId,
          taskId,
          action,
          ...(note !== undefined && { note }),
          ...(answers !== undefined && { answers }),
          decidedBy: request.ceoEmail,
        },
      });

      const inserted = await db
        .insert(events)
        .values({
          id: event.id,
          type: event.type,
          version: event.version,
          occurredAt: new Date(event.occurredAt),
          companyId: event.companyId,
          taskId: event.taskId,
          visibility: event.visibility,
          payload: event.payload,
        })
        // events_ceo_decision_once (0004): a concurrent decision won the race.
        .onConflictDoNothing()
        .returning({ id: events.id });
      if (inserted.length === 0) return reply.code(409).send({ error: "already decided" });

      // ponytail: a socket closing between the check above and this send leaves
      // the decision recorded but undelivered; the hello reconcile (RESEARCH
      // Pattern 4) resends recorded-but-unapplied decisions.
      sendToWorker(workerId, {
        type: "decision",
        decisionId,
        action,
        ...(note !== undefined && { note }),
        ...(answers !== undefined && { answers }),
      });
      broadcastToBrowsers({ type: "event", event });

      return reply.code(202).send({ accepted: true, decisionId });
    },
  );
  // D-02: the CEO resumes a task that a worker restart blocked. The message
  // carries only identifiers stored with the request, never a prompt (SEC-03),
  // and the worker still checks the worktree against its own repo.
  fastify.post(
    "/ceo/api/tasks/:taskId/resume",
    {
      preValidation: [requireCsrf, requireCeo],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const params = TaskParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid taskId" });
      const { taskId } = params.data;

      const [latest] = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.type, "ceo.approval_requested"),
            sql`${events.payload}->>'taskId' = ${taskId}`,
            sql`${events.payload}->>'decisionId' IS NOT NULL`,
          ),
        )
        .orderBy(desc(events.occurredAt))
        .limit(1);
      if (!latest) return reply.code(404).send({ error: "unknown task" });
      const stored = latest.payload as RequestPayload;

      const [expiry] = await db
        .select({ occurredAt: events.occurredAt })
        .from(events)
        .where(
          and(
            eq(events.type, "ceo.approval_expired"),
            sql`${events.payload}->>'decisionId' = ${stored.decisionId}`,
          ),
        )
        .limit(1);
      if (!expiry) return reply.code(409).send({ error: "not blocked" });

      // ponytail: two concurrent resumes can both pass this read; the worker's
      // restoreTask refuses a running task, so the second one does nothing.
      const [resumed] = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.type, "ceo.task_resume_requested"),
            sql`${events.payload}->>'taskId' = ${taskId}`,
            gt(events.occurredAt, expiry.occurredAt),
          ),
        )
        .limit(1);
      if (resumed) return reply.code(409).send({ error: "already resumed" });

      const { sessionId, worktreePath, workerId } = stored;
      const agentId = latest.sourceAgentId;
      if (!sessionId || !worktreePath || !agentId) return reply.code(409).send({ error: "not resumable" });
      // 06-REVIEW WR-12: validate before anything is recorded (sourceAgentId is
      // uncapped in the envelope, the downlink is not).
      const message = WorkerDownlinkSchema.safeParse({ type: "task.resume", taskId, sessionId, worktreePath, agentId });
      if (!message.success) return reply.code(409).send({ error: "not resumable" });
      if (!workerId || !isWorkerConnected(workerId)) return reply.code(503).send({ error: "worker offline" });
      // Send before recording: a resume the worker never received must stay
      // retryable, not turn into a permanent "already resumed".
      if (!sendToWorker(workerId, message.data)) return reply.code(503).send({ error: "worker offline" });

      const event = CompanyEventSchema.parse({
        id: randomUUID(),
        type: "ceo.task_resume_requested",
        version: 1,
        occurredAt: new Date().toISOString(),
        companyId: latest.companyId,
        taskId,
        visibility: "PRIVATE",
        payload: { taskId, decidedBy: request.ceoEmail },
      });
      await db.insert(events).values({
        id: event.id,
        type: event.type,
        version: event.version,
        occurredAt: new Date(event.occurredAt),
        companyId: event.companyId,
        taskId: event.taskId,
        visibility: event.visibility,
        payload: event.payload,
      });

      broadcastToBrowsers({ type: "event", event });

      return reply.code(202).send({ accepted: true, taskId });
    },
  );
}

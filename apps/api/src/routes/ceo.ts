import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { CompanyEventSchema, DecisionActionSchema } from "event-schema";
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

type RequestPayload = { taskId: string; workerId?: string; kind?: string };

export async function registerCeoRoute(fastify: FastifyInstance) {
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
}

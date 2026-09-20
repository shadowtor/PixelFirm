import type { FastifyInstance } from "fastify";
import { CompanyEventSchema } from "event-schema";
import { db } from "../db/client.js";
import { events } from "../db/schema.js";
import { authenticateWorker } from "../auth/worker-auth.js";
import { recordHeartbeat } from "../ws/connection-status.js";

export async function registerEventsRoute(fastify: FastifyInstance) {
  fastify.post(
    "/events",
    {
      preValidation: authenticateWorker,
      config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = CompanyEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const event = parsed.data;

      const inserted = await db
        .insert(events)
        .values({
          id: event.id,
          type: event.type,
          version: event.version,
          occurredAt: new Date(event.occurredAt),
          companyId: event.companyId,
          floorId: event.floorId,
          projectId: event.projectId,
          taskId: event.taskId,
          sourceAgentId: event.sourceAgentId,
          destinationAgentId: event.destinationAgentId,
          visibility: event.visibility,
          payload: event.payload,
        })
        .onConflictDoNothing({ target: events.id }) // D-04 dedup
        .returning({ id: events.id });

      if (inserted.length === 0) {
        // Conflict branch fired: this event.id already existed. Never log
        // event.payload here (T-02-03 — payload may carry secrets/PII from
        // future producers).
        fastify.log.warn(
          { eventId: event.id, eventType: event.type },
          "duplicate event id ignored (onConflictDoNothing)",
        );
      } else if (event.type === "worker.heartbeat") {
        // T-03-01 Tampering mitigation: key by the AUTHENTICATED
        // request.workerId, never event.payload — a worker must not be able
        // to report a heartbeat for a different workerId than the one its
        // credential authenticated as.
        recordHeartbeat(request.workerId as string);
      }

      return reply.code(202).send({ accepted: true });
    },
  );
}

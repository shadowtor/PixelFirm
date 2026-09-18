import type { FastifyInstance } from "fastify";
import { CompanyEventSchema } from "event-schema";
import { db } from "../db/client.js";
import { events } from "../db/schema.js";

export async function registerEventsRoute(fastify: FastifyInstance) {
  fastify.post("/events", async (request, reply) => {
    const parsed = CompanyEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const event = parsed.data;

    await db
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
      .onConflictDoNothing({ target: events.id }); // D-04 dedup

    return reply.code(202).send({ accepted: true });
  });
}

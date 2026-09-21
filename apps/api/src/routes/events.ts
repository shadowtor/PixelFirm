import type { FastifyInstance } from "fastify";
import { CompanyEventSchema } from "event-schema";
import { db } from "../db/client.js";
import { events } from "../db/schema.js";
import { authenticateWorker } from "../auth/worker-auth.js";
import { recordHeartbeat } from "../ws/connection-status.js";
import { broadcastToBrowsers } from "../ws/browser-connections.js";

// WR-03: authenticateWorker only proves "this is a valid, non-revoked
// worker credential" — it does not scope which event *types* that
// credential may submit. A worker process only ever originates these three
// types (apps/worker/src/event-emitter.ts, ws-client.ts); reject anything
// else before it reaches the reducer's shared projection state.
const WORKER_ALLOWED_EVENT_TYPES = new Set(["worker.heartbeat", "git.worktree_observed", "gsd.phase_observed"]);

export async function registerEventsRoute(fastify: FastifyInstance) {
  fastify.post(
    "/events",
    {
      preValidation: authenticateWorker,
      config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const requestedType = (request.body as { type?: unknown } | null)?.type;
      if (typeof requestedType !== "string" || !WORKER_ALLOWED_EVENT_TYPES.has(requestedType)) {
        return reply.code(403).send({ error: "event type not permitted for this credential" });
      }

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
      } else {
        if (event.type === "worker.heartbeat") {
          // T-03-01 Tampering mitigation: key by the AUTHENTICATED
          // request.workerId, never event.payload — a worker must not be
          // able to report a heartbeat for a different workerId than the
          // one its credential authenticated as.
          recordHeartbeat(request.workerId as string);
        }
        // Phase 5: relay every newly-inserted (non-duplicate) event to every
        // open browser socket. Same already-validated `event` object the
        // insert used — no re-derivation, no other change to this route's
        // existing WORKER_ALLOWED_EVENT_TYPES gate or dedup logic.
        broadcastToBrowsers({ type: "event", event });
      }

      return reply.code(202).send({ accepted: true });
    },
  );
}

import type { FastifyInstance } from "fastify";
import { CompanyEventSchema } from "event-schema";
import { db } from "../db/client.js";
import { events } from "../db/schema.js";
import { authenticateWorker } from "../auth/worker-auth.js";
import { recordHeartbeat } from "../ws/connection-status.js";
import { broadcastToBrowsers } from "../ws/browser-connections.js";

// WR-03: authenticateWorker only proves "this is a valid, non-revoked
// worker credential" — it does not scope which event *types* that
// credential may submit. A worker process/ClaudeCodeRuntime only ever
// originates these seven types (apps/worker/src/event-emitter.ts,
// ws-client.ts, packages/claude-adapter/src/claude-code-runtime.ts); reject
// anything else before it reaches the reducer's shared projection state.
// CR-01 (05-REVIEW.md): the original 3-member allow-list silently 403'd the
// 4 event types ClaudeCodeRuntime actually emits (task.status_changed,
// ceo.approval_requested, agent.handoff_requested, agent.handoff_completed).
const WORKER_ALLOWED_EVENT_TYPES = new Set([
  "worker.heartbeat",
  "git.worktree_observed",
  "gsd.phase_observed",
  "task.status_changed",
  "ceo.approval_requested",
  "agent.handoff_requested",
  "agent.handoff_completed",
  // Phase 6: the worker reports what it did with a decision, or that a parked
  // call was lost. Never ceo.decision_made or ceo.task_resume_requested: only
  // an authenticated CEO request authors those (T-06-13-03).
  "ceo.decision_applied",
  "ceo.approval_expired",
]);

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
      // T-06-13-07: every ceo.* event is CEO-only information.
      if (parsed.data.type.startsWith("ceo.") && parsed.data.visibility !== "PRIVATE") {
        return reply.code(400).send({ error: "ceo events must be PRIVATE" });
      }
      // T-03-01 rationale, as for the heartbeat below: the owning worker is the
      // AUTHENTICATED request.workerId, never a body field. Decisions are routed
      // back to exactly this worker (T-06-13-04), and the stored and relayed
      // event carry the same stamped value.
      const event =
        parsed.data.type === "ceo.approval_requested"
          ? { ...parsed.data, payload: { ...parsed.data.payload, workerId: request.workerId } }
          : parsed.data;

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

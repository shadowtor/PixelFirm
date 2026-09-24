// D-02 (RESEARCH Pattern 4): runs on every worker hello. A new bootId means
// the worker restarted and lost every call it had parked, so each open request
// expires and its task goes blocked (never approved). The same bootId means a
// reconnect: a decision that was recorded but never applied is sent again, and
// the worker's single-resolve broker makes the repeat harmless.
import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { CompanyEventSchema, type CompanyEvent, type DecisionAction } from "event-schema";
import { db } from "../db/client.js";
import { events } from "../db/schema.js";
import { broadcastToBrowsers } from "./browser-connections.js";
import { sendToWorker } from "./worker-connections.js";

type RequestPayload = { decisionId: string; taskId: string; workerBootId?: string };
type DecisionPayload = { decisionId: string; action: DecisionAction; note?: string; answers?: Record<string, string> };

/** Inserts a validated event; null when a unique index says it already exists. */
async function insertOnce(event: CompanyEvent): Promise<CompanyEvent | null> {
  const inserted = await db
    .insert(events)
    .values({
      id: event.id,
      type: event.type,
      version: event.version,
      occurredAt: new Date(event.occurredAt),
      companyId: event.companyId,
      taskId: event.taskId,
      sourceAgentId: event.sourceAgentId,
      visibility: event.visibility,
      payload: event.payload,
    })
    // events_ceo_decision_once (0004): a concurrent hello already expired it.
    .onConflictDoNothing()
    .returning({ id: events.id });
  return inserted.length > 0 ? event : null;
}

// 06-REVIEW WR-08: a task status (other than waiting/blocked) received after
// the decision means the worker applied it and carried on; only its
// ceo.decision_applied POST was lost. receivedAt is the control plane's own
// clock on both rows, so worker clock skew cannot decide this.
async function movedOnSince(taskId: string, decisionReceivedAt: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.type, "task.status_changed"),
        eq(events.taskId, taskId),
        gt(events.receivedAt, decisionReceivedAt),
        sql`${events.payload}->>'status' NOT IN ('waiting_for_review', 'blocked')`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * workerId is always the authenticated connection's identity, never a message
 * field, so a hello can only ever touch that worker's own requests. Never logs
 * payloads.
 */
export async function reconcileWorker(workerId: string, bootId: string, log: FastifyBaseLogger): Promise<void> {
  // ponytail: scans all of this worker's requests (no index on payload->>'workerId');
  // add an expression index if a worker's request history gets large.
  const requests = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.type, "ceo.approval_requested"),
        sql`${events.payload}->>'workerId' = ${workerId}`,
        sql`${events.payload}->>'decisionId' IS NOT NULL`,
      ),
    );
  if (requests.length === 0) return;

  const outcomes = await db
    .select({ type: events.type, payload: events.payload, receivedAt: events.receivedAt })
    .from(events)
    .where(
      and(
        inArray(events.type, ["ceo.decision_made", "ceo.decision_applied", "ceo.approval_expired"]),
        inArray(
          sql`${events.payload}->>'decisionId'`,
          requests.map((r) => (r.payload as RequestPayload).decisionId),
        ),
      ),
    );
  const closed = new Set<string>();
  const made = new Map<string, DecisionPayload>();
  const madeAt = new Map<string, Date>();
  for (const o of outcomes) {
    const p = o.payload as DecisionPayload;
    if (o.type === "ceo.decision_made") {
      made.set(p.decisionId, p);
      madeAt.set(p.decisionId, o.receivedAt);
    } else closed.add(p.decisionId);
  }

  let expired = 0;
  let redelivered = 0;
  for (const row of requests) {
    const { decisionId, taskId, workerBootId } = row.payload as RequestPayload;
    if (closed.has(decisionId)) continue;

    if (workerBootId !== bootId) {
      const decidedAt = madeAt.get(decisionId);
      if (decidedAt && (await movedOnSince(taskId, decidedAt))) continue;
      const now = new Date().toISOString();
      const expiry = await insertOnce(
        CompanyEventSchema.parse({
          id: randomUUID(),
          type: "ceo.approval_expired",
          version: 1,
          occurredAt: now,
          companyId: row.companyId,
          taskId,
          visibility: "PRIVATE",
          payload: { decisionId, taskId, reason: "worker_restarted" },
        }),
      );
      // Only the hello that recorded the expiry blocks the task, so a repeat
      // (or concurrent) hello adds nothing.
      if (!expiry) continue;
      broadcastToBrowsers({ type: "event", event: expiry });
      const blocked = CompanyEventSchema.parse({
        id: randomUUID(),
        type: "task.status_changed",
        version: 1,
        occurredAt: now,
        companyId: row.companyId,
        taskId,
        ...(row.sourceAgentId ? { sourceAgentId: row.sourceAgentId } : {}),
        visibility: "INTERNAL",
        payload: { taskId, status: "blocked" },
      });
      await insertOnce(blocked);
      broadcastToBrowsers({ type: "event", event: blocked });
      expired++;
      continue;
    }

    const decision = made.get(decisionId);
    if (decision) {
      sendToWorker(workerId, {
        type: "decision",
        decisionId,
        action: decision.action,
        ...(decision.note !== undefined && { note: decision.note }),
        ...(decision.answers !== undefined && { answers: decision.answers }),
      });
      redelivered++;
    }
  }
  if (expired > 0 || redelivered > 0) log.info({ workerId, expired, redelivered }, "worker hello reconciled");
}

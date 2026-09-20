import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { workers } from "../db/schema.js";
import { verifyCredential } from "./credentials.js";

// SEC-02: every rejection path returns the exact same 401 status/body,
// regardless of whether workerId is unknown, the secret is wrong, or the
// credential is revoked — this prevents worker-ID enumeration via response
// shape or timing (T-02-06). Shared by every route that requires a
// per-worker credential (GET /ws, POST /events).
const UNAUTHORIZED = { error: "unauthorized" } as const;

// Fixed dummy hash used to keep verifyCredential's timing uniform when no
// worker row is found at all (no real hash exists to compare against).
const DUMMY_HASH = "0".repeat(64);

// Phase 3: downstream handlers (ws.ts, events.ts) need the authenticated
// worker's identity without re-parsing the Authorization header themselves.
declare module "fastify" {
  interface FastifyRequest {
    workerId?: string;
  }
}

export async function authenticateWorker(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const match = authHeader?.match(/^Bearer (.+)$/);
  const token = match?.[1];
  const dotIndex = token?.indexOf(".") ?? -1;

  if (!token || dotIndex === -1) {
    reply.code(401).send(UNAUTHORIZED);
    return;
  }

  const workerId = token.slice(0, dotIndex);
  const secret = token.slice(dotIndex + 1);

  const worker = await db.query.workers.findFirst({ where: eq(workers.id, workerId) });

  if (!worker) {
    // Still run verifyCredential against a dummy hash so the response
    // timing doesn't betray "no such worker" vs. "wrong secret".
    verifyCredential(secret, DUMMY_HASH);
    reply.code(401).send(UNAUTHORIZED);
    return;
  }

  const validSecret = verifyCredential(secret, worker.secretHash);
  if (worker.revokedAt !== null || !validSecret) {
    reply.code(401).send(UNAUTHORIZED);
    return;
  }

  request.workerId = workerId;
  // Auth passed — return without replying so Fastify proceeds to the handler.
}

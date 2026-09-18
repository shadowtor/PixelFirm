import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { workers } from "../db/schema.js";
import { issueCredential } from "../auth/credentials.js";
import { env } from "../env.js";

// RESEARCH.md Pitfall 5: a naive `===` here reintroduces the same timing
// side-channel `verifyCredential` was built to avoid — length-normalized
// crypto.timingSafeEqual, exactly like the worker-credential comparison.
function requireBootstrapSecret(request: FastifyRequest, reply: FastifyReply): boolean {
  const header = request.headers["x-bootstrap-secret"];
  const provided = typeof header === "string" ? header : "";
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(env.BOOTSTRAP_SECRET);

  const ok =
    providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

  if (!ok) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

const IssueWorkerBody = z.object({
  label: z.string().min(1).max(200).optional(),
});

export async function registerAdminWorkersRoute(fastify: FastifyInstance) {
  fastify.post(
    "/admin/workers",
    async (request, reply) => {
      if (!requireBootstrapSecret(request, reply)) return;

      const parsed = IssueWorkerBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const workerId = randomUUID();
      const { token, secretHash } = issueCredential(workerId);

      const [row] = await db
        .insert(workers)
        .values({ id: workerId, secretHash, label: parsed.data.label ?? null })
        .returning({ id: workers.id, label: workers.label, createdAt: workers.createdAt });

      return reply.code(201).send({
        workerId: row.id,
        token,
        label: row.label,
        createdAt: row.createdAt,
      });
    },
  );

  fastify.get(
    "/admin/workers",
    async (request, reply) => {
      if (!requireBootstrapSecret(request, reply)) return;

      // Explicit column list — structurally excludes secretHash, never a
      // `select *` that could accidentally leak it (T-02-07).
      const rows = await db
        .select({
          id: workers.id,
          label: workers.label,
          createdAt: workers.createdAt,
          revokedAt: workers.revokedAt,
        })
        .from(workers);

      return reply.code(200).send(rows);
    },
  );

  fastify.post(
    "/admin/workers/:id/revoke",
    async (request, reply) => {
      if (!requireBootstrapSecret(request, reply)) return;

      const { id } = request.params as { id: string };
      const [row] = await db
        .update(workers)
        .set({ revokedAt: new Date() })
        .where(eq(workers.id, id))
        .returning({ id: workers.id, revokedAt: workers.revokedAt });

      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.code(200).send(row);
    },
  );
}

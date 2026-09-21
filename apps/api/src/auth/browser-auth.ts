import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

// Same enumeration-resistance posture as worker-auth.ts's UNAUTHORIZED
// const: every rejection path returns the exact same 401 status/body,
// regardless of whether the token was missing, the wrong length, or simply
// wrong (T-05-01 mitigation).
const UNAUTHORIZED = { error: "unauthorized" } as const;

// Phase 5: the first browser-facing connection into the control plane.
// Downstream handlers (ws-browser.ts) need to know auth succeeded without
// re-parsing the query string themselves.
declare module "fastify" {
  interface FastifyRequest {
    browserAuthed?: boolean;
  }
}

// A native browser WebSocket cannot set an Authorization header before the
// handshake completes, so the shared token travels as a query param instead
// (?token=...). Compared timing-safe against env.BROWSER_ACCESS_TOKEN using
// the exact length-check-then-timingSafeEqual pattern requireBootstrapSecret
// uses in apps/api/src/routes/admin-workers.ts — length mismatch is checked
// first because timingSafeEqual throws (not returns false) on unequal-length
// buffers.
export async function authenticateBrowser(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { token?: unknown } | null;
  const token = typeof query?.token === "string" ? query.token : "";

  const providedBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(env.BROWSER_ACCESS_TOKEN);

  const ok = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

  if (!ok) {
    reply.code(401).send(UNAUTHORIZED);
    return;
  }

  request.browserAuthed = true;
  // Auth passed — return without replying so Fastify proceeds to the handler.
}

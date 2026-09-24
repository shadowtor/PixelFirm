import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

// D-12, in the browser-auth.ts shape: one uniform 403 body for every refusal.
// Not @fastify/csrf-protection: /ceo auth is a Cloudflare Access cookie, so an
// exact Origin allowlist plus a custom header (which a cross-origin page cannot
// send without a CORS preflight this server never approves) is the defence.
const FORBIDDEN = { error: "forbidden" } as const;

/** Exact match against CEO_ALLOWED_ORIGINS; a missing Origin is refused. */
export async function requireOrigin(request: FastifyRequest, reply: FastifyReply) {
  const origin = request.headers.origin;
  if (!origin || !env.CEO_ALLOWED_ORIGINS.includes(origin)) {
    reply.code(403).send(FORBIDDEN);
  }
}

/** For state-changing POSTs: Origin, X-PixelFirm-CSRF: 1 and a JSON body, before any database work. */
export async function requireCsrf(request: FastifyRequest, reply: FastifyReply) {
  await requireOrigin(request, reply);
  if (reply.sent) return;
  const contentType = request.headers["content-type"] ?? "";
  if (request.headers["x-pixelfirm-csrf"] !== "1" || !contentType.startsWith("application/json")) {
    reply.code(403).send(FORBIDDEN);
  }
}

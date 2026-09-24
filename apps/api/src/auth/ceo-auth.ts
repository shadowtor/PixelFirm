import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

// Same uniform 401 body as worker-auth.ts / browser-auth.ts.
const UNAUTHORIZED = { error: "unauthorized" } as const;

declare module "fastify" {
  interface FastifyRequest {
    ceoEmail?: string;
    ceoDevBypass?: boolean;
  }
}

export const DEV_CEO_IDENTITY = "dev-bypass@pixelfirm.invalid";

export function isLoopbackAddress(addr: string | undefined): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

// D-11 / D-12. This plan ships only the fail-closed dev path: the bypass flag
// (which env.ts refuses in production) AND a loopback TCP peer. The peer is
// request.socket.remoteAddress, never request.ip: trustProxy makes request.ip
// follow X-Forwarded-For, which any client can set. 06-05 adds Cloudflare
// Access JWT verification inside this same function. BROWSER_ACCESS_TOKEN is
// never consulted here: the office viewer token must not authorize decisions.
export async function requireCeo(request: FastifyRequest, reply: FastifyReply) {
  if (env.CEO_DEV_AUTH_BYPASS && isLoopbackAddress(request.socket.remoteAddress)) {
    request.ceoEmail = DEV_CEO_IDENTITY;
    request.ceoDevBypass = true;
    return;
  }
  reply.code(401).send(UNAUTHORIZED);
}

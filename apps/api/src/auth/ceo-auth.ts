import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
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

type AccessVerifier = (token: string) => Promise<string>;

// D-11, Cloudflare "Validate JWTs": verify the Access application token
// against the team JWKS (jose caches it and refetches on an unknown kid, so
// the 6-weekly key rotation needs nothing here). RS256 only. A token without
// an email claim (a service token) is not a person and never the CEO.
export function makeAccessVerifier(opts: {
  teamDomain: string;
  audience: string;
  jwks?: JWTVerifyGetKey;
}): AccessVerifier {
  const keys = opts.jwks ?? createRemoteJWKSet(new URL(`${opts.teamDomain}/cdn-cgi/access/certs`));
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      issuer: opts.teamDomain,
      audience: opts.audience,
      algorithms: ["RS256"],
    });
    if (typeof payload.email !== "string") throw new Error("no email claim");
    return payload.email.toLowerCase();
  };
}

// undefined: not built yet; null: Access not configured (fail closed).
let verifier: AccessVerifier | null | undefined;

function accessVerifier(): AccessVerifier | null {
  if (verifier === undefined) {
    verifier =
      env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD
        ? makeAccessVerifier({ teamDomain: env.CF_ACCESS_TEAM_DOMAIN, audience: env.CF_ACCESS_AUD })
        : null;
  }
  return verifier;
}

export function _setAccessVerifierForTests(v: AccessVerifier | null) {
  verifier = v;
}

// Cloudflare recommends the header; the cookie is the fallback for requests
// where the header may be absent (RESEARCH A3: WebSocket upgrades).
function accessToken(request: FastifyRequest): string | undefined {
  const header = request.headers["cf-access-jwt-assertion"];
  if (typeof header === "string" && header) return header;
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "CF_Authorization" && value.length > 0) return value.join("=");
  }
  return undefined;
}

// D-11 / D-12. Two ways in, both fail closed:
// 1. Dev: the bypass flag (env.ts refuses it in production) AND a loopback TCP
//    peer. The peer is request.socket.remoteAddress, never request.ip:
//    trustProxy makes request.ip follow X-Forwarded-For, which any client sets.
// 2. Production: a Cloudflare Access JWT verified in-process (the header alone
//    proves nothing) whose email equals CEO_EMAIL.
// BROWSER_ACCESS_TOKEN is never consulted: the office viewer token must not
// authorize decisions. The token is never logged.
export async function requireCeo(request: FastifyRequest, reply: FastifyReply) {
  if (env.CEO_DEV_AUTH_BYPASS && isLoopbackAddress(request.socket.remoteAddress)) {
    request.ceoEmail = DEV_CEO_IDENTITY;
    request.ceoDevBypass = true;
    return;
  }
  const verify = accessVerifier();
  const token = accessToken(request);
  if (!verify || !token || !env.CEO_EMAIL) return reply.code(401).send(UNAUTHORIZED);
  let email: string;
  try {
    email = await verify(token);
  } catch {
    return reply.code(401).send(UNAUTHORIZED);
  }
  if (email !== env.CEO_EMAIL) return reply.code(401).send(UNAUTHORIZED);
  request.ceoEmail = email;
  request.ceoDevBypass = false;
}

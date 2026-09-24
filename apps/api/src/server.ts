import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyRateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerWsRoute } from "./routes/ws.js";
import { registerWsBrowserRoute } from "./routes/ws-browser.js";
import { registerAdminWorkersRoute } from "./routes/admin-workers.js";
import { registerCeoRoute } from "./routes/ceo.js";

// SEC-04 CSRF posture (RESEARCH.md Pattern 5): this API is authenticated only
// via required custom headers (X-Bootstrap-Secret, Authorization: Bearer),
// never cookies. That is a standalone, sufficient CSRF defense ONLY as long
// as no cross-origin resource sharing plugin is registered anywhere in this
// file — a permissive CORS policy would let a hostile page attach those
// headers via a preflight-approved cross-origin request. Do not register a
// cross-origin resource sharing plugin (or any other permissive cross-origin
// header) in this file.
export function buildServer() {
  const fastify = Fastify({
    // The Access JWT travels in a header and in the CF_Authorization cookie.
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers['x-bootstrap-secret']",
        "req.headers['cf-access-jwt-assertion']",
        "req.headers.cookie",
      ],
    },
    // Deployed behind Coolify's Traefik reverse proxy: without this, every
    // request's `request.ip` resolves to Traefik's own IP, so per-route rate
    // limits collapse into one shared bucket across all real clients.
    trustProxy: true,
  });

  // Pattern 4: registered globally disabled — every route opts in via its
  // own `config.rateLimit`, none are rate-limited by default.
  fastify.register(fastifyRateLimit, { global: false });

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.register(registerEventsRoute);
  fastify.register(fastifyWebsocket);
  fastify.register(registerWsRoute);
  fastify.register(registerWsBrowserRoute);
  fastify.register(registerCeoRoute);
  fastify.register(registerAdminWorkersRoute);

  return fastify;
}

// Keeps buildServer() importable/inject-able from tests without binding a
// real port. `file://${process.argv[1]}` breaks on Windows (backslashes,
// drive letters aren't valid file:// syntax) — pathToFileURL normalizes both
// sides so the comparison works cross-platform.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildServer().listen({ port: env.PORT, host: "0.0.0.0" });
}

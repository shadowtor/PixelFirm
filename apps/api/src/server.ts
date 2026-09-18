import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyRateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerWsRoute } from "./routes/ws.js";
import { registerAdminWorkersRoute } from "./routes/admin-workers.js";

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
    logger: { redact: ["req.headers.authorization", "req.headers['x-bootstrap-secret']"] },
  });

  // Pattern 4: registered globally disabled — every route opts in via its
  // own `config.rateLimit`, none are rate-limited by default.
  fastify.register(fastifyRateLimit, { global: false });

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.register(registerEventsRoute);
  fastify.register(fastifyWebsocket);
  fastify.register(registerWsRoute);
  fastify.register(registerAdminWorkersRoute);

  return fastify;
}

// Keeps buildServer() importable/inject-able from tests without binding a real port.
if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer().listen({ port: env.PORT, host: "0.0.0.0" });
}

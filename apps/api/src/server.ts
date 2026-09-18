import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { env } from "./env.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerWsRoute } from "./routes/ws.js";
import { registerAdminWorkersRoute } from "./routes/admin-workers.js";

export function buildServer() {
  const fastify = Fastify({
    logger: { redact: ["req.headers.authorization", "req.headers['x-bootstrap-secret']"] },
  });

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

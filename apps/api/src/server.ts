import Fastify from "fastify";
import { env } from "./env.js";
import { registerEventsRoute } from "./routes/events.js";

export function buildServer() {
  const fastify = Fastify({
    logger: { redact: ["req.headers.authorization"] },
  });

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.register(registerEventsRoute);

  return fastify;
}

// Keeps buildServer() importable/inject-able from tests without binding a real port.
if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer().listen({ port: env.PORT, host: "0.0.0.0" });
}

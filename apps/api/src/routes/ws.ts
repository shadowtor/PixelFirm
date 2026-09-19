import type { FastifyInstance } from "fastify";
import { authenticateWorker } from "../auth/worker-auth.js";

export async function registerWsRoute(fastify: FastifyInstance) {
  fastify.get(
    "/ws",
    {
      websocket: true,
      preValidation: authenticateWorker,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    (socket) => {
      // No broadcast logic yet — deferred to Phase 3+ per RESEARCH's
      // architecture diagram. This handler only proves the auth gate works.
      socket.on("close", () => {});
    },
  );
}

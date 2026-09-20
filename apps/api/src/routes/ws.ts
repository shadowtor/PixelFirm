import type { FastifyInstance } from "fastify";
import { authenticateWorker } from "../auth/worker-auth.js";
import { markSocketClosed, markSocketOpen } from "../ws/connection-status.js";

export async function registerWsRoute(fastify: FastifyInstance) {
  fastify.get(
    "/ws",
    {
      websocket: true,
      preValidation: authenticateWorker,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    (socket, request) => {
      // request.workerId is always set here — preValidation (authenticateWorker)
      // already succeeded, or the connection would never have reached this handler.
      const workerId = request.workerId as string;
      markSocketOpen(workerId);
      socket.on("close", () => {
        markSocketClosed(workerId);
      });
      socket.on("error", () => {
        markSocketClosed(workerId);
      });
    },
  );
}

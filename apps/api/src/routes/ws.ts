import type { FastifyInstance } from "fastify";
import { WorkerUplinkSchema } from "event-schema";
import { authenticateWorker } from "../auth/worker-auth.js";
import { markSocketClosed, markSocketOpen } from "../ws/connection-status.js";
import { registerWorkerSocket, unregisterWorkerSocket } from "../ws/worker-connections.js";
import { reconcileWorker } from "../ws/worker-reconcile.js";

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
      // Phase 6 downlink: keyed by the authenticated workerId, never a message field.
      registerWorkerSocket(workerId, socket);
      // The only uplink is hello (D-02). Anything else, or anything malformed,
      // is ignored and the socket stays open.
      socket.on("message", (data) => {
        let json: unknown;
        try {
          json = JSON.parse(data.toString());
        } catch {
          return;
        }
        const hello = WorkerUplinkSchema.safeParse(json);
        if (!hello.success) return;
        void reconcileWorker(workerId, hello.data.bootId, fastify.log).catch((err: unknown) =>
          fastify.log.error({ workerId, err: err instanceof Error ? err.message : String(err) }, "worker reconcile failed"),
        );
      });
      socket.on("close", () => {
        markSocketClosed(workerId);
        unregisterWorkerSocket(workerId, socket);
      });
      socket.on("error", () => {
        markSocketClosed(workerId);
        unregisterWorkerSocket(workerId, socket);
      });
    },
  );
}

import type { FastifyInstance } from "fastify";
import { fold } from "company-core";
import { authenticateBrowser } from "../auth/browser-auth.js";
import { registerBrowserSocket, unregisterBrowserSocket } from "../ws/browser-connections.js";
import { db } from "../db/client.js";
import { events } from "../db/schema.js";
import { rowToCompanyEvent } from "../db/event-row.js";

// Phase 5: the browser-facing counterpart to routes/ws.ts's worker route.
// Anti-Pattern (RESEARCH.md): the renderer must subscribe via this
// diff-fanout route, never poll company-core directly. Per Security Domain
// V4, this stays INTERNAL-tier only until Phase 7's visibility filtering
// ships — not exposed publicly (T-05-03, accepted).
export async function registerWsBrowserRoute(fastify: FastifyInstance) {
  fastify.get(
    "/ws/browser",
    {
      websocket: true,
      preValidation: authenticateBrowser,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (socket) => {
      registerBrowserSocket(socket);

      // Snapshot-on-connect: fold every stored event into a fresh
      // ProjectionState and send it as the first message, before any live
      // event relay. Real company-core fold() over real stored rows — never
      // a hardcoded/stubbed snapshot (must_haves.truths).
      const rows = await db.select().from(events).orderBy(events.occurredAt);
      const companyEvents = rows.map(rowToCompanyEvent);
      const state = fold(companyEvents);
      socket.send(JSON.stringify({ type: "snapshot", state }));

      socket.on("close", () => {
        unregisterBrowserSocket(socket);
      });
      socket.on("error", () => {
        unregisterBrowserSocket(socket);
      });
    },
  );
}

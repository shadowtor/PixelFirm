import type { FastifyInstance } from "fastify";
import { fold } from "company-core";
import { authenticateBrowser } from "../auth/browser-auth.js";
import { flushBrowserSocket, registerBrowserSocket, unregisterBrowserSocket } from "../ws/browser-connections.js";
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
      // Snapshot-on-connect: fold every stored event into a fresh
      // ProjectionState and send it as the first message, before any live
      // event relay. Real company-core fold() over real stored rows — never
      // a hardcoded/stubbed snapshot (must_haves.truths).
      //
      // CR-03: register BEFORE the awaited SELECT, not after the send.
      // Registering first closes the window in which an event committed
      // mid-SELECT was in neither the snapshot nor the relay, and so lost
      // for the life of the connection. Buffering rather than direct relay
      // is what preserves the "first message is always the snapshot"
      // guarantee the previous ordering was protecting — a registered socket
      // queues until flushBrowserSocket promotes it, which happens only
      // after the snapshot has gone out.
      registerBrowserSocket(socket);
      try {
        const rows = await db.select().from(events).orderBy(events.occurredAt);
        const companyEvents = rows.map(rowToCompanyEvent);
        const state = fold(companyEvents);
        socket.send(JSON.stringify({ type: "snapshot", state }));
        flushBrowserSocket(socket);
      } catch (err) {
        // Registering first means a thrown SELECT would otherwise leave a
        // registered socket accumulating a queue no snapshot will ever
        // precede. Drop the socket instead — deliberately NOT flushing,
        // since delivering live events to a client with no baseline is the
        // exact thing the original ordering existed to prevent.
        fastify.log.error({ err }, "ws/browser: snapshot failed, closing socket");
        unregisterBrowserSocket(socket);
        socket.close();
        return;
      }

      socket.on("close", () => {
        unregisterBrowserSocket(socket);
      });
      socket.on("error", () => {
        unregisterBrowserSocket(socket);
      });
    },
  );
}

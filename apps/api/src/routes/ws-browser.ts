import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { like, ne } from "drizzle-orm";
import { fold, foldDecisions } from "company-core";
import { authenticateBrowser } from "../auth/browser-auth.js";
import { requireCeo } from "../auth/ceo-auth.js";
import { requireOrigin } from "../auth/csrf.js";
import {
  acceptsCeo,
  acceptsOffice,
  flushBrowserSocket,
  registerBrowserSocket,
  unregisterBrowserSocket,
} from "../ws/browser-connections.js";
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
    (socket) =>
      serveSnapshotThenRelay(fastify, socket, "ws/browser", acceptsOffice, async () => {
        // Phase 6: the snapshot drops PRIVATE rows, matching acceptsOffice on
        // the live path (05-09 same-code rule), so decision content never
        // reaches the office in either (Pitfall 2).
        const rows = await db.select().from(events).where(ne(events.visibility, "PRIVATE")).orderBy(events.occurredAt, events.id);
        return fold(rows.map(rowToCompanyEvent));
      }),
  );

  // Phase 6 (CEO-02, Pattern 6): the dashboard feed. Browsers always send
  // Origin on a WebSocket upgrade and cannot set custom headers, so the exact
  // Origin allowlist is the D-12 check; requireCeo is the same Access JWT /
  // cookie guard as /ceo/api. Never a query-string token (Pitfall 8). The
  // snapshot is foldDecisions of the ceo.* rows; the dashboard applies the
  // same step to each relayed event.
  fastify.get(
    "/ceo/ws",
    {
      websocket: true,
      preValidation: [requireOrigin, requireCeo],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    (socket) =>
      serveSnapshotThenRelay(fastify, socket, "ceo/ws", acceptsCeo, async () => {
        const rows = await db.select().from(events).where(like(events.type, "ceo.%")).orderBy(events.occurredAt, events.id);
        return foldDecisions(rows.map(rowToCompanyEvent));
      }),
  );
}

async function serveSnapshotThenRelay(
  fastify: FastifyInstance,
  socket: WebSocket,
  label: string,
  accepts: Parameters<typeof registerBrowserSocket>[1],
  buildState: () => Promise<unknown>,
) {
  // Snapshot-on-connect: the first message is the state folded from real
  // stored rows (never a hardcoded/stubbed snapshot), before any live relay.
  //
  // CR-03: register BEFORE the awaited SELECT, not after the send.
  // Registering first closes the window in which an event committed
  // mid-SELECT was in neither the snapshot nor the relay, and so lost for the
  // life of the connection. Buffering rather than direct relay is what
  // preserves the "first message is always the snapshot" guarantee — a
  // registered socket queues until flushBrowserSocket promotes it, which
  // happens only after the snapshot has gone out.
  registerBrowserSocket(socket, accepts);
  try {
    const state = await buildState();
    socket.send(JSON.stringify({ type: "snapshot", state }));
    flushBrowserSocket(socket);
  } catch (err) {
    // Registering first means a thrown SELECT would otherwise leave a
    // registered socket accumulating a queue no snapshot will ever precede.
    // Drop the socket instead — deliberately NOT flushing, since delivering
    // live events to a client with no baseline is the exact thing the
    // original ordering existed to prevent.
    fastify.log.error({ err }, `${label}: snapshot failed, closing socket`);
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
}

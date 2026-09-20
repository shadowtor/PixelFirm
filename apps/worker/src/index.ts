import { pathToFileURL } from "node:url";
import { loadEnv } from "./env.js";
import { startHeartbeat, startReconnectingConnection } from "./ws-client.js";

/**
 * Wires env validation + WS connection + heartbeat into a single
 * importable/inject-able entrypoint, mirroring apps/api/src/server.ts's
 * buildServer() shape (importable for tests, self-starting when run
 * directly).
 */
export async function startWorker(): Promise<{ stop(): void }> {
  const env = await loadEnv();

  const connection = startReconnectingConnection(env.controlPlaneUrl, env.token);
  const heartbeat = startHeartbeat(env.controlPlaneUrl, env.token, env.companyId);

  return {
    stop(): void {
      connection.stop();
      heartbeat.stop();
    },
  };
}

// pathToFileURL (not a raw `file://${process.argv[1]}` string) for the same
// Windows-safety reason documented in apps/api/src/server.ts (backslashes and
// drive letters aren't valid file:// syntax without normalization).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorker().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

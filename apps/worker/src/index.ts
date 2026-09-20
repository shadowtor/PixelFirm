import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { loadEnv } from "./env.js";
import { startHeartbeat, startReconnectingConnection } from "./ws-client.js";
import { startPollLoop } from "./poll-loop.js";

/**
 * Wires env validation + WS connection + heartbeat + poll loop into a
 * single importable/inject-able entrypoint, mirroring
 * apps/api/src/server.ts's buildServer() shape (importable for tests,
 * self-starting when run directly).
 */
export async function startWorker(): Promise<{ stop(): void }> {
  const env = await loadEnv();

  const connection = startReconnectingConnection(env.controlPlaneUrl, env.token);
  const heartbeat = startHeartbeat(env.controlPlaneUrl, env.token, env.companyId);
  // phaseId left undefined here — CR-02: gsd-adapter's observeGsdState now
  // derives it itself from STATE.md's `current_phase` on every tick when no
  // override is supplied, so this does NOT short-circuit category/role
  // observation. ROADMAP-checkbox-reading integration is still not wired
  // here (Plan 03's flagged GSD-01 assumption already documents
  // "deployment"/"approval" as proxy/unreachable).
  const pollLoop = startPollLoop({
    repoPath: env.repoPath,
    planningDir: join(env.repoPath, ".planning"),
    phaseId: undefined,
    companyId: env.companyId,
    controlPlaneUrl: env.controlPlaneUrl,
    token: env.token,
  });

  return {
    stop(): void {
      connection.stop();
      heartbeat.stop();
      pollLoop.stop();
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

import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createClaudeCodeRuntime } from "claude-adapter";
import { createDecisionBroker } from "./decisions.js";
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

  // 06-04 (D-01): the runtime parks every CEO-gated call on the broker, and
  // the broker is resolved only by decision frames on this worker's own socket.
  const broker = createDecisionBroker();
  const runtime = createClaudeCodeRuntime({
    companyId: env.companyId,
    controlPlaneUrl: env.controlPlaneUrl,
    token: env.token,
    awaitDecision: broker.awaitDecision,
    workerBootId: broker.bootId,
  });

  const connection = startReconnectingConnection(env.controlPlaneUrl, env.token, (ws) => {
    ws.send(JSON.stringify(broker.helloMessage()));
    ws.on("message", (data) => broker.handleDownlink(data.toString()));
  });
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

  // SEC-03: the only task this worker starts is the one its own env names.
  if (env.task) {
    const { taskId, prompt, agentId, title } = env.task;
    runtime
      .startTask({ taskId, repoPath: env.repoPath, worktreePath: env.repoPath, prompt, agentId, ...(title ? { title } : {}) })
      .catch((err: unknown) => console.error(`Worker task ${taskId} failed:`, err instanceof Error ? err.message : err));
  }

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

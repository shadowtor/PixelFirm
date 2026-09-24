import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { execa } from "execa";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompanyEventSchema, WorkerUplinkSchema } from "event-schema";
import { startWorker } from "./index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeFixtureRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "worker-integration-"));
  await execa("git", ["init"], { cwd: dir });
  await execa("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execa("git", ["config", "user.name", "Test"], { cwd: dir });
  await execa("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir });

  const planningDir = join(dir, ".planning");
  await mkdir(planningDir);
  await writeFile(join(planningDir, "STATE.md"), "---\nstatus: executing\ncurrent_phase: 1\n---\n\n# State\n");

  return dir;
}

// A lightweight local stub — no real apps/api or Postgres dependency, keeping
// this package's own test suite DB-free per 03-VALIDATION.md's ~30s
// feedback-latency target. Accepts any Bearer token (a real auth gate is
// apps/api's own already-tested concern, not re-tested here) and records
// every event body POSTed to it.
describe("apps/worker full-pipeline integration", () => {
  let httpServer: Server;
  let wss: WebSocketServer;
  let port: number;
  let repoPath: string;
  let receivedEvents: unknown[];
  let wsFrames: string[];

  beforeAll(async () => {
    receivedEvents = [];
    httpServer = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/events") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        req.on("end", () => {
          try {
            receivedEvents.push(JSON.parse(body));
          } catch {
            // ignore malformed body — not this test's concern
          }
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ accepted: true }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    wss = new WebSocketServer({ server: httpServer, path: "/ws" });
    wss.on("connection", (socket) => {
      socket.on("message", (data) => wsFrames.push(data.toString()));
    });

    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const address = httpServer.address();
    port = typeof address === "object" && address ? address.port : 0;
  });

  afterAll(async () => {
    wss.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(async () => {
    receivedEvents = [];
    wsFrames = [];
    repoPath = await makeFixtureRepo();
    process.env.CONTROL_PLANE_URL = `http://127.0.0.1:${port}`;
    process.env.WORKER_TOKEN = "worker-1.integrationsecret";
    process.env.WORKER_COMPANY_ID = "company-1";
    process.env.WORKER_REPO_PATH = repoPath;
  });

  afterEach(async () => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.WORKER_TOKEN;
    delete process.env.WORKER_COMPANY_ID;
    delete process.env.WORKER_REPO_PATH;
    await sleep(50);
    await rm(repoPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it(
    "startWorker() emits schema-valid git.worktree_observed and worker.heartbeat events, and stop() halts all timers cleanly",
    async () => {
      const worker = await startWorker();

      // tick()/heartbeat both fire once immediately on start, so ~1s is
      // ample margin beyond "roughly one poll interval" for the async
      // git/gsd observation + heartbeat POST to land.
      await sleep(1000);

      expect(receivedEvents.length).toBeGreaterThan(0);

      const types = receivedEvents.map((e) => (e as { type: string }).type);
      expect(types).toContain("git.worktree_observed");
      expect(types).toContain("worker.heartbeat");

      for (const event of receivedEvents) {
        const result = CompanyEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }

      // Only structural keys — never raw file contents, diffs, or env values.
      const worktreeEvent = receivedEvents.find((e) => (e as { type: string }).type === "git.worktree_observed") as
        | { payload: Record<string, unknown> }
        | undefined;
      expect(worktreeEvent).toBeDefined();
      expect(Object.keys(worktreeEvent!.payload).sort()).toEqual([
        "branch",
        "headSha",
        "repoPath",
        "sessionId",
        "worktreePath",
      ]);

      // 06-04: the first frame on the worker's WebSocket is its hello.
      expect(wsFrames.length).toBeGreaterThan(0);
      const hello = WorkerUplinkSchema.safeParse(JSON.parse(wsFrames[0]!));
      expect(hello.success).toBe(true);
      expect(hello.data?.type).toBe("hello");

      worker.stop();
      const countAfterStop = receivedEvents.length;
      await sleep(1000);
      expect(receivedEvents.length).toBe(countAfterStop);
    },
    10_000,
  );
});

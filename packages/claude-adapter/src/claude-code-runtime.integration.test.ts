import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { execa } from "execa";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorktrees, isGitWorktree } from "git-adapter";
import { CompanyEventSchema } from "event-schema";
import { createClaudeCodeRuntime } from "./claude-code-runtime.js";
import type { AgentTaskStatus } from "orchestration-adapter";

// D-05: the real, currently-unplanned SyncSmith repository this demo runs
// against — never a fixture repo, since this is the one test in the phase
// meant to prove the full real path (RUNTIME-02).
const SYNCSMITH_REPO_PATH = "F:/Sidegigs/syncsmith";

const TERMINAL_STATUSES: AgentTaskStatus[] = ["completed", "failed", "blocked", "waiting_for_review", "cancelled"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// git worktree list --porcelain always reports forward-slash paths; mkdtemp
// on Windows returns backslash paths. Normalize before comparing so the
// isolation check below never false-negatives on separator/case alone.
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

// Gated: exercises the real, authenticated `claude` CLI/SDK (no
// ANTHROPIC_API_KEY) against the real SyncSmith repository, inside a
// disposable, fully-cleaned-up git worktree. The default
// `pnpm --filter claude-adapter test` run reports this describe block as
// skipped, never failed, and never requires real Claude Code auth —
// only `CLAUDE_CODE_INTEGRATION_TEST=1 pnpm --filter claude-adapter run
// test:integration` actually runs it. Task 2 adds the real `it()` block
// that drives ClaudeCodeRuntime itself; this file currently establishes
// the fixture setup (local stub control-plane server + disposable,
// verified-isolated worktree) only.
describe.skipIf(process.env.CLAUDE_CODE_INTEGRATION_TEST !== "1")(
  "ClaudeCodeRuntime real integration demo (RUNTIME-01/RUNTIME-02, disposable SyncSmith worktree)",
  () => {
    let httpServer: Server;
    let wss: WebSocketServer;
    let port: number;
    let receivedEvents: unknown[];
    let worktreePath: string;
    let branchName: string;

    // Lightweight local stub — mirrors
    // apps/worker/src/index.integration.test.ts's exact pattern (lines
    // 41-69): a real HTTP+WS endpoint for postEvent to succeed against (no
    // real apps/api or Postgres dependency), accepting any bearer token.
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

      await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
      const address = httpServer.address();
      port = typeof address === "object" && address ? address.port : 0;
    });

    afterAll(async () => {
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    // Creates a disposable, verified-isolated git worktree against the real
    // SyncSmith repository — a brand-new mkdtemp'd path outside SyncSmith's
    // own directory tree, on a throwaway branch, never SyncSmith's own main
    // worktree/branch (D-05, RUNTIME-02's kept prohibition).
    beforeEach(async () => {
      receivedEvents = [];
      branchName = `pixelfirm-demo-${Date.now()}`;
      worktreePath = await mkdtemp(join(tmpdir(), "pixelfirm-demo-"));

      await execa("git", ["worktree", "add", "-b", branchName, worktreePath], {
        cwd: SYNCSMITH_REPO_PATH,
      });

      // Verify the new worktree is real and distinct from SyncSmith's main
      // worktree before this file ever calls startTask against it.
      const worktrees = await listWorktrees(SYNCSMITH_REPO_PATH);
      expect(worktrees.length).toBeGreaterThanOrEqual(2);
      const mainPathNorm = normalizePath(SYNCSMITH_REPO_PATH);
      const disposableEntry = worktrees.find((w) => normalizePath(w.path) !== mainPathNorm);
      expect(disposableEntry).toBeDefined();
      await expect(isGitWorktree(disposableEntry!.path)).resolves.toBe(true);
    });

    it(
      "drives a real ClaudeCodeRuntime task to a terminal status against the real SyncSmith repository",
      async () => {
        const runtime = createClaudeCodeRuntime({
          companyId: "demo-syncsmith",
          controlPlaneUrl: `http://127.0.0.1:${port}`,
          token: "demo-token",
        });

        const taskId = "demo-task-1";
        // D-06: a real, currently-unplanned GSD workflow step from
        // SyncSmith's actual roadmap (Phase 1 still shows "Plans: TBD", no
        // CONTEXT.md yet — the smallest, fastest, lowest-risk genuine GSD
        // workflow step) — never a trivial "create a file and commit it"
        // string.
        const prompt = "/gsd-discuss-phase 1";

        let terminalStatus: AgentTaskStatus | undefined;

        try {
          try {
            await runtime.startTask({
              taskId,
              repoPath: SYNCSMITH_REPO_PATH,
              worktreePath,
              prompt,
            });

            const deadline = Date.now() + 600_000;
            let status = await runtime.getStatus(taskId);
            while (!TERMINAL_STATUSES.includes(status) && Date.now() < deadline) {
              await sleep(2000);
              status = await runtime.getStatus(taskId);
            }
            terminalStatus = status;

            expect(TERMINAL_STATUSES).toContain(terminalStatus);

            for (const event of receivedEvents) {
              const result = CompanyEventSchema.safeParse(event);
              expect(result.success).toBe(true);
            }

            const statusChangedForTask = receivedEvents.filter(
              (e) =>
                (e as { type?: string }).type === "task.status_changed" &&
                (e as { payload?: { taskId?: string } }).payload?.taskId === taskId,
            ) as { payload: { status: string } }[];
            expect(statusChangedForTask.length).toBeGreaterThan(0);
            expect(statusChangedForTask[statusChangedForTask.length - 1]!.payload.status).toBe(terminalStatus);
          } finally {
            // D-07: evidence is written unconditionally, before any
            // cleanup — even if the assertions above threw — so a failing
            // or ambiguous run still leaves a permanent record.
            const evidencePath = join(
              import.meta.dirname,
              "..",
              "..",
              "..",
              ".planning",
              "phases",
              "04-agentruntime-claudecoderuntime",
              "04-04-demo-evidence.md",
            );
            const evidence = [
              "# 04-04 Demo Evidence",
              "",
              `Generated: ${new Date().toISOString()}`,
              "",
              'SyncSmith phase targeted: Phase 1 — Foundation & Self-Hosted Deployment (lowest-numbered phase still showing "Plans: TBD" at execution time; no CONTEXT.md existed yet).',
              `GSD slash-command used as startTask's prompt: \`${prompt}\``,
              `Disposable worktree path: \`${worktreePath}\``,
              `Disposable branch: \`${branchName}\``,
              `Terminal status: \`${terminalStatus ?? "UNKNOWN — run/assertions failed before a terminal status was reached"}\``,
              "",
              "## Received Events",
              "",
              "```json",
              JSON.stringify(receivedEvents, null, 2),
              "```",
              "",
            ].join("\n");
            await writeFile(evidencePath, evidence, "utf8");
          }
        } finally {
          // Only after the evidence file is written, remove the disposable
          // worktree and branch. Plain `-d` (never `-D`/`--force`) — if
          // removal fails because the worktree has uncommitted changes,
          // that error surfaces rather than being forced away.
          await execa("git", ["worktree", "remove", worktreePath], { cwd: SYNCSMITH_REPO_PATH });
          await execa("git", ["branch", "-d", branchName], { cwd: SYNCSMITH_REPO_PATH });
        }
      },
      600_000,
    );
  },
);

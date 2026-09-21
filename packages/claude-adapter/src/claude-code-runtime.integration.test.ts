import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocketServer } from "ws";
import { execa } from "execa";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorktrees, isGitWorktree } from "git-adapter";
import { CompanyEventSchema } from "event-schema";
import { createClaudeCodeRuntime } from "./claude-code-runtime.js";
import type { AgentTaskStatus } from "orchestration-adapter";

// Real-subprocess PID observation (Windows only — this project's actual dev
// environment). `tasklist` lists live `claude.exe` PIDs; diffing a snapshot
// taken while a task is genuinely "running" against one taken after
// pauseTask/cancelTask's grace period proves the OS-level subprocess itself
// terminated, not just that the in-memory TaskRecord.status flipped — the
// exact gap 04-VERIFICATION.md's Human Verification item 1 flagged (unit
// tests only ever exercise a mocked query() stream, never a real spawned
// process). On non-Windows platforms this check is skipped, not faked green.
async function listClaudePids(): Promise<Set<string>> {
  if (process.platform !== "win32") return new Set();
  const { stdout } = await execa("tasklist", ["/FI", "IMAGENAME eq claude.exe", "/FO", "CSV", "/NH"]);
  const pids = new Set<string>();
  for (const line of stdout.split("\n")) {
    const fields = line.split('","').map((f) => f.replace(/^"|"$/g, ""));
    if (fields[1]) pids.add(fields[1]);
  }
  return pids;
}

// D-05: the real, currently-unplanned SyncSmith repository this demo runs
// against — never a fixture repo, since this is the one test in the phase
// meant to prove the full real path (RUNTIME-02).
const SYNCSMITH_REPO_PATH = "F:/Sidegigs/syncsmith";

const TERMINAL_STATUSES: AgentTaskStatus[] = ["completed", "failed", "blocked", "waiting_for_review", "cancelled"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Observed live: Windows can hold a brief handle on a just-vacated worktree
// directory (AV scan / delayed OS handle release). `git worktree remove`
// unregisters the worktree from .git/worktrees FIRST, then deletes the
// directory last — so a failure here can mean the directory delete step
// alone failed (registration already gone). A naive retry that re-runs
// `git worktree remove` on that second pass then fails differently ("is not
// a working tree", since git no longer recognizes it as a worktree at all).
// Recover by checking what actually happened rather than blindly repeating
// the same command: if the path is already gone (or git already prunes it
// as stale), we're done; otherwise fall back to a direct filesystem removal
// with the same backoff, then prune git's administrative state either way.
async function removeWorktreeWithRetry(repoPath: string, worktreePath: string): Promise<void> {
  const delaysMs = [1000, 2000, 4000];
  try {
    await execa("git", ["worktree", "remove", worktreePath], { cwd: repoPath });
    return;
  } catch {
    // Fall through to manual recovery below.
  }
  for (let attempt = 0; ; attempt++) {
    if (!existsSync(worktreePath)) break;
    try {
      await rm(worktreePath, { recursive: true, force: true });
      break;
    } catch (err) {
      if (attempt >= delaysMs.length) throw err;
      await sleep(delaysMs[attempt]!);
    }
  }
  // Clears the now-dangling .git/worktrees/<name> registration left behind
  // by the failed `git worktree remove` above — never throws on an
  // already-clean state.
  await execa("git", ["worktree", "prune"], { cwd: repoPath });
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
              agentId: "demo-agent-1",
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
          await removeWorktreeWithRetry(SYNCSMITH_REPO_PATH, worktreePath);
          await execa("git", ["branch", "-d", branchName], { cwd: SYNCSMITH_REPO_PATH });
        }
      },
      600_000,
    );

    // Closes 04-VERIFICATION.md's Human Verification item 1: the existing
    // unit suite (claude-code-runtime.test.ts) only ever exercises pauseTask
    // against a mocked query() generator. The SDK's own sdk.d.ts documents
    // that graceful Query.interrupt() is "only supported when streaming
    // input/output is used" (this codebase's calls use a plain string
    // prompt), so the REAL termination guarantee is the AbortController
    // hard-abort fallback forwarded into the SDK's real subprocess spawn —
    // that fallback has never been observed against a real, live `claude`
    // process before this test. Real subprocess presence/absence is
    // observed via `tasklist` (Windows-only; see listClaudePids).
    it(
      "pauseTask stops the real underlying claude subprocess, not just the in-memory status (D-03)",
      async () => {
        const runtime = createClaudeCodeRuntime({
          companyId: "demo-syncsmith",
          controlPlaneUrl: `http://127.0.0.1:${port}`,
          token: "demo-token",
        });
        const taskId = "demo-pause-task";
        const prompt = "/gsd-discuss-phase 1";

        try {
          const baselinePids = await listClaudePids();
          const startPromise = runtime.startTask({
            taskId,
            repoPath: SYNCSMITH_REPO_PATH,
            worktreePath,
            prompt,
            agentId: "demo-agent-1",
          });

          // Wait for the task to reach "running" — init message received,
          // session_id captured — the documented pauseTask precondition.
          const runningDeadline = Date.now() + 60_000;
          let status: AgentTaskStatus = await runtime.getStatus(taskId);
          while (status !== "running" && !TERMINAL_STATUSES.includes(status) && Date.now() < runningDeadline) {
            await sleep(500);
            status = await runtime.getStatus(taskId);
          }
          expect(status).toBe("running");

          // The new claude.exe PID(s) that appeared once this task went
          // "running" — this test's real spawned subprocess.
          const runningPids = await listClaudePids();
          const spawnedPids = [...runningPids].filter((p) => !baselinePids.has(p));

          await runtime.pauseTask(taskId);
          expect(await runtime.getStatus(taskId)).toBe("paused");

          // Let the underlying runQuery promise settle now that pause
          // triggered the graceful-then-hard-abort path.
          await Promise.race([startPromise, sleep(15_000)]);

          // pauseTask's own attemptGracefulStop already waited up to
          // GRACEFUL_TIMEOUT_MS before returning; give the SDK's documented
          // internal stdin-EOF + ~2s grace window a little extra buffer to
          // land in the OS process table.
          await sleep(5000);

          if (process.platform === "win32") {
            if (spawnedPids.length > 0) {
              const afterPids = await listClaudePids();
              for (const pid of spawnedPids) {
                expect(afterPids.has(pid)).toBe(false);
              }
            } else {
              throw new Error(
                "pauseTask real-subprocess test: no distinct new claude.exe PID was observed to verify termination against — test setup gave no evidence, not a pass",
              );
            }
          }
        } finally {
          await removeWorktreeWithRetry(SYNCSMITH_REPO_PATH, worktreePath);
          await execa("git", ["branch", "-d", branchName], { cwd: SYNCSMITH_REPO_PATH });
        }
      },
      120_000,
    );

    it(
      "cancelTask terminates the real underlying claude subprocess, not just the in-memory status (D-03)",
      async () => {
        const runtime = createClaudeCodeRuntime({
          companyId: "demo-syncsmith",
          controlPlaneUrl: `http://127.0.0.1:${port}`,
          token: "demo-token",
        });
        const taskId = "demo-cancel-task";
        const prompt = "/gsd-discuss-phase 1";

        try {
          const baselinePids = await listClaudePids();
          const startPromise = runtime.startTask({
            taskId,
            repoPath: SYNCSMITH_REPO_PATH,
            worktreePath,
            prompt,
            agentId: "demo-agent-1",
          });

          const runningDeadline = Date.now() + 60_000;
          let status: AgentTaskStatus = await runtime.getStatus(taskId);
          while (status !== "running" && !TERMINAL_STATUSES.includes(status) && Date.now() < runningDeadline) {
            await sleep(500);
            status = await runtime.getStatus(taskId);
          }
          expect(status).toBe("running");

          const runningPids = await listClaudePids();
          const spawnedPids = [...runningPids].filter((p) => !baselinePids.has(p));

          await runtime.cancelTask(taskId);
          expect(await runtime.getStatus(taskId)).toBe("cancelled");

          await Promise.race([startPromise, sleep(15_000)]);
          await sleep(5000);

          if (process.platform === "win32") {
            if (spawnedPids.length > 0) {
              const afterPids = await listClaudePids();
              for (const pid of spawnedPids) {
                expect(afterPids.has(pid)).toBe(false);
              }
            } else {
              throw new Error(
                "cancelTask real-subprocess test: no distinct new claude.exe PID was observed to verify termination against — test setup gave no evidence, not a pass",
              );
            }
          }
        } finally {
          await removeWorktreeWithRetry(SYNCSMITH_REPO_PATH, worktreePath);
          await execa("git", ["branch", "-d", branchName], { cwd: SYNCSMITH_REPO_PATH });
        }
      },
      120_000,
    );
  },
);

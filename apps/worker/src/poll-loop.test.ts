import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { execa } from "execa";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("./event-emitter.js", () => ({
  buildEnvelope: vi.fn((companyId: string, type: string, payload: unknown) => ({ companyId, type, payload })),
  postEvent: vi.fn(async () => {}),
}));

// isAnyClaudeProcessAlive is real-environment-dependent (whether a
// claude.exe/claude process happens to be running) — mocked here to make the
// dual-signal `active` computation (D-02) deterministic. listWorktrees stays
// real against the temp fixture repo below.
vi.mock("git-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("git-adapter")>();
  return { ...actual, isAnyClaudeProcessAlive: vi.fn(async () => true) };
});

import { postEvent } from "./event-emitter.js";
import { isAnyClaudeProcessAlive } from "git-adapter";
import { startPollLoop } from "./poll-loop.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Every tick spawns real `git` subprocesses, so a fixed sleep races the poll
// interval: under CPU contention (the other worker test files, or a parallel
// workspace run) a tick lands outside the window and a positive assertion sees
// too few events. Wait for the expected count instead of a wall-clock guess.
// Absence assertions ("zero more events") keep a fixed sleep — a slow tick
// cannot falsify those.
// 3s, not 5s: test 1 makes two waits inside a 10s it() timeout, so a larger
// budget lets a genuinely broken loop hit the opaque "Test timed out" instead
// of the assertion shortfall this helper exists to report.
async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) return; // let the caller's expect() report the real shortfall
    await sleep(10);
  }
}

async function makeFixtureRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "poll-loop-test-"));
  await execa("git", ["init"], { cwd: dir });
  await execa("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execa("git", ["config", "user.name", "Test"], { cwd: dir });
  await execa("git", ["commit", "--allow-empty", "-m", "init"], { cwd: dir });

  const planningDir = join(dir, ".planning");
  await mkdir(planningDir);
  await writeFile(join(planningDir, "STATE.md"), "---\nstatus: executing\ncurrent_phase: 1\n---\n\n# State\n");

  return dir;
}

type EventCall = [string, string, { type: string; companyId: string; payload: Record<string, unknown> }];

describe("startPollLoop", () => {
  let repoPath: string;
  let planningDir: string;
  let loop: { stop(): void } | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    (isAnyClaudeProcessAlive as unknown as Mock).mockResolvedValue(true);
    repoPath = await makeFixtureRepo();
    planningDir = join(repoPath, ".planning");
  });

  afterEach(async () => {
    loop?.stop();
    loop = null;
    // A tick's async execa/fs calls may still be releasing OS file handles
    // right after stop() clears the interval — a small settle delay plus
    // fs.rm's own retry avoids a transient Windows EBUSY on the temp dir.
    await sleep(50);
    await rm(repoPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  function callsOfType(type: string): EventCall[] {
    return (postEvent as unknown as Mock).mock.calls.filter((call) => call[2].type === type) as EventCall[];
  }

  it(
    "emits exactly one git.worktree_observed + one gsd.phase_observed on the first tick, zero more while nothing changes, then a delta after HEAD advances",
    async () => {
      loop = startPollLoop({
        repoPath,
        planningDir,
        phaseId: undefined,
        companyId: "company-1",
        controlPlaneUrl: "http://localhost:3000",
        token: "worker-1.secret",
        intervalMs: 40,
      });

      // Let the baseline tick land, with nothing on disk changing.
      await waitFor(() => callsOfType("git.worktree_observed").length >= 1 && callsOfType("gsd.phase_observed").length >= 1);
      expect(callsOfType("git.worktree_observed")).toHaveLength(1);
      expect(callsOfType("gsd.phase_observed")).toHaveLength(1);

      // A second batch of identical ticks must emit zero new events.
      await sleep(200);
      expect(callsOfType("git.worktree_observed")).toHaveLength(1);
      expect(callsOfType("gsd.phase_observed")).toHaveLength(1);

      // Advance HEAD — the next tick must emit exactly one new
      // git.worktree_observed reflecting the new headSha, keyed by
      // worktreePath (never array index).
      await execa("git", ["commit", "--allow-empty", "-m", "second"], { cwd: repoPath });
      await waitFor(() => callsOfType("git.worktree_observed").length >= 2);

      const worktreeCalls = callsOfType("git.worktree_observed");
      expect(worktreeCalls).toHaveLength(2);
      expect(worktreeCalls[1][2].payload.headSha).not.toBe(worktreeCalls[0][2].payload.headSha);
      // git always emits forward-slash paths (verified in 03-RESEARCH.md
      // Pattern 3); normalize the Windows-native repoPath the same way
      // before comparing sessionId, which is sourced from git's own output.
      expect(worktreeCalls[1][2].payload.sessionId).toBe(repoPath.replace(/\\/g, "/"));
    },
    10_000,
  );

  it(
    "never reports active from process-liveness alone — requires recent file activity too",
    async () => {
      loop = startPollLoop({
        repoPath,
        planningDir,
        phaseId: undefined,
        companyId: "company-1",
        controlPlaneUrl: "http://localhost:3000",
        token: "worker-1.secret",
        intervalMs: 40,
      });

      // isAnyClaudeProcessAlive resolves true throughout, but nothing on
      // disk changes after the first (baseline) tick — active must never be
      // true from a stale process-alive signal alone.
      await waitFor(() => callsOfType("gsd.phase_observed").length >= 1);
      await sleep(300);

      const gsdCalls = callsOfType("gsd.phase_observed");
      expect(gsdCalls.length).toBeGreaterThan(0); // never pass vacuously on a slow tick
      for (const call of gsdCalls) {
        // Any gsd event emitted after the baseline tick implies a real
        // change occurred; none should carry active: true without a
        // corresponding disk change, and the baseline tick itself is never
        // active (no "previous tick" to have changed since).
        expect(call[2].payload.active).toBe(false);
      }
    },
    10_000,
  );

  it(
    "poll-loop.ts computes `active`, never packages/gsd-adapter — verified by payload shape only carrying structural fields",
    async () => {
      loop = startPollLoop({
        repoPath,
        planningDir,
        phaseId: undefined,
        companyId: "company-1",
        controlPlaneUrl: "http://localhost:3000",
        token: "worker-1.secret",
        intervalMs: 40,
      });

      await waitFor(() => callsOfType("gsd.phase_observed").length >= 1);

      const gsdCalls = callsOfType("gsd.phase_observed");
      expect(gsdCalls.length).toBeGreaterThan(0);
      for (const call of gsdCalls) {
        expect(Object.keys(call[2].payload).sort()).toEqual(["active", "category", "phase", "role", "status"]);
      }

      const worktreeCalls = callsOfType("git.worktree_observed");
      for (const call of worktreeCalls) {
        expect(Object.keys(call[2].payload).sort()).toEqual([
          "branch",
          "headSha",
          "repoPath",
          "sessionId",
          "worktreePath",
        ]);
      }
    },
    10_000,
  );

  it(
    "continues ticking after a listWorktrees failure (transient git error is logged, not fatal)",
    async () => {
      const badRepoPath = join(repoPath, "does-not-exist");
      loop = startPollLoop({
        repoPath: badRepoPath,
        planningDir,
        phaseId: undefined,
        companyId: "company-1",
        controlPlaneUrl: "http://localhost:3000",
        token: "worker-1.secret",
        intervalMs: 30,
      });

      // No git.worktree_observed should ever fire (listWorktrees always
      // fails against a nonexistent path), but the loop must keep running —
      // proven by the gsd.phase_observed side still firing on the baseline
      // tick (gsd observation is independent of git-adapter's failure).
      await waitFor(() => callsOfType("gsd.phase_observed").length >= 1);
      expect(callsOfType("git.worktree_observed")).toHaveLength(0);
      expect(callsOfType("gsd.phase_observed").length).toBeGreaterThanOrEqual(1);
    },
    10_000,
  );
});

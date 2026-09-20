import { statSync } from "node:fs";
import { join } from "node:path";
import { isAnyClaudeProcessAlive, listWorktrees } from "git-adapter";
import { observeGsdState } from "gsd-adapter";
import { buildEnvelope, postEvent } from "./event-emitter.js";

interface WorktreeSnapshot {
  headSha?: string;
  branch?: string;
}

interface GsdSnapshot {
  phase: string | undefined;
  status: string;
  category: string;
  role: string;
  active: boolean;
}

export interface StartPollLoopOptions {
  repoPath: string;
  planningDir: string;
  phaseId: string | undefined;
  companyId: string;
  controlPlaneUrl: string;
  token: string;
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 2500;

/**
 * D-01 poll-diff loop combining git-adapter + gsd-adapter into real,
 * delta-only CompanyEvents. Maintains closure-scoped last-seen state and
 * emits only for genuine changes, never on every tick regardless of change
 * (D-01, D-02).
 */
export function startPollLoop(options: StartPollLoopOptions): { stop(): void } {
  const { repoPath, planningDir, phaseId, companyId, controlPlaneUrl, token, intervalMs = DEFAULT_INTERVAL_MS } =
    options;

  const worktrees = new Map<string, WorktreeSnapshot>();
  let gsd: GsdSnapshot | null = null;
  let stateMdMtimeMs: number | null = null;
  // The very first tick establishes a baseline — nothing has "changed since
  // the previous tick" yet (there is no previous tick), so `active` must
  // never be true on tick 1 purely from freshly-discovered state. Without
  // this, tick 1 would compute active=true (baseline treated as "changed")
  // and tick 2 (genuinely unchanged) would compute active=false, flipping
  // the gsd.phase_observed payload and violating "a second, identical poll
  // tick emits zero events."
  let isFirstTick = true;

  async function tick(): Promise<void> {
    let anyWorktreeChange = false;

    try {
      const records = await listWorktrees(repoPath);
      for (const record of records) {
        const previous = worktrees.get(record.path);
        const changed = !previous || previous.headSha !== record.headSha || previous.branch !== record.branch;
        if (changed) {
          anyWorktreeChange = true;
          worktrees.set(record.path, { headSha: record.headSha, branch: record.branch });
          const payload = {
            repoPath,
            branch: record.branch ?? "unknown",
            worktreePath: record.path,
            headSha: record.headSha ?? "unknown",
            // Real observed worktree path, never a fabricated agent name
            // (this plan's kept values prohibition, T-03-12).
            sessionId: record.path,
          };
          await postEvent(controlPlaneUrl, token, buildEnvelope(companyId, "git.worktree_observed", payload));
        }
      }
    } catch (err) {
      // A transient git failure is logged and skipped, never crashes the
      // loop (Plan 02's flagged adjacency assumption).
      console.error("poll-loop: listWorktrees failed, skipping this tick's git observation", err);
    }

    let currentMtimeMs: number | null;
    try {
      currentMtimeMs = statSync(join(planningDir, "STATE.md")).mtimeMs;
    } catch {
      currentMtimeMs = null;
    }
    const mtimeChanged = currentMtimeMs !== null && currentMtimeMs !== stateMdMtimeMs;
    stateMdMtimeMs = currentMtimeMs;

    // Computed here in poll-loop.ts, never inside packages/gsd-adapter
    // (which stays a pure, stateless observer per Plan 03's design).
    const recentFileActivity = !isFirstTick && (anyWorktreeChange || mtimeChanged);

    try {
      const processAlive = await isAnyClaudeProcessAlive();
      const observed = await observeGsdState(planningDir, phaseId, false);
      // Never true from process-liveness alone (Pitfall 1's mitigation, D-02).
      const active = processAlive && recentFileActivity;

      const next: GsdSnapshot = {
        phase: observed.phase,
        status: observed.status,
        category: observed.category,
        role: observed.role,
        active,
      };

      const changed =
        !gsd ||
        gsd.phase !== next.phase ||
        gsd.status !== next.status ||
        gsd.category !== next.category ||
        gsd.role !== next.role ||
        gsd.active !== next.active;

      if (changed) {
        gsd = next;
        const payload = {
          phase: next.phase,
          status: next.status,
          category: next.category,
          role: next.role,
          active: next.active,
        };
        await postEvent(controlPlaneUrl, token, buildEnvelope(companyId, "gsd.phase_observed", payload));
      }
    } catch (err) {
      console.error("poll-loop: gsd observation failed, skipping this tick's gsd observation", err);
    }

    isFirstTick = false;
  }

  // Run once immediately so the worker's first observation doesn't wait a
  // full intervalMs, then continue on the interval.
  void tick();
  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    stop(): void {
      clearInterval(handle);
    },
  };
}

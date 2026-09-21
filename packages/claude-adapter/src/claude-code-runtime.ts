import { join } from "node:path";
import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { observeGsdState } from "gsd-adapter";
import type { AgentRuntime, AgentTaskStatus, StartTaskInput } from "orchestration-adapter";
import { buildEnvelope, postEvent } from "./event-emitter.js";
import { classifySignal } from "./signal-detection.js";
import { createWatchdog, DEFAULT_WATCHDOG_TIMEOUT_MS } from "./watchdog.js";

interface TaskRecord {
  sessionId?: string;
  status: AgentTaskStatus;
  worktreePath?: string;
  // Phase 5 addition (HANDOFF-01): the owning agent for this task — set once
  // in startTask from StartTaskInput.agentId, read by emitStatus/requestHandoff
  // to thread identity through every event this runtime emits for the task.
  agentId: string;
  controller?: AbortController;
  runPromise?: Promise<void>;
  handle?: Query;
  lastRole?: string;
  // CR-03: true only while a runQuery invocation for this task is actually
  // in flight (set right before the stream starts, cleared in its finally
  // block). Distinct from `controller`/`handle`, which are set once and
  // never reset — this is the one field that reflects "is there something
  // to stop right now."
  inFlight?: boolean;
}

// CR-02: once a task reaches one of these, its controller/handle are stale
// leftovers from the last (already-settled) invocation — pauseTask/
// cancelTask must refuse to act on them rather than silently flipping an
// already-terminal task's status.
const TERMINAL_STATUSES: AgentTaskStatus[] = ["completed", "failed", "cancelled"];

// D-03's grace period for cancelTask/pauseTask's "did the process exit after
// we asked nicely" wait — distinct from and much shorter than the watchdog's
// hang-detection window (that answers "has anything happened at all").
const GRACEFUL_TIMEOUT_MS = 5000;

// D-08 source 1: role-change poll interval, matching
// apps/worker/src/poll-loop.ts's DEFAULT_INTERVAL_MS convention (a plan-
// specified numeric constant, not necessarily the identical 2500ms value —
// see this plan's Task 2 action text).
const ROLE_POLL_INTERVAL_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Factory function (not a class — matches this codebase's function-first
 * style, mirroring git-adapter/gsd-adapter/poll-loop.ts) returning an
 * AgentRuntime backed by one real @anthropic-ai/claude-agent-sdk query() call
 * per task, authenticated purely via the existing `claude` CLI subscription
 * login (RUNTIME-02) — never reads/logs/forwards ANTHROPIC_API_KEY or any
 * `~/.claude/` OAuth credential; the SDK's own default credential resolution
 * handles auth.
 */
export function createClaudeCodeRuntime(options: {
  companyId: string;
  controlPlaneUrl: string;
  token: string;
}): AgentRuntime {
  const tasks = new Map<string, TaskRecord>();

  async function emitStatus(taskId: string, status: AgentTaskStatus): Promise<void> {
    const sourceAgentId = tasks.get(taskId)?.agentId;
    await postEvent(
      options.controlPlaneUrl,
      options.token,
      buildEnvelope(options.companyId, "task.status_changed", { taskId, status }, taskId, undefined, sourceAgentId),
    );
  }

  // D-08: real, non-stub requestReview — fired by canUseTool (AskUserQuestion
  // / CEO-gated Bash) and the Notification hook, both wired below in
  // runQuery. Always sets waiting_for_review and posts ceo.approval_requested
  // (reusing Phase 1's existing discriminated-union member) — no Phase 6 CEO
  // dashboard exists yet to grant approval, so this is detection-only.
  async function requestReview(taskId: string, reason: string): Promise<void> {
    const record = tasks.get(taskId);
    if (record) record.status = "waiting_for_review";
    await emitStatus(taskId, "waiting_for_review");
    await postEvent(
      options.controlPlaneUrl,
      options.token,
      buildEnvelope(options.companyId, "ceo.approval_requested", { taskId, reason }, taskId),
    );
  }

  // D-08 source 1: real, non-stub requestHandoff — fired by the role-change
  // poll wired below in runQuery (gsd-adapter's reused observeGsdState, never
  // a second .planning/ parser). Deliberately observation-only: does not
  // touch the task's own AgentTaskStatus, since no second agent exists yet in
  // Phase 4 to actually receive control (CONTEXT.md domain boundary).
  async function requestHandoff(taskId: string, toAgentId: string): Promise<void> {
    // Never fabricate a placeholder fromAgentId (Core Value) — matches
    // getStatus's own unknown-taskId guard below.
    const fromAgentId = tasks.get(taskId)?.agentId;
    if (!fromAgentId) {
      throw new Error(`ClaudeCodeRuntime.requestHandoff: task ${taskId} has no known agentId`);
    }
    await postEvent(
      options.controlPlaneUrl,
      options.token,
      buildEnvelope(options.companyId, "agent.handoff_requested", { taskId, fromAgentId, toAgentId }, taskId),
    );
  }

  // Phase 5 addition (HANDOFF-01): completes a handoff. Mirrors
  // requestHandoff's postEvent/buildEnvelope shape exactly. This
  // single-session simulation has no separate receiving process yet (Phase
  // 6+ multi-agent orchestration territory) — the role-change poll below
  // fires this immediately after requestHandoff, since the observed role
  // transition IS the completion signal here, not a genuinely asynchronous
  // second event (T-05-08, accepted).
  async function completeHandoff(taskId: string, toAgentId: string): Promise<void> {
    // CR-02 (05-REVIEW.md): reassign ownership BEFORE posting the completion
    // event, so every emitStatus call for this taskId made after this point
    // (the same in-flight runQuery's subsequent result/watchdog/pause/cancel
    // paths, or any later call) reads the receiving agent's ID, never the
    // stale original sender's.
    const record = tasks.get(taskId);
    if (record) record.agentId = toAgentId;
    await postEvent(
      options.controlPlaneUrl,
      options.token,
      buildEnvelope(options.companyId, "agent.handoff_completed", { taskId, toAgentId }, taskId),
    );
  }

  // Shared for-await message loop — startTask (prompt = input.prompt, no
  // resume), resumeTask, and sendMessage all call this instead of each
  // duplicating the stream-handling logic. Each invocation creates its own
  // AbortController and stores the running Query handle on the task's map
  // entry so pauseTask/cancelTask can act on the currently in-flight call.
  async function runQuery(taskId: string, prompt: string, resumeSessionId?: string): Promise<void> {
    const record = tasks.get(taskId);
    if (!record) throw new Error(`ClaudeCodeRuntime.runQuery: unknown taskId ${taskId}`);

    // CR-03: a prior invocation for this taskId is still in flight (e.g.
    // resumeTask/sendMessage called while the task is still "running", or a
    // genuine double-call) — starting a second concurrent query() here would
    // silently orphan the first invocation's controller/watchdog/poll-
    // interval, leaving pauseTask/cancelTask unable to control it. Properly
    // stop the existing invocation first, via the same graceful-then-hard-
    // abort path pauseTask/cancelTask use, before taking over the record.
    if (record.inFlight) {
      const exitedCleanly = await attemptGracefulStop(record);
      if (!exitedCleanly) record.controller?.abort();
    }

    const controller = new AbortController();
    record.controller = controller;
    record.inFlight = true;

    const stream = query({
      prompt,
      options: {
        cwd: record.worktreePath,
        permissionMode: "default",
        resume: resumeSessionId,
        abortController: controller,
        // CR-01: the SDK's own env option REPLACES (not merges with)
        // process.env when set, and inherits the full process.env when
        // omitted (sdk.d.ts QueryOptions.env). A stray ANTHROPIC_API_KEY in
        // this process's own environment must never leak into the
        // subprocess and silently override CLI subscription auth (this
        // package's documented never-forward guarantee) — so env is always
        // explicitly set here, spreading process.env for everything else
        // (PATH, HOME, etc.) but actively stripping the key.
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ANTHROPIC_API_KEY")),
        // D-08 signal #1: fires for AskUserQuestion and any Bash command
        // matching classifySignal's CEO-gated allowlist. Always returns
        // "deny" for a classified signal — never auto-approve (ARCHITECTURE.md
        // Anti-Pattern 2) — the actual human-approval mechanism is Phase 6's
        // job; Phase 4 only guarantees the signal fires and is surfaced.
        canUseTool: async (toolName, input) => {
          const signal = classifySignal(toolName, input);
          if (!signal) return { behavior: "allow", updatedInput: input };
          await requestReview(taskId, signal.reason);
          return {
            behavior: "deny",
            message: `Escalated to CEO for review (taskId=${taskId}) — no Phase 6 dashboard exists yet to grant approval; see the ceo.approval_requested event.`,
          };
        },
        // D-08 signal #2: independent secondary signal — fires ~6s after an
        // unanswered canUseTool wait, per 04-RESEARCH.md Pattern 4 (2). Rarely
        // fires in practice since this implementation's canUseTool is
        // synchronous, but it remains correct defensive wiring, directly
        // unit-tested by invoking the hook function independent of live
        // canUseTool timing.
        hooks: {
          Notification: [
            {
              hooks: [
                async (hookInput) => {
                  await requestReview(
                    taskId,
                    `permission_prompt: ${(hookInput as { message?: string }).message ?? "unanswered ~6s"}`,
                  );
                  return {};
                },
              ],
            },
          ],
        },
      },
    });
    record.handle = stream;

    // D-04: one watchdog per invocation. Resets on every yielded message of
    // any type (not just result) and fires the bounded-silence "blocked"
    // transition only if the timer expires with zero resets since the last
    // one — mirrors the same graceful-then-hard-kill mechanism cancelTask
    // uses, just with a different terminal status (blocked, not cancelled).
    const watchdog = createWatchdog(DEFAULT_WATCHDOG_TIMEOUT_MS, () => {
      void (async () => {
        const exitedCleanly = await attemptGracefulStop(record);
        if (!exitedCleanly) controller.abort();
        record.status = "blocked";
        await emitStatus(taskId, "blocked");
      })();
    });

    // D-08 source 1: role-change poll, one per invocation (same lifecycle as
    // the watchdog above) — reuses gsd-adapter's observeGsdState rather than
    // re-parsing .planning/ (04-RESEARCH.md's named Anti-Pattern). The first
    // tick only records a baseline role (mirrors poll-loop.ts's isFirstTick
    // guard) so a first observation is never itself treated as a "change".
    // Only started when a worktreePath is known (always true for a real
    // startTask/resumeTask/sendMessage call).
    let isFirstRoleTick = true;
    const rolePoll = record.worktreePath
      ? setInterval(() => {
          void (async () => {
            try {
              const observed = await observeGsdState(join(record.worktreePath!, ".planning"), undefined, false);
              if (isFirstRoleTick) {
                isFirstRoleTick = false;
                record.lastRole = observed.role;
                return;
              }
              if (observed.role !== record.lastRole) {
                record.lastRole = observed.role;
                await requestHandoff(taskId, observed.role);
                // Phase 5: fire completeHandoff back-to-back with
                // requestHandoff — see completeHandoff's own comment.
                await completeHandoff(taskId, observed.role);
              }
            } catch (err) {
              console.error(`ClaudeCodeRuntime.runQuery: role-poll failed for task ${taskId}`, err);
            }
          })();
        }, ROLE_POLL_INTERVAL_MS)
      : undefined;

    const runPromise = (async () => {
      watchdog.reset();
      try {
        for await (const message of stream) {
          watchdog.reset();
          if (message.type === "system" && message.subtype === "init") {
            record.sessionId = message.session_id;
            // A captured session_id and no result yet means the turn is
            // actively in-flight (pauseTask/sendMessage's "mid-stream"
            // precondition) — an in-memory transition only, no event.
            record.status = "running";
          } else if (message.type === "result") {
            // startTask/resumeTask/sendMessage must never report success on
            // an error result — only the "success" subtype completes; every
            // other subtype fails.
            const status: AgentTaskStatus = message.subtype === "success" ? "completed" : "failed";
            record.status = status;
            await emitStatus(taskId, status);
          }
        }
      } catch (err) {
        // Never crash the caller on a non-terminal stream error — log and
        // continue, matching apps/worker/src/poll-loop.ts's pattern.
        console.error(`ClaudeCodeRuntime.runQuery: stream error for task ${taskId}`, err);
      } finally {
        // A completed task's watchdog must never fire after the fact —
        // clear on every exit path (result received, graceful/hard cancel,
        // or an uncaught stream error). The role poll is cleared here too —
        // no tick should fire once the task has reached a terminal status.
        watchdog.clear();
        if (rolePoll) clearInterval(rolePoll);
        // CR-03: this invocation is no longer in flight — safe for a
        // subsequent runQuery call (resumeTask/sendMessage) to take over.
        record.inFlight = false;
      }
    })();
    record.runPromise = runPromise;
    await runPromise;
  }

  // Best-effort graceful stop shared by pauseTask/cancelTask (D-03): calls
  // the SDK's Query.interrupt() control request (per the installed
  // package's sdk.d.ts, this is "only supported when streaming input/output
  // is used" — runQuery's calls use a plain string prompt, so interrupt()
  // may reject or no-op here; that's fine, the grace-period race below is
  // the actual termination guarantee, not the interrupt call itself), then
  // waits up to GRACEFUL_TIMEOUT_MS for the in-flight runPromise to settle.
  // Returns true if it exited cleanly within the window, false if the
  // caller must hard-abort.
  async function attemptGracefulStop(record: TaskRecord): Promise<boolean> {
    try {
      await record.handle?.interrupt();
    } catch {
      // interrupt() is documented as streaming-input-only; a rejection here
      // just means "no clean interrupt available for this call shape" — the
      // grace-period + hard-abort fallback below still applies.
    }
    if (!record.runPromise) return true;
    return Promise.race([record.runPromise.then(() => true), sleep(GRACEFUL_TIMEOUT_MS).then(() => false)]);
  }

  return {
    async startTask(input: StartTaskInput): Promise<void> {
      tasks.set(input.taskId, { status: "starting", worktreePath: input.worktreePath, agentId: input.agentId });
      // Fire the "starting" event before the query() loop begins, not after.
      await emitStatus(input.taskId, "starting");
      await runQuery(input.taskId, input.prompt);
    },

    async getStatus(taskId: string): Promise<AgentTaskStatus> {
      const record = tasks.get(taskId);
      // Never invent state (Core Value) — an unknown taskId throws rather
      // than returning a fabricated status.
      if (!record) throw new Error("ClaudeCodeRuntime.getStatus: unknown taskId");
      return record.status;
    },

    async pauseTask(taskId: string): Promise<void> {
      const record = tasks.get(taskId);
      // CR-02: record.controller is set once and never reset, so its mere
      // presence does not mean the task is still running — also refuse a
      // stray/duplicate call once the task has already reached a terminal
      // status, so it can never be silently flipped away from completed/
      // failed/cancelled.
      if (!record || !record.controller || TERMINAL_STATUSES.includes(record.status)) {
        throw new Error("ClaudeCodeRuntime.pauseTask: task is not running");
      }
      const exitedCleanly = await attemptGracefulStop(record);
      if (!exitedCleanly) record.controller.abort();
      // The session_id used for a later resume is whatever was captured
      // during runQuery's init message handling, available before pause is
      // even possible (04-RESEARCH.md Pattern 2).
      record.status = "paused";
      await emitStatus(taskId, "paused");
    },

    async resumeTask(taskId: string): Promise<void> {
      const record = tasks.get(taskId);
      if (!record || !record.sessionId) {
        throw new Error("ClaudeCodeRuntime.resumeTask: no captured session to resume");
      }
      await runQuery(taskId, "Continue the task from where you left off", record.sessionId);
    },

    async cancelTask(taskId: string): Promise<void> {
      const record = tasks.get(taskId);
      // CR-02: see pauseTask — a stale controller from an already-settled
      // invocation must not let a duplicate/late cancelTask flip an
      // already-terminal task's status.
      if (!record || !record.controller || TERMINAL_STATUSES.includes(record.status)) {
        throw new Error("ClaudeCodeRuntime.cancelTask: task is not running");
      }
      // D-03: graceful stop first; if the query() call has not exited
      // within the bounded grace period, hard-abort to guarantee
      // termination. Status becomes "cancelled" either way.
      const exitedCleanly = await attemptGracefulStop(record);
      if (!exitedCleanly) record.controller.abort();
      record.status = "cancelled";
      await emitStatus(taskId, "cancelled");
    },

    async sendMessage(taskId: string, message: string): Promise<void> {
      const record = tasks.get(taskId);
      if (!record || !record.sessionId) {
        throw new Error("ClaudeCodeRuntime.sendMessage: no captured session to send a message to");
      }
      // The caller-supplied message becomes the new turn's prompt —
      // documented interpretation, see Plan 04-02's Task 1 Behavior Test 3.
      await runQuery(taskId, message, record.sessionId);
    },

    requestReview,
    requestHandoff,
  };
}

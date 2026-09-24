import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { readDiff, type DiffSummary } from "git-adapter";
import { observeGsdState } from "gsd-adapter";
import type { AgentRuntime, AgentTaskStatus, StartTaskInput } from "orchestration-adapter";
import { CEO_PROTOCOL_APPEND, type CeoDecision, type ParkedCall, toPermissionResult } from "./decision-mapping.js";
import { buildDecisionRequest } from "./decision-request.js";
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
  // to stop right now." The field is shared but its writer is per-
  // invocation, so only the invocation that owns `currentRun` may clear it.
  // pauseTask/cancelTask claim a fresh token, so after them it stays true
  // with nothing running; the next resumeTask/sendMessage then runs one
  // graceful stop against the already-settled runPromise, which returns true
  // immediately — acceptable (05-18).
  inFlight?: boolean;
  // Ownership token of the invocation that currently owns this record (a
  // fresh object per runQuery call). Per-invocation code compares against it
  // before writing shared fields, because attemptGracefulStop can return on
  // timeout before the superseded stream has drained — its teardown, watchdog,
  // late messages, role poll and query() callbacks would otherwise write the
  // successor's state (05-VERIFICATION.md gap 4 / review CR-02). runQuery
  // claims it BEFORE waiting on a prior invocation's graceful stop and
  // re-checks it after, because overlapping callers all wait on the same old
  // stream — only the last claimer may start a query() (05-VERIFICATION.md
  // gap 2 / review CR-01).
  currentRun?: object;
  // StartTaskInput.title, carried on every CEO request as taskTitle (06-03).
  title?: string;
  // D-06: set when a "discuss" decision is applied; the task's next parked
  // request reuses it as its threadId (and clears it) so the dashboard groups
  // the rounds of one conversation.
  discussThreadId?: string;
}

// A diff the worker cannot read (not a repo, no commits, git missing) must
// never stop the request from reaching the CEO: it simply carries no diff.
async function readDiffOrNothing(worktreePath: string | undefined): Promise<DiffSummary | undefined> {
  if (!worktreePath) return undefined;
  try {
    return await readDiff(worktreePath);
  } catch {
    return undefined;
  }
}

// The runtime refuses to park a tool call whose JSON input the CEO could not
// see in full: ceo.approval_requested.toolInput is capped at this length.
const MAX_TOOL_INPUT_CHARS = 16_000;

// Never forwarded to the Claude subprocess (CR-01, research Pitfall 11):
// - provider credentials/endpoints (API key, auth token, base URL, key
//   helper) would silently override CLI subscription auth (RUNTIME-02's
//   never-forward guarantee) or reroute traffic;
// - Bedrock/Vertex switches would move the session off the subscription;
// - CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS would put a timer on a parked CEO
//   decision (D-01: the call waits as long as the CEO needs);
// - WORKER_TOKEN is the worker's control-plane credential; the agent must
//   never be able to read it and post events as the worker.
const STRIPPED_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY_HELPER",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS",
  "WORKER_TOKEN",
]);

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

/** What a worker persisted about a task it lost on restart (D-02). */
export interface RestoreTaskInput {
  taskId: string;
  sessionId: string;
  worktreePath: string;
  agentId: string;
  title?: string;
}

// restoreTask is ClaudeCodeRuntime-only, not an AgentRuntime interface change (D-06).
export type ClaudeCodeRuntime = AgentRuntime & { restoreTask(input: RestoreTaskInput): void };

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
  // Phase 6 (D-01): the host's decision source. canUseTool parks on it for
  // every classified call; the worker's broker resolves it from the
  // control-plane WebSocket. Absent: the Phase 4 detect-and-deny path.
  awaitDecision?: (decisionId: string, signal: AbortSignal) => Promise<CeoDecision>;
  // D-02: this worker process's boot id (a UUID), stamped on every CEO request
  // so a decision arriving after a restart can be told apart.
  workerBootId?: string;
}): ClaudeCodeRuntime {
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
      // Every ceo.* event is PRIVATE (Phase 6).
      buildEnvelope(options.companyId, "ceo.approval_requested", { taskId, reason }, taskId, "PRIVATE"),
    );
  }

  // Posts a PRIVATE ceo.* event attributed to the task's agent.
  async function postPrivate(taskId: string, type: string, payload: unknown): Promise<void> {
    const sourceAgentId = tasks.get(taskId)?.agentId;
    await postEvent(
      options.controlPlaneUrl,
      options.token,
      buildEnvelope(options.companyId, type, payload, taskId, "PRIVATE", sourceAgentId),
    );
  }

  // Real, non-stub requestHandoff — a required AgentRuntime interface member.
  // This runtime has NO automatic handoff trigger: a handoff is initiated by a
  // caller that already knows a real receiving agent id, and no ROADMAP phase
  // currently owns a real handoff trigger — see
  // .planning/phases/05-pixel-office-renderer/deferred-items.md ("agent.
  // handoff_completed has no in-repo producer"). The role-change poll below used to
  // call this with a GSD workflow role label ("Engineering", "QA") as
  // toAgentId — a fabricated handoff out of a workflow observation (CR-04);
  // it now emits the observation as an observation instead.
  // Deliberately observation-only: does not touch the task's own
  // AgentTaskStatus, since receiving control is the receiver's own business.
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

  // Shared for-await message loop — startTask (prompt = input.prompt, no
  // resume), resumeTask, and sendMessage all call this instead of each
  // duplicating the stream-handling logic. Each invocation creates its own
  // AbortController and stores the running Query handle on the task's map
  // entry so pauseTask/cancelTask can act on the currently in-flight call.
  async function runQuery(taskId: string, prompt: string, resumeSessionId?: string): Promise<void> {
    const record = tasks.get(taskId);
    if (!record) throw new Error(`ClaudeCodeRuntime.runQuery: unknown taskId ${taskId}`);

    // Claim the record BEFORE any await: overlapping callers (a double-send,
    // a retry, a pause/cancel) all wait on the same old stream below, so the
    // token must name the latest caller while they wait, and each re-checks
    // it afterwards (05-VERIFICATION.md gap 2 / review CR-01).
    const invocation = {};
    const isCurrent = () => record.currentRun === invocation;
    const hadPrior = record.inFlight;
    record.currentRun = invocation;

    // CR-03: a prior invocation for this taskId is still in flight (e.g.
    // resumeTask/sendMessage called while the task is still "running", or a
    // genuine double-call) — starting a second concurrent query() here would
    // silently orphan the first invocation's controller/watchdog/poll-
    // interval, leaving pauseTask/cancelTask unable to control it. Properly
    // stop the existing invocation first, via the same graceful-then-hard-
    // abort path pauseTask/cancelTask use. record.controller is still the old
    // invocation's here: every waiter resumes before any later claimer can
    // start a query. The stop can return on timeout, before the old stream
    // drains, so the old invocation's finally runs later — it must not clear
    // the flag set below (gap 4 / CR-02; see TaskRecord.currentRun).
    if (hadPrior) {
      const exitedCleanly = await attemptGracefulStop(record);
      if (!exitedCleanly) record.controller?.abort();
    }
    // Superseded, paused or cancelled while waiting. Whoever owns the record
    // now stops the old stream itself, so this call resolves without starting
    // a query (last caller wins).
    if (!isCurrent()) return;

    const controller = new AbortController();
    record.controller = controller;
    record.inFlight = true;

    // Per invocation, so a superseded invocation's parked calls can never
    // suspend its successor's watchdog. The watchdog is created after query()
    // but canUseTool only runs once the stream iterates, hence the forward
    // declaration.
    let parkedCount = 0;
    let watchdog: ReturnType<typeof createWatchdog> | undefined;
    // CEO-02 context: the text blocks of this invocation's latest assistant
    // message, shown to the CEO with any request it parks.
    let lastAssistantText: string | undefined;

    const stream = query({
      prompt,
      options: {
        cwd: record.worktreePath,
        permissionMode: "default",
        // CR-01 (06-REVIEW): RemoteTrigger runs a remote agent whose tool calls
        // never reach this canUseTool, so nothing it does could be CEO-gated.
        disallowedTools: ["RemoteTrigger"],
        resume: resumeSessionId,
        abortController: controller,
        // CR-01: the SDK's own env option REPLACES (not merges with)
        // process.env when set, and inherits the full process.env when
        // omitted (sdk.d.ts QueryOptions.env). So env is always explicitly
        // set here, spreading process.env for everything else (PATH, HOME,
        // etc.) but actively stripping STRIPPED_ENV_KEYS (see there).
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !STRIPPED_ENV_KEYS.has(key))),
        // D-05/D-06: with a decision source, tell the agent what each typed
        // [CEO:...] denial means. This also moves the worker-hosted mode onto
        // Claude Code's own system prompt (the preset), which the 06-11 live
        // proof exercises. Without one, no systemPrompt key (Phase 4 unchanged).
        ...(options.awaitDecision
          ? { systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: CEO_PROTOCOL_APPEND } }
          : {}),
        // D-08 signal #1: fires for every call classifySignal classifies
        // (reached even under a settings allow rule via PreToolUse). Never auto-approves a
        // classified call (ARCHITECTURE.md Anti-Pattern 2). With a decision
        // source (Phase 6, D-01) the call parks until the CEO decides; without
        // one, the Phase 4 detect-and-deny path runs unchanged.
        canUseTool: async (toolName, input, { signal }) => {
          // Superseded: deny everything, never auto-approve (TaskRecord.currentRun).
          if (!isCurrent()) {
            return { behavior: "deny", message: `Invocation superseded for task ${taskId} — tool call refused.` };
          }
          const cls = classifySignal(toolName, input);
          if (!cls) return { behavior: "allow", updatedInput: input };
          if (!options.awaitDecision) {
            await requestReview(taskId, cls.reason);
            return {
              behavior: "deny",
              message: `Escalated to CEO for review (taskId=${taskId}) — no Phase 6 dashboard exists yet to grant approval; see the ceo.approval_requested event.`,
            };
          }
          // Fail closed: nothing is approvable that the CEO could not see in full.
          const toolInput = JSON.stringify(input);
          if (toolInput.length > MAX_TOOL_INPUT_CHARS) {
            return {
              behavior: "deny",
              message:
                "Tool input is too large to show the CEO in full (over 16000 characters); split the operation into smaller steps.",
            };
          }
          const parked: ParkedCall = { decisionId: randomUUID(), toolName, input, kind: cls.kind };
          // D-03: while anything is parked the watchdog and the Notification
          // hook stand down; the finally restarts the watchdog from zero.
          parkedCount++;
          // D-06: a request right after a Discuss decision continues its thread.
          const threadId = record.discussThreadId ?? parked.decisionId;
          record.discussThreadId = undefined;
          try {
            record.status = "waiting_for_review";
            await emitStatus(taskId, "waiting_for_review");
            // D-09: the control plane has no repo access, so the worker ships the diff.
            const diff = await readDiffOrNothing(record.worktreePath);
            await postPrivate(
              taskId,
              "ceo.approval_requested",
              buildDecisionRequest({
                taskId,
                reason: cls.reason,
                decisionId: parked.decisionId,
                threadId,
                kind: cls.kind,
                toolName,
                input,
                lastAssistantText,
                diff,
                sessionId: record.sessionId,
                worktreePath: record.worktreePath,
                workerBootId: options.workerBootId,
                taskTitle: record.title,
              }),
            );
            // D-02: every way a parked call is lost ends in deny plus an
            // expiry record, never in ceo.decision_applied or "running".
            // postPrivate never throws, so an outage cannot change the deny.
            let decision: CeoDecision;
            try {
              decision = await options.awaitDecision(parked.decisionId, signal);
            } catch {
              await postPrivate(taskId, "ceo.approval_expired", {
                decisionId: parked.decisionId,
                taskId,
                reason: signal.aborted ? "aborted" : "superseded",
              });
              return { behavior: "deny", message: "No CEO decision was applied; the tool call was not run." };
            }
            if (!isCurrent()) {
              await postPrivate(taskId, "ceo.approval_expired", {
                decisionId: parked.decisionId,
                taskId,
                reason: "superseded",
              });
              return { behavior: "deny", message: `Invocation superseded for task ${taskId} — tool call refused.` };
            }
            // Pure mapping: approve returns parked.input by reference, never
            // anything from the decision object.
            const result = toPermissionResult(decision, parked);
            if (decision.action === "discuss") record.discussThreadId = threadId;
            // Pitfall 3: this is what walks the office agent out of the CEO room.
            record.status = "running";
            await emitStatus(taskId, "running");
            await postPrivate(taskId, "ceo.decision_applied", {
              decisionId: parked.decisionId,
              taskId,
              action: decision.action,
              outcome: result.behavior === "allow" ? "allowed" : "denied",
            });
            return result;
          } finally {
            parkedCount--;
            if (isCurrent()) watchdog?.reset();
          }
        },
        // D-08 signal #2: independent secondary signal — fires ~6s after an
        // unanswered canUseTool wait, per 04-RESEARCH.md Pattern 4 (2). Rarely
        // fires in practice since this implementation's canUseTool is
        // synchronous, but it remains correct defensive wiring, directly
        // unit-tested by invoking the hook function independent of live
        // canUseTool timing.
        hooks: {
          // CEO-04 / research Pitfall 1: a settings allow rule (this repo's own
          // .claude/settings.local.json allows git push, git merge, pnpm add,
          // mcp__coolify__deploy) would approve a call before canUseTool runs.
          // A hook "ask" outranks "allow", forcing every classified call back
          // to canUseTool. Same classifier, so hook and gate never disagree;
          // no isCurrent guard, so a superseded invocation still asks (never
          // allows). Never parks here: a hook timeout would skip the tool.
          PreToolUse: [
            {
              hooks: [
                async (hookInput) => {
                  const { tool_name, tool_input } = hookInput as { tool_name: string; tool_input: unknown };
                  if (!classifySignal(tool_name, tool_input)) return {};
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse" as const,
                      permissionDecision: "ask" as const,
                      permissionDecisionReason: "CEO-gated: requires an explicit CEO decision",
                    },
                  };
                },
              ],
            },
          ],
          Notification: [
            {
              hooks: [
                async (hookInput) => {
                  if (!isCurrent()) return {}; // superseded (TaskRecord.currentRun)
                  if (parkedCount > 0) return {}; // D-03: already requested by the parked call
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
    watchdog = createWatchdog(DEFAULT_WATCHDOG_TIMEOUT_MS, () => {
      void (async () => {
        if (parkedCount > 0) return; // D-03: a parked call is CEO think-time, not a hang
        if (!isCurrent()) return; // superseded (TaskRecord.currentRun)
        const exitedCleanly = await attemptGracefulStop(record);
        if (!exitedCleanly) controller.abort();
        if (!isCurrent()) return; // superseded during the graceful-stop wait
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
          // Superseded: stop this invocation's own poll (TaskRecord.currentRun).
          if (!isCurrent()) {
            clearInterval(rolePoll);
            return;
          }
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
                // CR-04: a GSD workflow role change is an observation ABOUT
                // the workflow, not a handoff TO an agent named after the
                // role. Emit the same gsd.phase_observed envelope
                // apps/worker/src/poll-loop.ts emits and let company-core's
                // reducer refine the real agent's status from it — the role
                // string never touches a field typed as an agent id.
                //
                // `active: true` is honest here, on a stronger basis than
                // poll-loop.ts's: this poll only exists inside runQuery, for
                // the lifetime of an in-flight Claude Code stream, so at the
                // moment it fires there genuinely is a live process working
                // in that worktree. poll-loop.ts has to combine its
                // observation with a separate process-liveness signal
                // precisely because it has no such guarantee.
                await postEvent(
                  options.controlPlaneUrl,
                  options.token,
                  buildEnvelope(
                    options.companyId,
                    "gsd.phase_observed",
                    {
                      phase: observed.phase,
                      status: observed.status,
                      category: observed.category,
                      role: observed.role,
                      active: true,
                    },
                    taskId,
                  ),
                );
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
          if (!isCurrent()) continue; // superseded (TaskRecord.currentRun)
          if (message.type === "system" && message.subtype === "init") {
            record.sessionId = message.session_id;
            // A captured session_id and no result yet means the turn is
            // actively in-flight (pauseTask/sendMessage's "mid-stream"
            // precondition) — an in-memory transition only, no event.
            record.status = "running";
          } else if (message.type === "assistant") {
            const text = message.message.content
              .flatMap((block) => (block.type === "text" ? [block.text] : []))
              .join("\n");
            if (text.trim()) lastAssistantText = text;
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
        // Only its owner may clear it (TaskRecord.currentRun).
        if (isCurrent()) record.inFlight = false;
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
      tasks.set(input.taskId, {
        status: "starting",
        worktreePath: input.worktreePath,
        agentId: input.agentId,
        title: input.title,
      });
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
      // Claim a fresh token: any runQuery still waiting in its preemption
      // gives up, and the running invocation's late messages and teardown
      // stop writing (05-VERIFICATION.md gap 2 / review CR-01).
      record.currentRun = {};
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
      // Claim a fresh token: any runQuery still waiting in its preemption
      // gives up, and the running invocation's late messages and teardown
      // stop writing (05-VERIFICATION.md gap 2 / review CR-01).
      record.currentRun = {};
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

    // D-02: re-creates a task record lost on worker restart, as "blocked", so
    // resumeTask can pick up its Claude session in its worktree. No path
    // validation here: the worker checks worktreePath against listWorktrees
    // before calling (06-04). A known, settled task is left untouched.
    restoreTask(input: RestoreTaskInput): void {
      const record = tasks.get(input.taskId);
      if (record) {
        // inFlight stays true after pause/cancel with nothing running (see
        // TaskRecord.inFlight), so those statuses count as settled.
        if (record.inFlight && record.status !== "paused" && !TERMINAL_STATUSES.includes(record.status)) {
          throw new Error("ClaudeCodeRuntime.restoreTask: task is running");
        }
        return;
      }
      tasks.set(input.taskId, {
        status: "blocked",
        sessionId: input.sessionId,
        worktreePath: input.worktreePath,
        agentId: input.agentId,
        title: input.title,
      });
    },

    requestReview,
    requestHandoff,
  };
}

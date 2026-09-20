// GSD's own canonical status vocabulary, copied verbatim (key-for-key,
// value-for-value) from gsd-core's own source so it can never silently drift:
// C:\Users\shado\.claude\gsd-core\bin\lib\state-document.cjs:637-664
// (quoted in 03-RESEARCH.md Pattern 4). Do not paraphrase or re-derive this
// table — normalize against it exactly.
export const STATUS_EXACT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  paused: "paused",
  stopped: "paused",
  executing: "executing",
  "in progress": "executing",
  "ready to execute": "executing",
  planning: "planning",
  "ready to plan": "planning",
  "planning complete": "planning",
  discussing: "discussing",
  verifying: "verifying",
  completed: "completed",
  done: "completed",
  complete: "completed",
  "phase complete": "completed",
  "phase complete — ready for verification": "verifying",
  "all phases complete": "completed",
  "milestone complete": "completed",
  unknown: "unknown",
});

export interface StateMdResult {
  status: string;
  currentPhase: number | undefined;
  raw: Record<string, unknown>;
}

export async function readStateMd(planningDir: string): Promise<StateMdResult | null> {
  throw new Error("not implemented");
}

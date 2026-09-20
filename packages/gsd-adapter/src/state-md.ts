import matter from "gray-matter";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

// Pitfall 3: a project's STATE.md may have no STATE.md file at all (no
// project started yet) — that is a first-class null return, never a thrown
// error. Pitfall 3 (missing current_phase key) and Pitfall 2 (status vocabulary
// gap) are both handled below without throwing.
export async function readStateMd(planningDir: string): Promise<StateMdResult | null> {
  const filePath = join(planningDir, "STATE.md");
  if (!existsSync(filePath)) return null;

  const content = await readFile(filePath, "utf-8");
  const { data } = matter(content);

  const rawStatus = typeof data.status === "string" ? data.status.toLowerCase().trim() : "";
  const status = STATUS_EXACT_TOKENS[rawStatus] ?? "unknown";
  const currentPhase = typeof data.current_phase === "number" ? data.current_phase : undefined;

  return { status, currentPhase, raw: data };
}

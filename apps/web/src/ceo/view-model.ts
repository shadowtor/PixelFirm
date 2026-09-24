// Pure display helpers for the /ceo queue and detail heading. No React here.
import type { DecisionRecord, DecisionRequestView } from "company-core";
import type { DecisionAction } from "event-schema";

const MINUTE = 60_000;
const unit = (u: "minute" | "hour" | "day") => new Intl.NumberFormat("en", { style: "unit", unit: u, unitDisplay: "short" });
const MINUTES = unit("minute");
const HOURS = unit("hour");
const DAYS = unit("day");

export function waitedLabel(requestedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(requestedAt)) / MINUTE));
  if (minutes < 60) return MINUTES.format(minutes);
  if (minutes < 60 * 24) return HOURS.format(Math.floor(minutes / 60));
  return DAYS.format(Math.floor(minutes / (60 * 24)));
}

export function isLongWait(requestedAt: string, now: number): boolean {
  return now - Date.parse(requestedAt) > 10 * MINUTE;
}

/** "Question", or "Gated action · <pattern>" where the pattern follows the reason's first ": ". */
export function kindLabel(kind: DecisionRequestView["kind"] | undefined, reason: string): string {
  if (kind === "clarifying_question") return "Question";
  const at = reason.indexOf(": ");
  return at < 0 ? "Gated action" : `Gated action · ${reason.slice(at + 2)}`;
}

export function documentTitle(pendingCount: number): string {
  return pendingCount > 0 ? `(${pendingCount}) CEO desk · PixelFirm` : "CEO desk · PixelFirm";
}

/** After `removed` leaves: the next surviving item after it, else the previous one, else null. */
export function nextSelection(previous: string[], removed: string, current: string[]): string | null {
  const at = previous.indexOf(removed);
  const alive = new Set(current);
  const after = previous.slice(at + 1).find((id) => alive.has(id));
  if (after) return after;
  const before = previous.slice(0, Math.max(at, 0)).reverse().find((id) => alive.has(id));
  return before ?? null;
}

/** `{agent} · {task title} · {project} · waiting {duration} · #{first 8 of decisionId}`, absent parts omitted. */
export function detailMeta(request: DecisionRequestView, now: number): string {
  const project = request.worktreePath?.split(/[\\/]/).filter(Boolean).pop();
  return [
    request.agentId,
    request.taskTitle,
    project,
    `waiting ${waitedLabel(request.requestedAt, now)}`,
    `#${request.decisionId.slice(0, 8)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---- detail pane (06-09) ----

export type SafeLink = { href: string } | { text: string };

/** Only http: and https: become anchors (T-06-09-02); every other string stays text. */
export function safeLink(raw: string): SafeLink {
  let protocol = "";
  try {
    protocol = new URL(raw).protocol;
  } catch {}
  return protocol === "http:" || protocol === "https:" ? { href: raw } : { text: raw };
}

export type DiffChunk = { path: string; lines: string[] };

/** One chunk per `diff --git` header, keyed by its b/ path. Lines before the first header are dropped. */
export function splitDiffByFile(unified: string): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  for (const line of unified.split("\n")) {
    const header = /^diff --git .* "?b\/(.*?)"?$/.exec(line);
    if (header) chunks.push({ path: header[1]!, lines: [] });
    chunks.at(-1)?.lines.push(line);
  }
  return chunks;
}

export type DiffLineKind = "add" | "del" | "hunk" | "file" | "context";

export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith("+++") || line.startsWith("---")) return "file";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

export function truncationCopy(t: { lineCap: number; files: number; added: number; removed: number }): string {
  return `Diff cut at ${t.lineCap} lines. ${t.files} files changed, ${t.added} additions, ${t.removed} deletions in total. Open the branch for the rest.`;
}

const ACTION_LABELS: Record<DecisionAction, string> = {
  approve: "Approved",
  reject: "Rejected",
  request_changes: "Changes requested",
  more_research: "More research",
  discuss: "Discuss",
};

export function actionLabel(action: DecisionAction): string {
  return ACTION_LABELS[action];
}

export type Question = NonNullable<DecisionRequestView["questions"]>[number];
/** Per question text: the picked option labels, and `other` when "Other" is chosen. */
export type Selections = Record<string, { labels: string[]; other?: string }>;

/**
 * Answers keyed by exact question text, the shape the worker's validateAnswers accepts:
 * picked labels in option order, then the trimmed Other text, joined with ", ".
 * Questions with no non-empty answer are left out.
 */
export function buildAnswers(questions: Question[], selections: Selections): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const sel = selections[q.question];
    if (!sel) continue;
    const parts = q.options.map((o) => o.label).filter((label) => sel.labels.includes(label));
    const other = sel.other?.trim();
    if (other) parts.push(other);
    if (parts.length) answers[q.question] = parts.join(", ");
  }
  return answers;
}

export function allAnswered(questions: Question[], selections: Selections): boolean {
  const answers = buildAnswers(questions, selections);
  return questions.every((q) => q.question in answers);
}


// ---- action bar (06-10) ----

export const NOTE_REQUIRED_ERROR = "Add a note. The agent needs to know what you want.";

export function noteRequired(_action: DecisionAction): boolean {
  return false;
}

export function validateNote(_action: DecisionAction, _note: string): string | null {
  return null;
}

export function inProgressLabel(_action: DecisionAction, _question = false): string {
  return "";
}

export function successToast(_action: DecisionAction, _agentName: string, _question = false): string {
  return "";
}

export function relativeTime(_iso: string, _now: number): string {
  return "";
}

export function noLongerPendingCopy(_record: DecisionRecord, _now: number): string {
  return "";
}

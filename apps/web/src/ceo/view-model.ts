// Pure display helpers for the /ceo queue and detail heading. No React here.
import type { DecisionRequestView } from "company-core";

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

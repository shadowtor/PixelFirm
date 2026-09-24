// The enriched ceo.approval_requested payload (CEO-02, D-06, D-09). Pure, no
// I/O. Every derived field comes from data the agent produced (its question,
// its option labels, its Bash description, its own text) or the worker read
// (diff, session, worktree); nothing is invented, and an absent value is an
// absent key. Caps mirror the event-schema payload, so the control plane never
// rejects a request (a rejected request would leave the call parked unseen).
import type { CompanyEvent } from "event-schema";
import type { DiffSummary } from "git-adapter";
import type { ClassifiedSignal } from "./signal-detection.js";

export type DecisionRequestPayload = Extract<CompanyEvent, { type: "ceo.approval_requested" }>["payload"];

export interface DecisionRequestArgs {
  taskId: string;
  reason: string;
  decisionId: string;
  threadId: string;
  kind: ClassifiedSignal["kind"];
  toolName: string;
  input: Record<string, unknown>;
  lastAssistantText?: string;
  diff?: DiffSummary;
  sessionId?: string;
  worktreePath?: string;
  workerBootId?: string;
  taskTitle?: string;
}

interface AskOption {
  label: string;
  description: string;
  preview?: string;
}
interface AskQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskOption[];
}

// http(s) only: javascript:, file: and every other scheme never match.
const LINK_PATTERN = /https?:\/\/[^\s"'<>`\\]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/** Unique http(s) URLs in first-seen order, at most 10, each at most 2000 chars. */
export function extractLinks(texts: string[]): string[] {
  const links: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(LINK_PATTERN)) {
      const url = match[0].replace(TRAILING_PUNCTUATION, "");
      if (url.length > 2000 || links.includes(url)) continue;
      links.push(url);
      if (links.length === 10) return links;
    }
  }
  return links;
}

export function buildDecisionRequest(args: DecisionRequestArgs): DecisionRequestPayload {
  const { input, toolName } = args;
  const toolInput = JSON.stringify(input);
  const questions = toolName === "AskUserQuestion" ? copyQuestions(input.questions) : undefined;
  const context = args.lastAssistantText?.trim().slice(0, 8000) || undefined;
  const recommendation = recommendationOf(toolName, input, questions)?.slice(0, 4000) || undefined;
  const links = extractLinks([context ?? "", toolInput]);

  return {
    taskId: args.taskId,
    reason: args.reason,
    decisionId: args.decisionId,
    threadId: args.threadId,
    kind: args.kind,
    toolName,
    toolInput,
    title: titleOf(toolName, input, questions),
    ...(context ? { context } : {}),
    ...(recommendation ? { recommendation } : {}),
    ...(links.length > 0 ? { links } : {}),
    ...(questions ? { questions } : {}),
    ...(args.diff
      ? {
          diff: {
            ...args.diff,
            files: args.diff.files.slice(0, 500).map((f) => ({ ...f, path: f.path.slice(0, 1000) })),
            unified: args.diff.unified.slice(0, 65_536),
          },
        }
      : {}),
    // Identifiers are omitted rather than cut: a truncated id names nothing.
    ...(args.sessionId && args.sessionId.length <= 200 ? { sessionId: args.sessionId } : {}),
    ...(args.worktreePath && args.worktreePath.length <= 1000 ? { worktreePath: args.worktreePath } : {}),
    ...(args.workerBootId ? { workerBootId: args.workerBootId } : {}),
    ...(args.taskTitle ? { taskTitle: args.taskTitle.slice(0, 300) } : {}),
  };
}

function ellipsize(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function titleOf(toolName: string, input: Record<string, unknown>, questions?: AskQuestion[]): string {
  if (questions?.[0]) return ellipsize(questions[0].question.trim(), 300);
  if (toolName === "Bash" && typeof input.command === "string") return ellipsize(`Bash: ${input.command}`, 300);
  const target = [input.file_path, input.notebook_path, input.url].find((v) => typeof v === "string");
  return ellipsize(target ? `${toolName}: ${target}` : toolName, 300);
}

function recommendationOf(
  toolName: string,
  input: Record<string, unknown>,
  questions?: AskQuestion[],
): string | undefined {
  if (questions) {
    return questions
      .flatMap((q) => q.options.map((o) => o.label))
      .filter((label) => label.includes("(Recommended)"))
      .join(", ");
  }
  if (toolName === "Bash" && typeof input.description === "string") return input.description.trim();
  return undefined;
}

// Only the fields the dashboard renders, capped per the schema.
function copyQuestions(raw: unknown): AskQuestion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, 4).map((q: AskQuestion) => ({
    question: String(q.question).slice(0, 2000),
    header: String(q.header).slice(0, 64),
    multiSelect: Boolean(q.multiSelect),
    options: (Array.isArray(q.options) ? q.options : []).slice(0, 4).map((o) => ({
      label: String(o.label).slice(0, 500),
      description: String(o.description).slice(0, 2000),
      ...(typeof o.preview === "string" ? { preview: o.preview.slice(0, 16_000) } : {}),
    })),
  }));
}

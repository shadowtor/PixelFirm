// D-08 signal detection: a pure classifier over a single tool-call's
// (toolName, input) — no I/O, no side effects, mirrors
// packages/gsd-adapter/src/role-mapping.ts's pure-dispatch-table shape.
// canUseTool/the Notification hook (claude-code-runtime.ts) call this and act
// on the result; this module never itself calls requestReview or posts
// events.
//
// The Bash CEO-gated pattern list below is a first-pass, explicitly
// heuristic allowlist (Claude's Discretion per CONTEXT.md) covering
// ARCHITECTURE.md's named categories (deploy, destructive filesystem op,
// destructive DB op, force-push/publish) — not exhaustive coverage of every
// possible destructive command (T-04-08). Widening it is expected future
// work, not a gap hidden by this phase.

export interface ClassifiedSignal {
  kind: "clarifying_question" | "ceo_gated_tool";
  reason: string;
}

const CEO_GATED_BASH_PATTERNS: { name: string; pattern: RegExp }[] = [
  // WR-01: the third alternative used to be a bare `-f\b`, matching any
  // command containing that flag regardless of context (curl -fsSL, rm -f,
  // docker build -f) — scope it to a push-shaped command by requiring
  // `push` to appear before the flag, same as the `--force` alternative.
  { name: "force-push", pattern: /\bforce\b.*push|push.*(--force|-f\b)/i },
  { name: "destructive filesystem op", pattern: /\brm\s+-rf\b/i },
  { name: "destructive DB op", pattern: /\bDROP\s+(TABLE|DATABASE)\b/i },
  { name: "publish/deploy", pattern: /\bnpm\s+publish\b|\bdeploy\b/i },
];

export function classifySignal(toolName: string, input: unknown): ClassifiedSignal | null {
  if (toolName === "AskUserQuestion") {
    return { kind: "clarifying_question", reason: "Claude asked a clarifying question via AskUserQuestion" };
  }

  if (toolName === "Bash") {
    const command = (input as { command?: string } | null | undefined)?.command;
    if (typeof command === "string") {
      for (const { name, pattern } of CEO_GATED_BASH_PATTERNS) {
        if (pattern.test(command)) {
          return { kind: "ceo_gated_tool", reason: `Bash command matched a CEO-gated pattern: ${name}` };
        }
      }
    }
    return null;
  }

  return null;
}

// D-08 signal detection: a pure classifier over a single tool-call's
// (toolName, input) — no I/O, no side effects, mirrors
// packages/gsd-adapter/src/role-mapping.ts's pure-dispatch-table shape.
// canUseTool and the PreToolUse/Notification hooks (claude-code-runtime.ts)
// call this and act on the result; this module never itself calls
// requestReview or posts events.
//
// The CEO-gated lists below are still an explicitly heuristic allowlist
// (Claude's Discretion per CONTEXT.md, T-04-08), now covering CEO-04's
// categories per the user's 06-02 decision ("A. - Narrow", "B. - gate-paths",
// recorded verbatim in 06-02-SUMMARY.md): deploys, destructive filesystem/DB/
// git operations, pushes to main/master, dependency changes, MCP tools with a
// destructive word in the name, and production changes made by editing
// deployment config, writing it from the shell, or fetching a deploy hook.
// Signed-off residual (NOT gated, by that decision): a deploy through a
// feature-branch push; an MCP tool whose name has none of the destructive
// words; a script or binary that deploys under an innocuous name (for
// example `node scripts/release.mjs`); indirect writes (for example a
// `node -e` script editing a config file); and a deploy endpoint whose URL
// contains none of deploy, webhook or /hook(s)/.

export interface ClassifiedSignal {
  kind: "clarifying_question" | "ceo_gated_tool";
  reason: string;
}

// Production config file names (gate-paths), as regex sources matched
// case-insensitively against a path with backslashes normalised to "/", so
// Windows paths and case variants fail closed. SEG is one path segment's
// characters (also stops at shell metacharacters when scanning a command).
const SEG = String.raw`[^\s'"/;&|<>]`;
const PRODUCTION_CONFIG_PATTERNS = [
  String.raw`dockerfile${SEG}*`,
  String.raw`${SEG}*\.dockerfile`,
  String.raw`docker-compose${SEG}*`,
  String.raw`compose${SEG}*\.ya?ml`,
  String.raw`\.env(?:\.${SEG}*)?`,
  String.raw`wrangler\.(?:toml|jsonc?)`,
  String.raw`nginx${SEG}*\.conf`,
  String.raw`${SEG}*\.tf(?:vars)?`,
  String.raw`\.github/workflows/[^\s'";&|<>]+`,
];
const CONFIG_FILE = `(?:${PRODUCTION_CONFIG_PATTERNS.join("|")})`;
const PRODUCTION_CONFIG_PATH = new RegExp(`(?:^|/)${CONFIG_FILE}$`, "i");

const DEPLOY_HOOK_URL = /deploy|webhook|\/hooks?(?:[/?#]|$)/i;
const DESTRUCTIVE_MCP_NAME = /deploy|delete|destroy|drop|remove|restart|stop|publish|push|merge/i;

// Tested against the command with backslashes normalised to "/". Order only
// decides which name a command reports; force-push stays first.
const CEO_GATED_BASH_PATTERNS: { name: string; pattern: RegExp }[] = [
  // WR-01: the third alternative used to be a bare `-f\b`, matching any
  // command containing that flag regardless of context (curl -fsSL, rm -f,
  // docker build -f) — scope it to a push-shaped command by requiring
  // `push` to appear before the flag, same as the `--force` alternative.
  { name: "force-push", pattern: /\bforce\b.*push|push.*(--force|-f\b)/i },
  { name: "destructive filesystem op", pattern: /\brm\s+-rf\b/i },
  { name: "destructive DB op", pattern: /\bDROP\s+(TABLE|DATABASE)\b/i },
  { name: "publish/deploy", pattern: /\bnpm\s+publish\b|\bdeploy\b/i },
  // On this stack a push to main deploys through Coolify.
  { name: "push to main/master", pattern: /\bgit\b[^|;&]*\bpush\b[^|;&]*\b(main|master)\b/i },
  { name: "merge/rebase/reset --hard", pattern: /\bgit\s+(merge|rebase)\b|\bgit\s+reset\b[^|;&]*--hard\b/i },
  // Only an install that names a package: bare `pnpm install` / `npm ci`
  // reproduce the lockfile and change no dependency.
  {
    name: "dependency change",
    pattern:
      /\b(npm|pnpm|yarn|bun)\b[^|;&]*\s(add|remove|rm|uninstall|update|upgrade)\b|\b(npm|pnpm|bun)\s+(install|i)\s+(?:-\S+\s+)*[^\s-]|\bpip3?\s+install\b/i,
  },
  {
    name: "production config write",
    pattern: new RegExp(
      String.raw`(?:>>?|\btee\b[^|;&]*\s|\bsed\b[^|;&]*\s-\w*i\b[^|;&]*\s|\b(?:cp|mv)\b[^|;&]*\s)\s*['"]?(?:[^\s'";&|<>]*/)?` +
        CONFIG_FILE +
        String.raw`(?=$|[\s'";&|<>)])`,
      "i",
    ),
  },
];

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export function classifySignal(toolName: string, input: unknown): ClassifiedSignal | null {
  const fields = (input ?? {}) as { command?: unknown; file_path?: unknown; notebook_path?: unknown; url?: unknown };

  if (toolName === "AskUserQuestion") {
    return { kind: "clarifying_question", reason: "Claude asked a clarifying question via AskUserQuestion" };
  }

  if (toolName === "Bash") {
    if (typeof fields.command !== "string") return null;
    const command = fields.command.replaceAll("\\", "/");
    const hit = CEO_GATED_BASH_PATTERNS.find(({ pattern }) => pattern.test(command));
    return hit ? { kind: "ceo_gated_tool", reason: `Bash command matched a CEO-gated pattern: ${hit.name}` } : null;
  }

  if (FILE_TOOLS.has(toolName)) {
    const path = fields.file_path ?? fields.notebook_path;
    if (typeof path === "string" && PRODUCTION_CONFIG_PATH.test(path.replaceAll("\\", "/"))) {
      return { kind: "ceo_gated_tool", reason: "File change matched a CEO-gated pattern: production config" };
    }
    return null;
  }

  if (toolName === "WebFetch") {
    if (typeof fields.url === "string" && DEPLOY_HOOK_URL.test(fields.url)) {
      return { kind: "ceo_gated_tool", reason: "WebFetch matched a CEO-gated pattern: deploy hook" };
    }
    return null;
  }

  if (toolName.startsWith("mcp__") && DESTRUCTIVE_MCP_NAME.test(toolName)) {
    return { kind: "ceo_gated_tool", reason: `MCP tool: ${toolName}` };
  }

  return null;
}

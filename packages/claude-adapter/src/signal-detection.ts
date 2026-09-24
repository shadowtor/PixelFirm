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
  // 06-REVIEW WR-03: files that control the agent (settings hooks/env, MCP
  // servers) and git (config, hooks, attribute filters) on the next run.
  String.raw`\.claude/[^\s'";&|<>]+`,
  String.raw`\.mcp\.json`,
  String.raw`\.gitattributes`,
  String.raw`\.git/(?:hooks/[^\s'";&|<>]+|info/attributes|(?:worktrees/${SEG}+/)?config(?:\.worktree)?)`,
];
const CONFIG_FILE = `(?:${PRODUCTION_CONFIG_PATTERNS.join("|")})`;
const PRODUCTION_CONFIG_PATH = new RegExp(`(?:^|/)${CONFIG_FILE}$`, "i");

const DEPLOY_HOOK_URL = /deploy|webhook|\/hooks?(?:[/?#]|$)/i;
const DESTRUCTIVE_MCP_NAME = /deploy|delete|destroy|drop|remove|restart|stop|publish|push|merge/i;

// `git` plus any global options (-C <dir>, -c <k=v>, --no-pager, ...) up to
// the subcommand (06-REVIEW WR-01: `git -C dir reset --hard` spelling).
const GIT_OPTS = String.raw`(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*`;
const GIT = String.raw`\bgit${GIT_OPTS}\s+`;

// 06-REVIEW WR-03 (iteration 2, user decision "Allow bare reads"): the only
// `git config` forms that are reads. Scope/display options, then either an
// explicit read op or one bare key that ends the command. Position matters:
// git accepts options after arguments, so `git config k v --list` writes k=v.
const GIT_CONFIG_READ_OPTS = String.raw`(?:\s+(?:--(?:global|system|local|worktree|show-origin|show-scope|name-only|null|includes|no-includes)|-z|(?:--file|-f|--type)[=\s]\S+))*`;
const GIT_CONFIG_READ =
  GIT_CONFIG_READ_OPTS +
  String.raw`\s+(?:(?:--get[\w-]*|--list|-l|get|list)(?=\s|$|[|;&)])|[\w-]+\.[^\s'"|;&<>=$\x60()]+[ \t]*(?=$|[\n|;&)]))`;

// Tested against the command with backslashes normalised to "/". Order only
// decides which name a command reports; force-push stays first.
const CEO_GATED_BASH_PATTERNS: { name: string; pattern: RegExp }[] = [
  // WR-01: the third alternative used to be a bare `-f\b`, matching any
  // command containing that flag regardless of context (curl -fsSL, rm -f,
  // docker build -f) — scope it to a push-shaped command by requiring
  // `push` to appear before the flag, same as the `--force` alternative.
  { name: "force-push", pattern: /\bforce\b.*push|push.*(--force|-f\b)/i },
  // 06-REVIEW WR-01: any spelling of a recursive forced delete (rm -fr,
  // rm -r -f, rm --recursive --force, Remove-Item -Recurse -Force), and
  // git clean -f, which deletes untracked files the same way.
  {
    name: "destructive filesystem op",
    pattern: new RegExp(
      String.raw`\b(?:rm|remove-item)\b(?=[^|;&]*\s-(?:\w*r|-recursive\b))(?=[^|;&]*\s-(?:\w*f|-force\b))|` +
        String.raw`${GIT}clean\b[^|;&]*\s-(?:\w*f|-force\b)`,
      "i",
    ),
  },
  { name: "destructive DB op", pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\b/i },
  { name: "publish/deploy", pattern: /\bnpm\s+publish\b|\bdeploy\b/i },
  // On this stack a push to main deploys through Coolify.
  { name: "push to main/master", pattern: /\bgit\b[^|;&]*\bpush\b[^|;&]*\b(main|master)\b/i },
  {
    name: "merge/rebase/reset --hard",
    pattern: new RegExp(String.raw`${GIT}(?:merge|rebase)\b|${GIT}reset\b[^|;&]*--hard\b`, "i"),
  },
  // Only an install that names a package: bare `pnpm install` / `npm ci`
  // reproduce the lockfile and change no dependency.
  {
    name: "dependency change",
    pattern:
      /\b(npm|pnpm|yarn|bun)\b[^|;&]*\s(add|remove|rm|uninstall|update|upgrade)\b|\b(npm|pnpm|bun)\s+(install|i)\s+(?:-\S+\s+)*[^\s-]|\bpip3?\s+install\b/i,
  },
  // 06-REVIEW WR-03: the shell spelling of a .git/config write. Anything that
  // is not a GIT_CONFIG_READ counts as a write (fails closed).
  {
    name: "git config write",
    pattern: new RegExp(String.raw`${GIT}config\b(?!${GIT_CONFIG_READ})`, "i"),
  },
  // ...and any `git config` run under -c / --config-env, read or not. Case-
  // sensitive on purpose: the "i" flag would make it catch the harmless -C <dir>.
  {
    name: "git config write",
    pattern: new RegExp(String.raw`\b[Gg][Ii][Tt]${GIT_OPTS}\s+(?:-c\s+\S+|--config-env=\S+)${GIT_OPTS}\s+config\b`),
  },
  // 06-REVIEW WR-02: DEPLOY_HOOK_URL's rule for a fetch from the shell (a URL
  // containing "deploy" already matches publish/deploy above).
  {
    name: "deploy hook",
    pattern:
      /\b(?:curl|wget|https?|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|;&]*https?:\/\/[^\s'"]*(?:webhook|\/hooks?(?=[/?#\s'"]|$))/i,
  },
  {
    name: "production config write",
    pattern: new RegExp(
      // cp/mv plus their PowerShell spellings (06-REVIEW WR-01).
      String.raw`(?:>>?|\btee\b[^|;&]*\s|\bsed\b[^|;&]*\s-\w*i\b[^|;&]*\s|` +
        String.raw`\b(?:cp|mv|copy-item|move-item|set-content|add-content|out-file|new-item)\b[^|;&]*\s)` +
        String.raw`\s*['"]?(?:[^\s'";&|<>]*/)?` +
        CONFIG_FILE +
        String.raw`(?=$|[\s'";&|<>)])`,
      "i",
    ),
  },
];

const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// CR-01 (06-REVIEW): every built-in tool that runs a shell command. PowerShell
// replaces Bash on Windows hosts without Git Bash (or via
// CLAUDE_CODE_USE_POWERSHELL_TOOL); Monitor's `command` is a shell script.
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);

export function classifySignal(toolName: string, input: unknown): ClassifiedSignal | null {
  const fields = (input ?? {}) as { command?: unknown; file_path?: unknown; notebook_path?: unknown; url?: unknown };

  if (toolName === "AskUserQuestion") {
    return { kind: "clarifying_question", reason: "Claude asked a clarifying question via AskUserQuestion" };
  }

  if (SHELL_TOOLS.has(toolName)) {
    if (typeof fields.command !== "string") return null;
    const command = fields.command.replaceAll("\\", "/");
    const hit = CEO_GATED_BASH_PATTERNS.find(({ pattern }) => pattern.test(command));
    return hit ? { kind: "ceo_gated_tool", reason: `${toolName} command matched a CEO-gated pattern: ${hit.name}` } : null;
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

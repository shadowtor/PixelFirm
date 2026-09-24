// CR-02 (06-REVIEW): git still runs repo-configured programs that no flag
// turns off (filter.<name>.clean on a worktree diff, hooks), and an agent can
// configure them. Every git process this package starts gets the worker's
// environment minus anything credential-shaped, so such a program never sees
// WORKER_TOKEN or a provider key.
const SECRET_KEY = /token|secret|passw|credential|api_?key|^anthropic_/i;

type Env = Record<string, string | undefined>;

export function gitExecOptions(cwd?: string): { cwd?: string; env: Env; extendEnv: false } {
  return {
    ...(cwd !== undefined ? { cwd } : {}),
    env: Object.fromEntries(Object.entries(process.env as Env).filter(([key]) => !SECRET_KEY.test(key))),
    extendEnv: false,
  };
}

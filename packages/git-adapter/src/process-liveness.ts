import { execa } from "execa";

/**
 * Coarse, repo-agnostic "is any Claude Code process alive anywhere on this
 * machine" check (RESEARCH.md Pitfall 1 — Windows exposes no reliable
 * cwd/cmdline-to-repo attribution, verified this session). Never throws:
 * resolves false on any error, matching the fail-closed/safe-degrade
 * requirement in D-02 — a probe failure must never be interpreted as
 * "active".
 */
export async function isAnyClaudeProcessAlive(): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execa("powershell", [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'claude.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*claude*') } | Measure-Object).Count",
      ]);
      const count = Number.parseInt(stdout.trim(), 10);
      return Number.isFinite(count) && count > 0;
    }

    const { stdout } = await execa("ps", ["-eo", "comm,args"]);
    return stdout
      .toLowerCase()
      .split("\n")
      .some((line) => line.includes("claude"));
  } catch {
    return false;
  }
}

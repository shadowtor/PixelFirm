import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WORKTREE-02 structural guarantee: git-adapter must never issue a mutating
// git subcommand. Banned tokens cover the classes RESEARCH.md/PLAN.md name:
// merge, rebase, a force-push flag, a branch-delete flag, and checkout.
const BANNED_GIT_TOKENS = ["merge", "rebase", "--force", "-D", "checkout"];

describe("no-mutating-git", () => {
  it("no non-test .ts source file invokes a mutating git subcommand as a quoted argument", () => {
    const srcDir = import.meta.dirname;
    const files = readdirSync(srcDir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(srcDir, file), "utf-8");
      for (const token of BANNED_GIT_TOKENS) {
        const quotedTokenPattern = new RegExp(`["'\`]${token}["'\`]`);
        if (quotedTokenPattern.test(content)) {
          offenders.push(`${file}: found banned token "${token}" as a quoted argument`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

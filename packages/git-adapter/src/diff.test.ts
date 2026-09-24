import { execa } from "execa";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { readDiff } from "./diff.js";

const created: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execa("git", args, { cwd });
}

async function identity(dir: string): Promise<void> {
  await git(dir, "config", "user.email", "fixture@example.com");
  await git(dir, "config", "user.name", "Fixture");
}

/** A repo with one committed `a.txt` ("base\n") and no upstream. */
async function makeRepo(): Promise<string> {
  const dir = await tempDir("git-adapter-diff-");
  await git(dir, "init");
  await identity(dir);
  await writeFile(join(dir, "a.txt"), "base\n");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-m", "base");
  return dir;
}

function numberedLines(count: number, width = 0): string {
  return Array.from({ length: count }, (_, i) => `line ${i}`.padEnd(width, "x") + "\n").join("");
}

afterAll(async () => {
  for (const dir of created) await rm(dir, { recursive: true, force: true });
});

describe("readDiff", () => {
  it("reports an uncommitted 3-line change with numstat counts and + lines", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "a.txt"), "base\nadd one\nadd two\nadd three\n");

    const diff = await readDiff(repo);

    expect(diff.files).toEqual([{ path: "a.txt", added: 3, removed: 0 }]);
    expect(diff.unified).toContain("+add one");
    expect(diff.unified).toContain("+add three");
    expect(diff.truncated).toBe(false);
    expect(diff.totalAdded).toBe(3);
    expect(diff.totalRemoved).toBe(0);
  });

  it("caps a 600-line change at 400 lines and 64 KiB but keeps the full numstat totals", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "a.txt"), "base\n" + numberedLines(600));

    const diff = await readDiff(repo);

    expect(diff.truncated).toBe(true);
    expect(diff.unified.split("\n").length).toBeLessThanOrEqual(400);
    expect(Buffer.byteLength(diff.unified)).toBeLessThanOrEqual(65536);
    expect(diff.totalAdded).toBe(600);
  });

  it("caps by bytes on a line boundary when lines are long", async () => {
    const repo = await makeRepo();
    // 300 lines of ~500 multi-byte-safe chars: well under 400 lines, well over 64 KiB.
    await writeFile(join(repo, "a.txt"), "base\n" + numberedLines(300, 500).replace(/x/g, "é"));

    const diff = await readDiff(repo);

    expect(diff.truncated).toBe(true);
    expect(Buffer.byteLength(diff.unified)).toBeLessThanOrEqual(65536);
    expect(diff.unified).not.toContain("�");
    // Every kept line is whole: the last kept added line has its full width.
    const lastAdded = diff.unified.split("\n").filter((l) => l.startsWith("+line")).at(-1);
    expect(lastAdded?.length).toBe(501);
    expect(diff.totalAdded).toBe(300);
  });

  it("diffs against the merge-base with @{upstream}: unpushed commits plus uncommitted changes", async () => {
    const origin = await makeRepo();
    const parent = await tempDir("git-adapter-diff-clone-");
    const clone = join(parent, "clone");
    await execa("git", ["clone", origin, clone]);
    await identity(clone);
    await writeFile(join(clone, "pushed-later.txt"), "unpushed\n");
    await git(clone, "add", "-A");
    await git(clone, "commit", "-m", "unpushed");
    await writeFile(join(clone, "a.txt"), "base\nlocal edit\n");

    const diff = await readDiff(clone);

    const paths = diff.files.map((f) => f.path).sort();
    expect(paths).toEqual(["a.txt", "pushed-later.txt"]);
    expect(diff.unified).toContain("+unpushed");
    expect(diff.unified).toContain("+local edit");
  });

  it("diffs against HEAD when there is no upstream: committed work is not in the diff", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "committed.txt"), "already committed\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "second");

    const diff = await readDiff(repo);

    expect(diff.files).toEqual([]);
    expect(diff.unified).toBe("");
    expect(diff.truncated).toBe(false);
  });

  it("reports a binary change as added 0, removed 0", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "bin.dat"), Buffer.from([0, 1, 2, 3, 0, 255]));
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "binary");
    await writeFile(join(repo, "bin.dat"), Buffer.from([0, 9, 9, 9, 0, 254, 0]));

    const diff = await readDiff(repo);

    expect(diff.files).toEqual([{ path: "bin.dat", added: 0, removed: 0 }]);
    expect(diff.totalAdded).toBe(0);
  });

  it("never runs a repo-configured diff.external or textconv program (fail-first control)", async () => {
    const repo = await makeRepo();
    const scripts = await tempDir("git-adapter-diff-driver-");
    const marker = join(scripts, "marker.txt");
    const driver = join(scripts, "driver.cjs");
    // Writes the marker, then behaves as a textconv (prints the file) when given one path.
    await writeFile(
      driver,
      `const fs = require("node:fs");\n` +
        `fs.writeFileSync(${JSON.stringify(marker)}, "ran");\n` +
        `if (process.argv.length === 3) process.stdout.write(fs.readFileSync(process.argv[2]));\n`,
    );
    const command = `node "${driver.replace(/\\/g, "/")}"`;
    await git(repo, "config", "diff.external", command);
    await git(repo, "config", "diff.mk.textconv", command);
    await writeFile(join(repo, ".gitattributes"), "*.txt diff=mk\n");
    await writeFile(join(repo, "a.txt"), "base\nchanged\n");

    // Control: git's diff subcommand without the safety flags runs the configured program.
    await execa("git", ["diff", "HEAD"], { cwd: repo });
    expect(existsSync(marker)).toBe(true);
    await unlink(marker);

    const diff = await readDiff(repo);

    expect(existsSync(marker)).toBe(false);
    expect(diff.files).toEqual([{ path: "a.txt", added: 1, removed: 0 }]);
  });

  // CR-02 (06-REVIEW): core.fsmonitor and filter.<name>.clean still run under
  // `git diff <base>`; neither may ever see the worker's credential.
  it("never hands WORKER_TOKEN to a repo-configured fsmonitor hook or clean filter (fail-first control)", async () => {
    const repo = await makeRepo();
    const scripts = await tempDir("git-adapter-diff-leak-");
    const marker = join(scripts, "env.txt");
    const leak = join(scripts, "leak.cjs");
    // Records the token it can see; as a clean filter it also passes stdin through.
    await writeFile(
      leak,
      `require("node:fs").appendFileSync(${JSON.stringify(marker)}, String(process.env.WORKER_TOKEN) + "\\n");\n` +
        `if (process.argv[2] === "filter") process.stdin.pipe(process.stdout);\n`,
    );
    const command = `node "${leak.replace(/\\/g, "/")}"`;
    await git(repo, "config", "core.fsmonitor", command);
    await git(repo, "config", "filter.leak.clean", `${command} filter`);
    await writeFile(join(repo, ".gitattributes"), "*.txt filter=leak\n");
    await writeFile(join(repo, "a.txt"), "base\nchanged\n");
    vi.stubEnv("WORKER_TOKEN", "s3cret-worker-token");
    try {
      // Control: a plain git diff hands the token to the configured programs.
      await execa("git", ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "HEAD", "--"], { cwd: repo });
      expect(readFileSync(marker, "utf8")).toContain("s3cret-worker-token");
      await unlink(marker);

      const diff = await readDiff(repo);

      expect(existsSync(marker) ? readFileSync(marker, "utf8") : "").not.toContain("s3cret-worker-token");
      expect(diff.files.map((f) => f.path)).toContain("a.txt");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

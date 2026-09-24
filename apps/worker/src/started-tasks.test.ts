import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimTaskStart } from "./started-tasks.js";

// 06-REVIEW WR-11 (iteration 2, option a): a worker restart never starts the
// same env task twice; a blocked task is then resumed only by the CEO.
describe("claimTaskStart", () => {
  let base: string;
  let stateDir: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "worker-started-tasks-"));
    stateDir = join(base, "nested", "state");
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("claims a task once, across calls that each re-read the record from disk", async () => {
    expect(await claimTaskStart(stateDir, "task-1")).toBe(true);
    expect(await claimTaskStart(stateDir, "task-1")).toBe(false);
    expect(await claimTaskStart(stateDir, "task-2")).toBe(true);
    expect(await claimTaskStart(stateDir, "task-2")).toBe(false);
    expect(JSON.parse(await readFile(join(stateDir, "started-tasks.json"), "utf8"))).toEqual(["task-1", "task-2"]);
  });

  it("leaves no temp file behind (the write is a rename)", async () => {
    await claimTaskStart(stateDir, "task-1");
    expect(await readdir(stateDir)).toEqual(["started-tasks.json"]);
  });

  it("refuses to guess when the record is unreadable, so nothing starts twice", async () => {
    await claimTaskStart(stateDir, "task-1");
    await writeFile(join(stateDir, "started-tasks.json"), "{not json");
    await expect(claimTaskStart(stateDir, "task-2")).rejects.toThrow(/started-tasks\.json/);
    await writeFile(join(stateDir, "started-tasks.json"), '{"task-1":true}');
    await expect(claimTaskStart(stateDir, "task-2")).rejects.toThrow(/started-tasks\.json/);
  });
});

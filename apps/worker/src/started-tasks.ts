import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 06-REVIEW WR-11 (iteration 2, user decision option a): records the env task
 * ids this worker has started, so a restart never starts one again alongside a
 * CEO resume in the same worktree. Returns true when the caller may start the
 * task. The id is recorded before the task starts: a crash in between loses
 * the start rather than risking a second one. An unreadable record throws.
 *
 * ponytail: one worker per state dir (no lock between processes); the record
 * only grows, one id per operator launch.
 */
export async function claimTaskStart(stateDir: string, taskId: string): Promise<boolean> {
  const file = join(stateDir, "started-tasks.json");
  let started: string[] = [];
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) throw new Error("not a list of task ids");
    started = parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Cannot read the started-task record ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (started.includes(taskId)) return false;

  await mkdir(stateDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify([...started, taskId]));
  await rename(tmp, file);
  return true;
}

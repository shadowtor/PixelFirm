// RED-phase stub: functions intentionally unimplemented so commit.test.ts
// fails on real assertions (not module-resolution) ahead of the GREEN pass.
export async function readHead(_repoPath: string): Promise<string> {
  throw new Error("not implemented");
}

export async function readBranch(_repoPath: string): Promise<string> {
  throw new Error("not implemented");
}

export async function isGitWorktree(_repoPath: string): Promise<boolean> {
  throw new Error("not implemented");
}

// RED-phase stub: unimplemented so worktree.test.ts fails on a real
// assertion/rejection ahead of the GREEN pass.
export interface WorktreeRecord {
  path: string;
  headSha?: string;
  branch?: string;
  bare?: boolean;
  detached?: boolean;
}

export async function listWorktrees(_repoPath: string): Promise<WorktreeRecord[]> {
  throw new Error("not implemented");
}

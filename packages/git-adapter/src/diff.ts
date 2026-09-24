export interface DiffSummary {
  files: { path: string; added: number; removed: number }[];
  unified: string;
  truncated: boolean;
  totalAdded: number;
  totalRemoved: number;
}

// RED stub: signature only, implementation follows in the GREEN commit.
export async function readDiff(
  _worktreePath: string,
  _caps = { maxLines: 400, maxBytes: 65_536, maxFiles: 500 },
): Promise<DiffSummary> {
  return { files: [], unified: "", truncated: false, totalAdded: 0, totalRemoved: 0 };
}

import matter from "gray-matter";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// WR-01: phaseId is spliced into new RegExp() source strings below — escape
// regex metacharacters so a phaseId containing them (once callers derive it
// from STATE.md's current_phase per CR-02, rather than always undefined)
// can't throw a SyntaxError or silently match unintended files.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface PhaseFilesResult {
  hasContext: boolean;
  hasResearch: boolean;
  planCount: number;
  summaryCount: number;
  hasVerification: boolean;
  verificationStatus: string | undefined;
  hasReview: boolean;
}

const EMPTY_RESULT: PhaseFilesResult = {
  hasContext: false,
  hasResearch: false,
  planCount: 0,
  summaryCount: 0,
  hasVerification: false,
  verificationStatus: undefined,
  hasReview: false,
};

// Naming convention verified against real, already-executed phase
// directories in this repo (03-RESEARCH.md Pattern 4): NN-CONTEXT.md,
// NN-RESEARCH.md, NN-##-PLAN.md/SUMMARY.md, NN-VERIFICATION.md, NN-REVIEW.md.
export async function scanPhaseDir(planningDir: string, phaseId: string): Promise<PhaseFilesResult> {
  const phasesRoot = join(planningDir, "phases");
  if (!existsSync(phasesRoot)) return EMPTY_RESULT;

  const phaseDirName = readdirSync(phasesRoot, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.startsWith(`${phaseId}-`),
  )?.name;
  if (!phaseDirName) return EMPTY_RESULT;

  const phaseDir = join(phasesRoot, phaseDirName);
  const files = readdirSync(phaseDir);

  const escapedPhaseId = escapeRegExp(phaseId);
  const planRegex = new RegExp(`^${escapedPhaseId}-\\d+-PLAN\\.md$`);
  const summaryRegex = new RegExp(`^${escapedPhaseId}-\\d+-SUMMARY\\.md$`);
  const verificationFile = `${phaseId}-VERIFICATION.md`;
  const hasVerification = files.includes(verificationFile);

  let verificationStatus: string | undefined;
  if (hasVerification) {
    const content = await readFile(join(phaseDir, verificationFile), "utf-8");
    const { data } = matter(content);
    verificationStatus = typeof data.status === "string" ? data.status : undefined;
  }

  return {
    hasContext: files.includes(`${phaseId}-CONTEXT.md`),
    hasResearch: files.includes(`${phaseId}-RESEARCH.md`),
    planCount: files.filter((f) => planRegex.test(f)).length,
    summaryCount: files.filter((f) => summaryRegex.test(f)).length,
    hasVerification,
    verificationStatus,
    hasReview: files.includes(`${phaseId}-REVIEW.md`),
  };
}

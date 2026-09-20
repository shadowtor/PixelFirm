export interface PhaseFilesResult {
  hasContext: boolean;
  hasResearch: boolean;
  planCount: number;
  summaryCount: number;
  hasVerification: boolean;
  verificationStatus: string | undefined;
  hasReview: boolean;
}

export async function scanPhaseDir(planningDir: string, phaseId: string): Promise<PhaseFilesResult> {
  throw new Error("not implemented");
}

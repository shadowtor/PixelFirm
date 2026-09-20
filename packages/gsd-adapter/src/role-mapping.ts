import type { PhaseFilesResult } from "./phase-files.js";

export interface RoleMappingInput {
  status: string;
  phaseFiles: PhaseFilesResult | null;
  roadmapPhaseCompleted: boolean;
}

export interface RoleMappingResult {
  category: string;
  role: string;
}

export function mapToGsdCategory(input: RoleMappingInput): RoleMappingResult {
  throw new Error("not implemented");
}

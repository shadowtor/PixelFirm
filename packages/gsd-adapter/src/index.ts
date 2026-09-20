export { readStateMd, STATUS_EXACT_TOKENS } from "./state-md.js";
export type { StateMdResult } from "./state-md.js";
export { scanPhaseDir } from "./phase-files.js";
export type { PhaseFilesResult } from "./phase-files.js";
export { mapToGsdCategory } from "./role-mapping.js";
export type { RoleMappingInput, RoleMappingResult } from "./role-mapping.js";

import { scanPhaseDir } from "./phase-files.js";
import { mapToGsdCategory } from "./role-mapping.js";
import { readStateMd } from "./state-md.js";

export interface GsdObservation {
  phase: string | undefined;
  status: string;
  category: string;
  role: string;
}

// Composes the full observation pipeline: readStateMd -> scanPhaseDir (when a
// phase is known) -> mapToGsdCategory. Matches event-schema's
// GsdPhaseObservedPayload minus `active` — this package stays a pure,
// stateless observer and never itself claims liveness; Plan 04's poll loop
// combines this output with git-adapter's process-liveness signal to compute
// `active`.
export async function observeGsdState(
  planningDir: string,
  phaseId: string | undefined,
  roadmapPhaseCompleted: boolean,
): Promise<GsdObservation> {
  const stateResult = await readStateMd(planningDir);
  const status = stateResult?.status ?? "unknown";
  const phaseFiles = phaseId ? await scanPhaseDir(planningDir, phaseId) : null;
  const { category, role } = mapToGsdCategory({ status, phaseFiles, roadmapPhaseCompleted });

  return { phase: phaseId, status, category, role };
}

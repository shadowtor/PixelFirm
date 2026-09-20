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
  phaseIdOverride: string | undefined,
  roadmapPhaseCompleted: boolean,
): Promise<GsdObservation> {
  const stateResult = await readStateMd(planningDir);
  const status = stateResult?.status ?? "unknown";
  // CR-02: readStateMd already parses `current_phase` from STATE.md — fall
  // back to it (zero-padded to the `NN` directory-prefix format
  // scanPhaseDir expects) whenever the caller doesn't supply an explicit
  // override, so production callers that pass `undefined` still get a real
  // phaseId instead of permanently short-circuiting to `new_project`/`unknown`.
  const phaseId =
    phaseIdOverride ??
    (stateResult?.currentPhase !== undefined ? String(stateResult.currentPhase).padStart(2, "0") : undefined);
  const phaseFiles = phaseId ? await scanPhaseDir(planningDir, phaseId) : null;
  const { category, role } = mapToGsdCategory({ status, phaseFiles, roadmapPhaseCompleted });

  return { phase: phaseId, status, category, role };
}

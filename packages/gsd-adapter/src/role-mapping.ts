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

// Dispatch table over (status, phase-file-presence) mirroring
// packages/company-core/src/reducer.ts's dispatch-table-by-key pattern: pure,
// input-determined output only. Implements 03-RESEARCH.md Pattern 4's
// category/role table. "approval" is never returned this phase (Open
// Question 3 — no STATE.md/file-presence signal exists yet for it; reserved
// in event-schema's GsdPhaseObservedPayload role/category enums for Phase 6).
//
// The single, explicit final fallback below is the load-bearing
// implementation of the kept prohibition (T-03-07): any status/file-presence
// combination this table doesn't recognize resolves unknown/unknown rather
// than a specific, plausible-looking guess.
export function mapToGsdCategory(input: RoleMappingInput): RoleMappingResult {
  const { status, phaseFiles, roadmapPhaseCompleted } = input;

  // Deployment: a ROADMAP.md phase-checkbox flip is the closest available
  // proxy signal (Open Question 3) and takes precedence over a plain
  // "completed" status, per the plan's explicit precedence rule.
  if (roadmapPhaseCompleted) {
    return { category: "deployment", role: "DevOps" };
  }

  // New project: either no STATE.md at all (status normalizes to "unknown"),
  // or a STATE.md that's only ever reached "planning" (SyncSmith's real,
  // verified-this-session shape: status: planning, no current_phase key, no
  // .planning/phases directory yet) — in both cases no phase-directory
  // signal exists either. Nobody is assigned to work that doesn't exist yet,
  // so role is "unknown" by design, not a guessed PM assignment. Deliberately
  // does NOT cover "discussing"/"executing"/etc. + no phase signal — those
  // are a genuinely contradictory combination (STATE.md claims later-pipeline
  // progress the file system doesn't back up), which must fall through to
  // the final unknown/unknown fallback rather than guess "new_project" too.
  if ((status === "unknown" || status === "planning") && !hasAnyPhaseSignal(phaseFiles)) {
    return { category: "new_project", role: "unknown" };
  }

  if (status === "planning" && phaseFiles && phaseFiles.planCount === 0) {
    if (phaseFiles.hasResearch) {
      return { category: "research", role: "Research Agent" };
    }
    if (phaseFiles.hasContext) {
      return { category: "planning", role: "Architect" };
    }
  }

  if (status === "executing" && phaseFiles && phaseFiles.planCount > phaseFiles.summaryCount) {
    return { category: "execution", role: "Engineering" };
  }

  if (status === "verifying" && phaseFiles) {
    if (phaseFiles.hasVerification && phaseFiles.verificationStatus === "passed" && !phaseFiles.hasReview) {
      return { category: "review", role: "Reviewer" };
    }
    if (!phaseFiles.hasVerification) {
      return { category: "verification", role: "QA" };
    }
  }

  return { category: "unknown", role: "unknown" };
}

function hasAnyPhaseSignal(phaseFiles: PhaseFilesResult | null): boolean {
  if (!phaseFiles) return false;
  return phaseFiles.hasContext || phaseFiles.hasResearch || phaseFiles.planCount > 0;
}

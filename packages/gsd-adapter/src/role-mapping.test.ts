import { describe, expect, it } from "vitest";
import type { PhaseFilesResult } from "./phase-files.js";
import { mapToGsdCategory } from "./role-mapping.js";

function phaseFiles(overrides: Partial<PhaseFilesResult> = {}): PhaseFilesResult {
  return {
    hasContext: false,
    hasResearch: false,
    planCount: 0,
    summaryCount: 0,
    hasVerification: false,
    verificationStatus: undefined,
    hasReview: false,
    ...overrides,
  };
}

describe("role-mapping.ts", () => {
  it("status unknown (no STATE.md at all) with no phases directory: new_project / unknown", () => {
    const result = mapToGsdCategory({ status: "unknown", phaseFiles: null, roadmapPhaseCompleted: false });
    expect(result).toEqual({ category: "new_project", role: "unknown" });
  });

  it("status planning with NN-CONTEXT.md but zero PLANs: planning / Architect", () => {
    const result = mapToGsdCategory({
      status: "planning",
      phaseFiles: phaseFiles({ hasContext: true, planCount: 0 }),
      roadmapPhaseCompleted: false,
    });
    expect(result).toEqual({ category: "planning", role: "Architect" });
  });

  it("status executing with a PLAN missing its matching SUMMARY: execution / Engineering", () => {
    const result = mapToGsdCategory({
      status: "executing",
      phaseFiles: phaseFiles({ planCount: 2, summaryCount: 1 }),
      roadmapPhaseCompleted: false,
    });
    expect(result).toEqual({ category: "execution", role: "Engineering" });
  });

  it("status verifying with NN-VERIFICATION.md frontmatter status 'passed': review / Reviewer", () => {
    const result = mapToGsdCategory({
      status: "verifying",
      phaseFiles: phaseFiles({ planCount: 2, summaryCount: 2, hasVerification: true, verificationStatus: "passed" }),
      roadmapPhaseCompleted: false,
    });
    expect(result).toEqual({ category: "review", role: "Reviewer" });
  });

  it("ROADMAP.md phase checkbox flipped to [x] takes precedence over a plain 'completed' status: deployment / DevOps", () => {
    const result = mapToGsdCategory({
      status: "completed",
      phaseFiles: phaseFiles({ planCount: 2, summaryCount: 2 }),
      roadmapPhaseCompleted: true,
    });
    expect(result).toEqual({ category: "deployment", role: "DevOps" });
  });

  it("never resolves category 'approval' for any input this phase (no signal source exists yet)", () => {
    const rows: Array<Parameters<typeof mapToGsdCategory>[0]> = [
      { status: "unknown", phaseFiles: null, roadmapPhaseCompleted: false },
      { status: "planning", phaseFiles: phaseFiles({ hasContext: true }), roadmapPhaseCompleted: false },
      { status: "executing", phaseFiles: phaseFiles({ planCount: 1 }), roadmapPhaseCompleted: false },
      { status: "verifying", phaseFiles: phaseFiles({ hasVerification: true, verificationStatus: "passed" }), roadmapPhaseCompleted: false },
      { status: "completed", phaseFiles: phaseFiles(), roadmapPhaseCompleted: true },
      { status: "paused", phaseFiles: null, roadmapPhaseCompleted: false },
    ];
    for (const row of rows) {
      expect(mapToGsdCategory(row).category).not.toBe("approval");
    }
  });

  it("a combination matching no defined row (e.g. status 'paused') resolves unknown / unknown — never a guessed category or role", () => {
    const result = mapToGsdCategory({ status: "paused", phaseFiles: null, roadmapPhaseCompleted: false });
    expect(result).toEqual({ category: "unknown", role: "unknown" });
  });

  it("status 'discussing' with no clear phase-file signal resolves unknown / unknown", () => {
    const result = mapToGsdCategory({ status: "discussing", phaseFiles: phaseFiles(), roadmapPhaseCompleted: false });
    expect(result).toEqual({ category: "unknown", role: "unknown" });
  });

  it("a deliberately nonsensical combination (executing status, zero PLANs, no phase dir at all) resolves unknown / unknown", () => {
    const result = mapToGsdCategory({ status: "executing", phaseFiles: null, roadmapPhaseCompleted: false });
    expect(result).toEqual({ category: "unknown", role: "unknown" });
  });
});

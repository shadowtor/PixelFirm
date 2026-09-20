import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanPhaseDir } from "./phase-files.js";
import { readStateMd, STATUS_EXACT_TOKENS } from "./state-md.js";

describe("state-md.ts", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gsd-adapter-state-md-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("STATUS_EXACT_TOKENS has 18 keys mapping to exactly 7 distinct values (byte-identical to gsd-core's own vocabulary)", () => {
    expect(Object.keys(STATUS_EXACT_TOKENS)).toHaveLength(18);
    expect(new Set(Object.values(STATUS_EXACT_TOKENS)).size).toBe(7);
  });

  it("normalizes a real PixelFirm-shaped STATE.md (status + current_phase + nested progress)", async () => {
    await writeFile(
      join(dir, "STATE.md"),
      [
        "---",
        'gsd_state_version: "1.0"',
        "current_phase: 3",
        "status: planning",
        "progress:",
        "  total_phases: 8",
        "  completed_phases: 2",
        "---",
        "",
        "# Project State",
        "",
      ].join("\n"),
    );

    const result = await readStateMd(dir);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("planning");
    expect(result!.currentPhase).toBe(3);
    expect(result!.raw.status).toBe("planning");
  });

  it("normalizes SyncSmith's real shape (no current_phase key at all) without throwing", async () => {
    await writeFile(
      join(dir, "STATE.md"),
      [
        "---",
        "gsd_state_version: '1.0'",
        "status: planning",
        "progress:",
        "  total_phases: 7",
        "  completed_phases: 0",
        "  total_plans: 0",
        "  completed_plans: 0",
        "  percent: 0",
        "---",
        "",
      ].join("\n"),
    );

    const result = await readStateMd(dir);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("planning");
    expect(result!.currentPhase).toBeUndefined();
  });

  it("resolves null for a planningDir with no STATE.md file at all (not a thrown error)", async () => {
    const result = await readStateMd(dir);
    expect(result).toBeNull();
  });

  it("normalizes known status aliases exactly, and falls back to unknown for an unrecognized raw string", async () => {
    await writeFile(join(dir, "STATE.md"), '---\nstatus: "ready to plan"\n---\n');
    expect((await readStateMd(dir))!.status).toBe("planning");

    await writeFile(join(dir, "STATE.md"), '---\nstatus: "planning complete"\n---\n');
    expect((await readStateMd(dir))!.status).toBe("planning");

    await writeFile(join(dir, "STATE.md"), '---\nstatus: "phase complete — ready for verification"\n---\n');
    expect((await readStateMd(dir))!.status).toBe("verifying");

    await writeFile(join(dir, "STATE.md"), '---\nstatus: "some nonsense value nobody wrote"\n---\n');
    expect((await readStateMd(dir))!.status).toBe("unknown");
  });
});

describe("phase-files.ts", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gsd-adapter-phase-files-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("never throws when .planning/phases/ doesn't exist at all — resolves all-false/zero", async () => {
    const result = await scanPhaseDir(dir, "03");
    expect(result).toEqual({
      hasContext: false,
      hasResearch: false,
      planCount: 0,
      summaryCount: 0,
      hasVerification: false,
      verificationStatus: undefined,
      hasReview: false,
    });
  });

  it("resolves hasContext: true and zero plans for a phase dir containing only NN-CONTEXT.md", async () => {
    const phaseDir = join(dir, "phases", "03-worker-git-adapter-gsd-adapter");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "03-CONTEXT.md"), "# Context\n");

    const result = await scanPhaseDir(dir, "03");

    expect(result).toEqual({
      hasContext: true,
      hasResearch: false,
      planCount: 0,
      summaryCount: 0,
      hasVerification: false,
      verificationStatus: undefined,
      hasReview: false,
    });
  });
});

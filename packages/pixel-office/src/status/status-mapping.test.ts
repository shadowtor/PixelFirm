import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AgentStatus } from "event-schema";
import { STATUS_MAP, resolveStatusVisual } from "./status-mapping";

describe("STATUS_MAP exhaustiveness", () => {
  it("has a defined entry for every one of the 15 AgentStatus values", () => {
    const values = Object.values(AgentStatus);
    expect(values.length).toBe(15);
    for (const status of values) {
      expect(STATUS_MAP[status]).toBeDefined();
      expect(resolveStatusVisual(status)).toBe(STATUS_MAP[status]);
    }
  });
});

describe("OFFICE-03 blocked/waiting glanceable signal", () => {
  it("gives waiting_for_agent and waiting_for_ceo different bubble icons", () => {
    expect(STATUS_MAP.waiting_for_agent.bubble).not.toBe(STATUS_MAP.waiting_for_ceo.bubble);
  });

  it("freezes blocked, waiting_for_agent, and waiting_for_ceo (idle-loop suppressed)", () => {
    expect(STATUS_MAP.blocked.frozen).toBe(true);
    expect(STATUS_MAP.waiting_for_agent.frozen).toBe(true);
    expect(STATUS_MAP.waiting_for_ceo.frozen).toBe(true);
  });

  it("does not freeze active/terminal states", () => {
    expect(STATUS_MAP.idle.frozen).toBeUndefined();
    expect(STATUS_MAP.coding.frozen).toBeUndefined();
    expect(STATUS_MAP.failed.frozen).toBeUndefined();
    expect(STATUS_MAP.completed.frozen).toBeUndefined();
  });
});

describe("offline sentinel", () => {
  it("resolves pose to null — not rendered, despawned from the floor", () => {
    expect(STATUS_MAP.offline.pose).toBeNull();
  });
});

describe("deploying's procedural speed variation", () => {
  it("is the only state carrying a frameSpeedMultiplier", () => {
    for (const [status, visual] of Object.entries(STATUS_MAP)) {
      if (status === AgentStatus.DEPLOYING) {
        expect(visual.frameSpeedMultiplier).toBe(1.5);
      } else {
        expect(visual.frameSpeedMultiplier).toBeUndefined();
      }
    }
  });
});

const spritesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "sprites");

const NEW_SPRITE_FILES = [
  "bubble-blocked.json",
  "bubble-failed.json",
  "bubble-completed.json",
  "badge-planning.json",
  "badge-researching.json",
  "badge-testing.json",
  "badge-reviewing.json",
  "badge-discussing.json",
  "badge-deploying.json",
];

describe("new bubble/badge sprite assets", () => {
  it.each(NEW_SPRITE_FILES)("%s parses as valid JSON with a palette object and 13-row pixels array", (file) => {
    const raw = readFileSync(join(spritesDir, file), "utf-8");
    const parsed = JSON.parse(raw) as { palette: Record<string, string>; pixels: string[][] };
    expect(typeof parsed.palette).toBe("object");
    expect(parsed.palette).not.toBeNull();
    expect(Array.isArray(parsed.pixels)).toBe(true);
    expect(parsed.pixels.length).toBe(13);
    for (const row of parsed.pixels) {
      expect(Array.isArray(row)).toBe(true);
      expect(row.length).toBe(11);
    }
  });
});

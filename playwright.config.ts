import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: process.env.PIXELFIRM_STAGING_URL ?? "https://test.pixelfirm.dev",
  },
  projects: [{ name: "control-plane" }],
});

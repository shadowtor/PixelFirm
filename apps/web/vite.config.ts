import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // No @types/node here, so the "@" alias uses the URL form rather than path.resolve.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // scripts/check-office-bundle.mjs reads dist/.vite/manifest.json.
  build: { manifest: true },
  server: {
    // Same origin in dev, so CORS never enters (server.ts forbids a CORS plugin).
    proxy: {
      "/ceo/api": "http://localhost:3000",
      "/ceo/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});

#!/usr/bin/env node
// Scope-isolation check for the office route (06-08, 06-UI-SPEC "Scope isolation").
// Run after `pnpm --filter web build`:  node scripts/check-office-bundle.mjs
//
// The office route is what OBS captures, so it must load no dashboard code and no
// Tailwind preflight. Reads Vite's build manifest and fails when:
//   - any CSS reachable from the index.html entry through static imports contains "tailwindcss"
//   - src/ceo/CeoApp.tsx is a static import of the entry
// Positive control (Assumption A5): it also fails unless CeoApp is a dynamic import of the
// entry whose own CSS contains "tailwindcss", which proves the check can see Tailwind at all.
import { readFileSync } from "node:fs";

const dist = new URL("../apps/web/dist/", import.meta.url);
const CEO = "src/ceo/CeoApp.tsx";

function fail(message) {
  console.error(`office bundle: ${message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(new URL(".vite/manifest.json", dist), "utf8"));
} catch (error) {
  fail(`cannot read apps/web/dist/.vite/manifest.json (run the web build first): ${error.message}`);
}

const entry = manifest["index.html"];
if (!entry) fail("apps/web/dist/.vite/manifest.json has no index.html entry");

const hasTailwind = (file) => readFileSync(new URL(file, dist), "utf8").includes("tailwindcss");

// Walk the entry's static import closure: everything the office route loads up front.
const seen = new Set();
const pending = ["index.html"];
while (pending.length > 0) {
  const key = pending.pop();
  if (seen.has(key)) continue;
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk) fail(`manifest references missing chunk ${key}`);
  if (key === CEO) fail(`${CEO} is statically imported by the office entry`);
  for (const css of chunk.css ?? []) {
    if (hasTailwind(css)) fail(`${css} (loaded by the office route) contains Tailwind`);
  }
  pending.push(...(chunk.imports ?? []));
}

if (!(entry.dynamicImports ?? []).includes(CEO)) {
  fail(`${CEO} is not a dynamic import of the office entry`);
}
const ceoCss = manifest[CEO]?.css ?? [];
if (!ceoCss.some(hasTailwind)) {
  fail(`positive control failed: no CSS of ${CEO} contains Tailwind, so the check cannot see it`);
}

console.log(`office bundle clean: ${seen.size} static chunk(s), Tailwind only in ${ceoCss.join(", ")}`);

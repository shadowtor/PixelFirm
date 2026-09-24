---
phase: 06-ceo-dashboard-approval-workflow
plan: 08
subsystem: ui
tags: [shadcn, tailwindcss, kibo-ui, radix-ui, lucide-react, sonner, vite, code-splitting]

requires: []
provides:
  - "/ceo lazy chunk: main.tsx path check -> dynamic import of ceo/CeoApp (D-08)"
  - "ceo/ceo.css: the only Tailwind entry, UI-SPEC dark palette, system font stacks"
  - "shadcn radix-nova components (17 + hand-written sonner) and Kibo choicebox/status under @/components"
  - "@/ alias (tsconfig + vite), build.manifest, dev proxy for /ceo/api and /ceo/ws"
  - "scripts/check-office-bundle.mjs: manifest-based scope-isolation check with a Tailwind positive control"
affects: [06-09, 06-10, 06-14, 07-obs-capture]

actuals:
  tokens: 14258      # chars/4 over the realized diff excluding pnpm-lock.yaml (68240 including the lockfile)
  tasks: 2
  commits: 1
plan_head_before: fe4c54b993b736ff803dc47fd739d5df456aadd0

tech-stack:
  added: [tailwindcss@4.3.3, "@tailwindcss/vite@4.3.3", shadcn@4.21.0, cn@0.4.0, lucide-react@1.47.0, radix-ui@1.6.7, class-variance-authority@0.7.1, sonner@2.0.8, tw-animate-css@1.4.0]
  patterns:
    - "Dashboard code and CSS live only behind import(\"./ceo/CeoApp\"); nothing under src/ceo, src/components or src/lib is imported by the office route"
    - "Dark-only theme: @custom-variant dark (&) so every dark: utility always applies on /ceo"

key-files:
  created:
    - apps/web/components.json
    - apps/web/src/ceo/CeoApp.tsx
    - apps/web/src/ceo/ceo.css
    - apps/web/src/lib/utils.ts
    - apps/web/src/components/ui/*.tsx (18 files)
    - apps/web/src/components/kibo-ui/choicebox/index.tsx
    - apps/web/src/components/kibo-ui/status/index.tsx
    - scripts/check-office-bundle.mjs
  modified:
    - apps/web/src/main.tsx
    - apps/web/vite.config.ts
    - apps/web/tsconfig.json
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "No shadcn init: components.json hand-written (radix-nova, lucide, css src/ceo/ceo.css) so no @fontsource webfont is installed (user: approve cn)"
  - "sonner.tsx hand-written with theme=dark; next-themes not installed"
  - "cn@0.4.0 approved by the user; shadcn radix-nova components import cn from it directly and lib/utils.ts re-exports it for Kibo"
  - "dark: variant made unconditional in ceo.css because the dashboard is dark only and portals render outside the page root"

patterns-established:
  - "Office bundle check: node scripts/check-office-bundle.mjs after the web build; fails with an 'office bundle:' line"

requirements-completed: [CEO-02]

coverage:
  - id: D1
    description: "/ceo loads as a lazy chunk; the office entry has no Tailwind CSS and no static CeoApp import"
    requirement: CEO-02
    verification:
      - kind: automated_ui
        ref: "pnpm --filter web build && node scripts/check-office-bundle.mjs"
        status: pass
      - kind: e2e
        ref: "e2e/office-disconnect.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "shadcn + Kibo components installed, typecheck and web unit tests green"
    requirement: CEO-02
    verification:
      - kind: unit
        ref: "pnpm --filter web typecheck && pnpm --filter web test"
        status: pass
    human_judgment: false

duration: 13min (continuation; excludes the earlier agent's time before the checkpoints)
completed: 2026-09-24
status: complete
---

# Phase 6 Plan 08: /ceo Scaffold Summary

**Lazy `/ceo` chunk with shadcn radix-nova, Tailwind v4 and the Kibo choicebox/status items in the UI-SPEC dark palette, plus a Vite-manifest check proving the office route loads no Tailwind and no dashboard code.**

## Performance

- **Duration:** 13 min (this continuation)
- **Started:** 2026-09-24T02:40:22Z
- **Completed:** 2026-09-24T02:53:28Z
- **Tasks:** 2 (Task 1 verification-only, Task 2 committed)
- **Files modified:** 30

## Approvals

- **Task 1 (package legitimacy):** user replied **"approved"** on 2026-09-24 for shadcn 4.21.0, lucide-react 1.47.0 and tailwind-merge 3.7.0. Nothing was installed before this reply.
- **Task 2 (second checkpoint):** the live shadcn 4.21.0 registry pulls in three unvetted packages: cn@0.4.0 (every radix-nova component), next-themes@0.4.6 (the sonner item) and @fontsource-variable/* (every `shadcn init` preset, which breaks the UI-SPEC's "No webfont is loaded"). User replied **"approve cn"**. That approval was applied as follows:
  - cn@0.4.0 installed.
  - `shadcn init` not run. `components.json` hand-written; the init deps (shadcn, tw-animate-css, class-variance-authority, lucide-react, radix-ui, plus cn) installed directly.
  - next-themes not installed. `sonner.tsx` hand-written with `theme="dark"`; `sonner` installed.
  - No @fontsource package installed (`grep -c "next-themes|@fontsource" pnpm-lock.yaml` = 0).
  - Before each `shadcn add`, every item's registry JSON was fetched and its `dependencies` checked. All were `cn` only (collapsible: none). Kibo choicebox: lucide-react, radix-ui. Kibo status: none. Nothing fell outside the allowed set, so no further checkpoint was needed.

## Accomplishments

- `main.tsx` builds the root once. For `/ceo` or `/ceo/*` it renders `CeoApp` through `import("./ceo/CeoApp")`; every other path renders `App` from its static import, as before.
- `ceo/CeoApp.tsx` is the only importer of `ceo/ceo.css`. It renders the `#14141F` page root with the h1 "CEO desk"; 06-14 builds the shell on it.
- `ceo/ceo.css` imports tailwindcss, tw-animate-css and shadcn/tailwind.css, and sets the UI-SPEC Color table as shadcn variables along with the `ui-sans-serif`/`ui-monospace` stacks. `index.html` is unchanged (body stays `#3A3A5C`).
- `scripts/check-office-bundle.mjs` walks the index.html entry's static import closure in the manifest and fails if any of its CSS contains Tailwind or if it statically imports CeoApp. It also requires CeoApp to be a dynamic import whose own CSS contains Tailwind (positive control, A5).

## Component Inventory provenance (installed state)

Replaces the UI-SPEC's first provenance line (the UI-SPEC itself was not edited): `npx shadcn@4.21.0 info` in apps/web, 2026-09-24, gives style radix-nova, base radix, iconLibrary lucide, tailwind v4, css src/ceo/ceo.css, alias @, registry @shadcn https://ui.shadcn.com/r/styles/{style}/{name}.json, installed components: alert-dialog, alert, badge, button, checkbox, collapsible, empty, field, label, radio-group, scroll-area, separator, skeleton, sonner, spinner, table, tabs, textarea. (`info` lists preset font "geist*" only as a preset default label. No font package is installed and no @font-face is in the built CSS.)

## Verification

- `pnpm --filter web build && node scripts/check-office-bundle.mjs`: exit 0, "office bundle clean: 1 static chunk(s), Tailwind only in assets/CeoApp-*.css".
- **Negative demo:** with `import "./ceo/ceo.css"` temporarily added to main.tsx, the check printed `office bundle: assets/index-B70ZMf3l.css (loaded by the office route) contains Tailwind` and exited 1. After the revert and rebuild it exited 0 again.
- `pnpm --filter web typecheck`: exit 0. `pnpm --filter web test`: 24/24 passed.
- `npx playwright test e2e/office-disconnect.spec.ts`: 1 passed.
- Browser smoke test (vite preview, Playwright, scratchpad only): `/ceo` renders "CEO desk" on rgb(20,20,31) in `ui-sans-serif, system-ui, sans-serif`. `/` requested only `/` and `/assets/index-*.js`, with no CeoApp chunk and no CSS.
- Built CSS: `.dark\:bg-input\/30{…}` compiles unconditionally, `#ffb703` is present, and there is no `@font-face`.
- Acceptance greps: `startsWith("/ceo/")` found at main.tsx:15. `@import "tailwindcss"` count in ceo.css is 1. Both Kibo index.tsx files exist.

## Task Commits

1. **Task 1: package legitimacy check**: no commit (verification only; the user answered "approved")
2. **Task 2: shadcn + Tailwind in a lazy /ceo chunk + office-bundle check**: `9621d5c` (feat)

## Decisions Made

See key-decisions above. One addition: `--accent` (the shadcn hover fill) is set to the neutral `#1E1E2E`, not amber, because the UI-SPEC reserves amber for exactly six uses.

## Deviations from Plan

**1. [User decision - "approve cn"] No `shadcn init`, hand-written components.json and sonner.tsx**
- **Found during:** Task 2
- **Issue:** init installs an @fontsource webfont (breaks the UI-SPEC) and the sonner item pulls in next-themes. Neither package was vetted.
- **Fix:** followed the user's routing (see Approvals). The CSS that init would have written (tw-animate-css, shadcn/tailwind.css, the base layer, the @theme mapping) was written directly into ceo.css.
- **Files:** apps/web/components.json, apps/web/src/components/ui/sonner.tsx, apps/web/src/ceo/ceo.css
- **Commit:** 9621d5c

**2. [Rule 3 - Blocking] Kibo choicebox imported from the Kibo monorepo path**
- **Found during:** Task 2 (Kibo re-vet)
- **Issue:** the installed file (byte-identical to the vetted registry source) imports `@repo/shadcn-ui/components/ui/radio-group` and `@repo/shadcn-ui/lib/utils`, which the CLI did not rewrite and which do not resolve here.
- **Fix:** rewrote the two specifiers to `@/components/ui/radio-group` and `@/lib/utils`. No other change. The re-vet grep (fetch, XMLHttpRequest, sendBeacon, process.env, eval, new Function, dynamic import) found no matches in either Kibo file.
- **Commit:** 9621d5c

**3. [Rule 3 - Blocking] `src/lib/utils.ts` created by hand**
- **Found during:** Task 2
- **Issue:** radix-nova components import `cn` from the `cn` package directly, so `shadcn add` never wrote lib/utils.ts. Kibo imports `@/lib/utils`.
- **Fix:** wrote the registry's own utils content, `export { cn } from "cn";`.
- **Commit:** 9621d5c

**4. [Note] Kibo `add` asked to overwrite field.tsx; answered no**
- The existing radix-nova field.tsx was kept. cmp confirmed field.tsx and badge.tsx are unchanged.

**Total deviations:** 1 user-directed, 2 auto-fixed (Rule 3), 1 note. **Impact:** no scope creep. The office route is unchanged apart from the path check in main.tsx.

## Issues Encountered

- `shadcn add --yes` still prompts before overwriting and exits 2 without a TTY. Resolved by piping `n`.

## User Setup Required

None.

## Next Phase Readiness

- 06-09, 06-10 and 06-14 can import `@/components/ui/*` and `@/components/kibo-ui/*` from under `src/ceo/`. Anything imported from main.tsx or App.tsx would break the office-bundle check.
- The built CSS is about 53 kB (9 kB gzip) because Tailwind scans all of `src/`. It loads only on `/ceo`.

---
*Phase: 06-ceo-dashboard-approval-workflow*
*Completed: 2026-09-24*

## Self-Check: PASSED

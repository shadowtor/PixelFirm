---
phase: 06-ceo-dashboard-approval-workflow
plan: 12
subsystem: staging-deploy
status: complete
tags: [coolify, cloudflare-access, traefik, staging, playwright, migration]

requires:
  - phase: 06-11
    provides: "live-proven CEO approval workflow"
  - phase: 06-05
    provides: "requireCeo Access JWT verification, migration 0004, NODE_ENV=production in the API image"
provides:
  - "apps/web/Dockerfile + nginx.conf: static web image (office route and /ceo) with SPA fallback, no baked secrets"
  - "e2e/ceo-staging.spec.ts: staging proof that Access guards /ceo and not the worker paths"
  - "Infra: Cloudflare Access app test.pixelfirm.dev/ceo; Coolify app pixelfirm-web:test; API path domains + Access env"
affects: [07]

actuals:
  tasks: 3
  commits: 2
plan_head_before: 795c1b4

key-files:
  created:
    - apps/web/Dockerfile
    - apps/web/nginx.conf
    - e2e/ceo-staging.spec.ts
  modified:
    - .dockerignore

key-decisions:
  - "Task 1 (user, 2026-09-24): traefik-paths"
  - "CEO_EMAIL (user): shadowtor@live.com"
  - "Infra steps run by the orchestrator (executors have no Coolify/Cloudflare MCP access); repo files by a sequential executor"

duration: ~2h wall clock (including two human actions)
completed: 2026-09-24
---

# 06-12 Summary: /ceo on staging behind Cloudflare Access

**The CEO dashboard is live at https://test.pixelfirm.dev/ceo behind a path-scoped Cloudflare Access app. The user signed in with shadowtor@live.com and approved the result on 2026-09-24. The worker paths still reach the API's own auth.**

## Task 1 — decision
The user chose **traefik-paths** ("1. Traefik-paths"), with CEO_EMAIL **shadowtor@live.com**. They authorized the outward-facing steps with "go".

## Task 2 — image, Access, API settings, migration, deploy

**Repo work (sequential executor)**
- `2b5b314` feat(06-12): static web image with SPA fallback for the office route and /ceo
  - Build: node:22-alpine and pnpm@12.4.2, running `pnpm --filter web build`.
  - Runtime: nginx:1.27-alpine on port 80.
  - Secrets: the Dockerfile has no ARG or ENV. `**/dist` was added to `.dockerignore` so a local bundle, which could carry the browser token, can't enter the build context.
  - Local Docker run: `/`, `/ceo`, `/ceo/` and `/ceo/some/deep/path` each return 200 with index.html. A hashed asset returns 200 with an immutable cache header, and a missing asset returns 404.
- `9af5974` test(06-12): staging spec proving Access guards /ceo and not the worker paths

**Cloudflare Access (API)**
- Created self-hosted app `pixelfirm-ceo-test` on domain **`test.pixelfirm.dev/ceo`**, path-scoped, not the bare hostname.
- It uses the same identity provider as the existing path-scoped avbang app.
- One Allow policy `ceo` with the single email shadowtor@live.com.
- Team domain: https://gamingnodes.cloudflareaccess.com.
- The AUD tag was set as `CF_ACCESS_AUD` on the API.

**Coolify**
- **API `pixelfirm-api:test`:**
  - Runtime env set: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CEO_EMAIL`, `CEO_ALLOWED_ORIGINS=https://test.pixelfirm.dev`. `CEO_DEV_AUTH_BYPASS` is unset.
  - Domains changed from the bare host to the API paths only: `/ceo/api`, `/ceo/ws`, `/events`, `/ws` (which covers `/ws/browser`), `/admin`, `/health`. This list comes from a grep of every route registered in apps/api/src.
  - Strip Prefixes turned off. The user did this in the Coolify UI, because the MCP can't set `is_stripprefix_enabled`.
- **New app `pixelfirm-web:test`:**
  - Source: GitHub app, branch `test`, built from `/apps/web/Dockerfile` with the repo root as context.
  - Serves port 80 on `https://test.pixelfirm.dev`, with the health check `GET /` on port 80.
  - No env vars at all.
  - Traefik sends the longer path rules to the API.

**Migration 0004 [BLOCKING]:** applied through a Coolify one-off scheduled task (`node apps/api/scripts/migrate.mjs`) inside the new API container. It ran before the Access env was set, and while that env was unset `requireCeo` failed closed with 401, so no decision could be recorded before the index existed. Output:
```
skipped (already applied): 0000_init.sql
skipped (already applied): 0001_append_only_trigger.sql
skipped (already applied): 0002_workers_table.sql
skipped (already applied): 0003_no_truncate_trigger.sql
applied: 0004_ceo_decision_once.sql
done
```

**Deploy:** `git push origin main:test` (92cd3db..9af5974). Two things happened along the way:
- **Failed first deploy:** the first API deploy failed its health check and Coolify rolled back to the old container. Staging was never down. The cause was `BROWSER_ACCESS_TOKEN`, required since Phase 5 but never set on staging. The user generated and set it; the agent did not create the secret.
- **Final deploys:** after the env and domain changes, both apps finished (API 165 s, web 167 s).

**Verification (curl, from outside)**
- `/` → 200 web app (`<title>PixelFirm`)
- `/ceo` → 302 to the gamingnodes.cloudflareaccess.com login
- `/ceo/api/me` → 302 to the gamingnodes.cloudflareaccess.com login
- `/health` → 200 `{"status":"ok"}`
- `POST /events` → the API's 401 `{"error":"unauthorized"}`
- `/admin/workers` and `/ws` → the API's 401

**D-12 origin check:**
- test.pixelfirm.dev resolves only to Cloudflare (104.21.0.170, 172.67.128.34, 2606:4700:…).
- `curl --resolve` against the origin IP 43.224.182.202 timed out on both 443 and 80 for `/health` and `/ceo/api/me`.
- The origin can't be reached around the tunnel.

## Task 3 — staging proof
- `PIXELFIRM_STAGING_URL=https://test.pixelfirm.dev npx playwright test e2e/ceo-staging.spec.ts` → **5 passed**.
- **Not run:** `e2e/control-plane.spec.ts` needs `PIXELFIRM_BOOTSTRAP_SECRET`, which the agent doesn't hold. The user was offered the command. The worker and admin paths were covered by the curl checks above instead.
- **Human check (approved by the user on 2026-09-24):** signed in at https://test.pixelfirm.dev/ceo through Cloudflare Access with shadowtor@live.com, and the dashboard loaded.
  - This also settles the 06-05 carry-over. The API only returns the email if a real Access JWT verifies with RS256 against the team JWKS and carries `email`, and the Live feed needs the Access credential to reach `/ceo/ws`.

## Deviations
1. **Infra by the orchestrator:** the infra steps were run by the orchestrator, not the executor, because the executor has no Coolify or Cloudflare MCP tools.
2. **Migration order:** migration 0004 ran after the new API code deployed, not before. This was safe because `/ceo/api` failed closed (401) until the Access env was set after the migration. The old container couldn't run it, since it didn't contain the 0004 file.
3. **Two human actions:** turning off Strip Prefixes, which the MCP can't set, and setting `BROWSER_ACCESS_TOKEN`, a missing Phase 5 secret.
4. **Webhook secrets:** a `get_application reveal` call surfaced the API app's Git webhook secrets in the orchestrator's context. They were not stored or passed anywhere.

## Follow-ups
- Run `e2e/control-plane.spec.ts` against staging with `PIXELFIRM_BOOTSTRAP_SECRET` when convenient.
- `/.vite/manifest.json` is served by the web image. It only lists asset names.

## Self-Check: PASSED

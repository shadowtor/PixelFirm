---
phase: "01"
slug: "event-schema-state-engine"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-18"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Fixture/test input -> schema | Test-authored (trusted in Phase 1) but structurally represents the future untrusted boundary where a real worker/adapter (Phase 2+) will submit externally-observed events | Event envelopes (12 seeded types) |
| npm registry -> workspace install | `pnpm add` pulls third-party code (zod/vitest/turbo) executed at build/test time | Package artifacts |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Tampering | packages/event-schema (CompanyEventSchema, all 12 members) | high | mitigate | `z.discriminatedUnion("type", ...)` + `.safeParse()` rejects any event whose `type` doesn't match a known literal; every payload schema is a plain `z.object()` (never `z.looseObject()`) — verified: `payloads/index.ts` uses `discriminatedUnion` (line 23), 25 `z.object()` calls, zero `looseObject` occurrences. All 12 types round-trip through `envelope.test.ts` (25 passing assertions, valid + malformed per type) | closed |
| T-01-02 | Spoofing | packages/event-schema (sourceAgentId field) | low | transfer | Not authenticated in Phase 1 — no transport/auth layer exists yet. Explicitly forward-referenced to Phase 2's SEC-02 (per-worker credentials); documented, not a Phase 1 gap | closed |
| T-01-SC | Tampering | npm install of zod/vitest/turbo | high | mitigate | `checkpoint:human-verify` (gate="blocking-human") executed before install — human confirmed all three packages' publisher/org and weekly download counts (zod 264M, vitest 94.5M, turbo 22.5M) against npmjs.com/registry data on 2026-09-18 before Task 2 ran `pnpm add` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-18 | 3 | 3 | 0 | orchestrator (L1 grep-depth, asvs_level=1, register authored at plan time — auditor dispatch not required per short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-18

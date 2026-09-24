import { z } from "zod";

// Fail fast at import time on any missing/empty value, rather than surfacing
// as a runtime crash on first request. Don't Hand-Roll: 4 keys don't justify
// a dependency like @fastify/env.
const EnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    CREDENTIAL_PEPPER: z.string().min(1),
    BOOTSTRAP_SECRET: z.string().min(1),
    // Phase 5 addition: shared-token auth for the browser-facing /ws/browser
    // Broadcast Hub route (05-01). One trusted browser viewer this MVP — see
    // apps/api/src/auth/browser-auth.ts for the comparison logic.
    BROWSER_ACCESS_TOKEN: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    // Phase 6 (D-12): local-dev CEO auth bypass for /ceo/api, honoured only
    // for a loopback TCP peer (apps/api/src/auth/ceo-auth.ts). Off unless set
    // to exactly "1", and refused at boot when NODE_ENV is production (below).
    CEO_DEV_AUTH_BYPASS: z
      .enum(["0", "1"])
      .default("0")
      .transform((v) => v === "1"),
    // Phase 6 (D-12): comma-separated exact Origins allowed to POST /ceo/api
    // (apps/api/src/auth/csrf.ts). The empty default refuses every browser
    // POST, so a missing value fails closed.
    CEO_ALLOWED_ORIGINS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    // Phase 6: only read for the CEO_DEV_AUTH_BYPASS production guard.
    NODE_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.CEO_DEV_AUTH_BYPASS && env.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["CEO_DEV_AUTH_BYPASS"],
        message: "CEO_DEV_AUTH_BYPASS must not be enabled when NODE_ENV is production",
      });
    }
  });

export function parseEnv(source: Record<string, string | undefined>) {
  return EnvSchema.parse(source);
}

export const env = parseEnv(process.env);

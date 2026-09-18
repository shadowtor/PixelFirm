import { z } from "zod";

// Fail fast at import time on any missing/empty value, rather than surfacing
// as a runtime crash on first request. Don't Hand-Roll: 4 keys don't justify
// a dependency like @fastify/env.
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CREDENTIAL_PEPPER: z.string().min(1),
  BOOTSTRAP_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = EnvSchema.parse(process.env);

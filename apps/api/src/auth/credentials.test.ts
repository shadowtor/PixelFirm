process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";

import { beforeAll, describe, expect, it } from "vitest";
import type { issueCredential as issueCredentialType, verifyCredential as verifyCredentialType } from "./credentials.js";

// Static imports hoist above the process.env assignments above (ESM
// semantics) — ./credentials.js transitively imports ../env.js, which
// parses process.env at module-load time. Load it dynamically after the
// assignments run instead (same pattern as Plan 01's events.test.ts).
let issueCredential: typeof issueCredentialType;
let verifyCredential: typeof verifyCredentialType;

beforeAll(async () => {
  ({ issueCredential, verifyCredential } = await import("./credentials.js"));
});

describe("issueCredential", () => {
  it("returns a token shaped workerId.<64 lowercase hex chars> and a 64-lowercase-hex-char secretHash", () => {
    const { token, secretHash } = issueCredential("worker-1");
    expect(token).toMatch(/^worker-1\.[0-9a-f]{64}$/);
    expect(secretHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyCredential", () => {
  it("returns true for the exact secret/hash pair issueCredential produced", () => {
    const { token, secretHash } = issueCredential("worker-1");
    const secret = token.split(".")[1]!;
    expect(verifyCredential(secret, secretHash)).toBe(true);
  });

  it("returns false when the secret differs by even one character", () => {
    const { token, secretHash } = issueCredential("worker-1");
    const secret = token.split(".")[1]!;
    const tampered = secret.slice(0, -1) + (secret.at(-1) === "0" ? "1" : "0");
    expect(verifyCredential(tampered, secretHash)).toBe(false);
  });

  it("never throws and returns false for a garbage hash (invalid hex or wrong length)", () => {
    const { token } = issueCredential("worker-1");
    const secret = token.split(".")[1]!;
    expect(() => verifyCredential(secret, "not-hex-at-all")).not.toThrow();
    expect(verifyCredential(secret, "not-hex-at-all")).toBe(false);
    expect(() => verifyCredential(secret, "ab")).not.toThrow();
    expect(verifyCredential(secret, "ab")).toBe(false);
    expect(() => verifyCredential(secret, "")).not.toThrow();
    expect(verifyCredential(secret, "")).toBe(false);
  });
});

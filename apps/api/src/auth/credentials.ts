import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

// D-03 credential mechanics (locked): high-entropy random secret, only an
// HMAC-SHA256 hash (with a server-side pepper) ever persisted — never a
// reversible encoding. HMAC-SHA256 (not argon2id/bcrypt) is deliberate: the
// secret is already a high-entropy random token, not a low-entropy human
// password (RESEARCH.md Alternatives Considered).
export function issueCredential(workerId: string): { token: string; secretHash: string } {
  const secret = randomBytes(32).toString("hex");
  const secretHash = createHmac("sha256", env.CREDENTIAL_PEPPER).update(secret).digest("hex");
  return { token: `${workerId}.${secret}`, secretHash };
}

export function verifyCredential(secret: string, storedHashHex: string): boolean {
  // Length/format guard MUST run before timingSafeEqual, which throws (not
  // returns false) on a length mismatch or invalid hex input.
  if (!/^[0-9a-f]+$/i.test(storedHashHex) || storedHashHex.length % 2 !== 0) {
    return false;
  }
  const computed = createHmac("sha256", env.CREDENTIAL_PEPPER).update(secret).digest();
  const stored = Buffer.from(storedHashHex, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

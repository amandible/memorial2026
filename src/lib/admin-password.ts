import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Password and token logic for admin access, with no framework dependencies.
 *
 * Split from admin-auth.ts, which touches next/headers and therefore can only
 * run inside Next. Keeping the crypto here means it is directly testable — see
 * tests/admin-auth.test.mts.
 */

const PAYLOAD = "billmelanson-admin-v1";

/**
 * The value stored in the session cookie: an HMAC derived from the password,
 * never the password itself. Verified by recomputation, so there is no session
 * store, and a leaked cookie cannot be read back into the credential.
 */
export function expectedToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update(PAYLOAD).digest("hex");
}

/** Constant-time compare that tolerates unequal lengths without leaking them. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still perform a comparison so timing doesn't depend on the length check.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Fails closed. With ADMIN_PASSWORD unset or empty, nothing is accepted —
 * including an empty attempt, which must not compare equal to an absent config.
 */
export function checkPassword(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("ADMIN_PASSWORD is not set — refusing all admin access.");
    return false;
  }
  return safeEqual(candidate, password);
}

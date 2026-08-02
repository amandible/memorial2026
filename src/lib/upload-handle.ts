import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived signature binding a storage reference to a verified request.
 *
 * Every upload here is two calls: one to get somewhere to put the file, one to
 * record it once it has arrived. Turnstile is checked on the first. This carries
 * that verification across to the second, so the recording endpoint cannot be
 * called with arbitrary references by anything that skipped the form.
 *
 * The reference is a Cloudflare Images id for photographs and an R2 object key
 * for everything else; this file doesn't care which, which is why it lives here
 * rather than in cf-images.ts.
 */

const HANDLE_TTL_MS = 60 * 60_000;

function handleSecret(): string {
  // Reuses the admin password purely as server-side key material; it is never
  // exposed and this grants no admin capability.
  const s = process.env.ADMIN_PASSWORD || process.env.TURNSTILE_SECRET;
  if (!s) throw new Error("No server secret available to sign upload handles.");
  return s;
}

export function signUploadHandle(ref: string, expiresAt: number): string {
  return createHmac("sha256", handleSecret()).update(`${ref}:${expiresAt}`).digest("hex");
}

export function newUploadHandle(ref: string): { handle: string; expiresAt: number } {
  const expiresAt = Date.now() + HANDLE_TTL_MS;
  return { handle: signUploadHandle(ref, expiresAt), expiresAt };
}

export function verifyUploadHandle(ref: string, expiresAt: number, handle: string): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signUploadHandle(ref, expiresAt);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(handle, "utf8");
  if (a.length !== b.length) {
    // Compare something anyway, so a wrong-length handle doesn't return
    // measurably faster than a wrong-value one.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

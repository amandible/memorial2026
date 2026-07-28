import { createHash } from "node:crypto";

/**
 * Hash a submitter's IP for rate-limiting and abuse tracing.
 *
 * Salted with a server-side secret, and that is not optional: IPv4 is only 2^32
 * addresses, so an unsalted hash is reversible by brute force in seconds. The
 * raw address is never stored.
 *
 * Returns null when no salt is configured, so a misconfiguration stores nothing
 * rather than storing something falsely presented as anonymised.
 */
export function hashIp(ip: string | null | undefined): string | null {
  const salt = process.env.IP_HASH_SALT;
  if (!ip || !salt) {
    if (ip && !salt) console.warn("IP_HASH_SALT is not set — storing no ip_hash.");
    return null;
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

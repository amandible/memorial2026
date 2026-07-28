const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** True when a site key is configured, so the form knows whether to render the widget. */
export function turnstileConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * What to do when Cloudflare itself can't be reached — a timeout, a network
 * error, or a non-2xx from siteverify.
 *
 * This is NOT about a rejected token. A `success: false` is a real bot signal
 * and is always refused, whatever this is set to.
 *
 *   "deny"  — refuse the submission. Correct where accepting an unverified one
 *             would publish something to the public site.
 *   "allow" — accept it. Correct where the cost of losing a real person's
 *             submission during a Cloudflare outage outweighs the cost of one
 *             unverified row in private data.
 */
export type OutagePolicy = "deny" | "allow";

/**
 * Verify a Turnstile token server-side. Never trust the browser's word for it.
 *
 * Fails **closed** on a missing secret in production: submissions are refused
 * rather than accepted unprotected. A missing key is an operator problem and
 * should look like one, not silently open a public form to bots.
 *
 * In development, an unconfigured secret passes so forms can be worked on
 * before the keys exist.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null,
  onOutage: OutagePolicy = "deny",
): Promise<{ ok: boolean; error?: string; unverified?: boolean }> {
  const secret = process.env.TURNSTILE_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("TURNSTILE_SECRET is not set — refusing form submissions.");
      return { ok: false, error: "This form is temporarily unavailable. Please try again later." };
    }
    return { ok: true };
  }

  if (!token) {
    return { ok: false, error: "Please complete the verification below and try again." };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    const result = (await res.json()) as { success: boolean; "error-codes"?: string[] };

    // Gate on an explicit true. A malformed or unexpected body must not pass.
    if (result.success !== true) {
      console.warn("Turnstile rejected a submission:", result["error-codes"]);
      return { ok: false, error: "Verification failed. Please reload the page and try again." };
    }
    return { ok: true };
  } catch (e) {
    // Cloudflare is unreachable. This is not a bot signal — it's an outage —
    // so the caller decides. See OutagePolicy.
    console.error("Turnstile unreachable:", e);
    if (onOutage === "allow") {
      console.warn("Accepting an UNVERIFIED submission: Turnstile was unreachable.");
      return { ok: true, unverified: true };
    }
    return { ok: false, error: "Could not verify your submission just now. Please try again." };
  }
}

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** True when a site key is configured, so the form knows whether to render the widget. */
export function turnstileConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * Verify a Turnstile token server-side. Never trust the browser's word for it.
 *
 * Fails **closed** in production: if the secret isn't configured, submissions are
 * refused rather than accepted unprotected. A missing key is an operator problem
 * and should look like one, not silently open a public form to bots.
 *
 * In development, an unconfigured secret passes so the form can be worked on
 * before the keys exist.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null,
): Promise<{ ok: boolean; error?: string }> {
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
    // A Cloudflare outage or timeout shouldn't lose someone's submission silently,
    // but it also can't wave them through. Ask them to retry.
    console.error("Turnstile verification error:", e);
    return { ok: false, error: "Could not verify your submission just now. Please try again." };
  }
}

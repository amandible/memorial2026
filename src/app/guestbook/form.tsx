"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState, useEffect } from "react";
import { signGuestbook, type GuestbookState } from "./actions";

const initial: GuestbookState = { status: "idle" };

export default function GuestbookForm({ siteKey }: { siteKey?: string }) {
  const [state, formAction, pending] = useActionState(signGuestbook, initial);

  // Tokens are single-use; a spent one would fail the retry for the wrong reason.
  useEffect(() => {
    if (state.status === "error" && siteKey) {
      (window as { turnstile?: { reset: () => void } }).turnstile?.reset();
    }
  }, [state, siteKey]);

  if (state.status === "ok") {
    return (
      <div id="add" className="form-ok-block">
        <p className="form-ok" role="status">
          {state.message}
        </p>
        <p className="muted-note">
          Your message is on the page now. Reload to see it among the others.
        </p>
        <Link href="/guestbook" className="btn-quiet">
          View the guestbook
        </Link>
      </div>
    );
  }

  return (
    <>
      {siteKey && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}

      <section id="add" className="add-entry">
        <h2>Leave a message</h2>
        <p className="muted-note">
          Once you submit, your message will appear on this page straight away,
          for his family and everyone else who knew him to read.
        </p>

        <form action={formAction} className="form">
          <div className="field">
            <label htmlFor="gb-name">Your name</label>
            <input id="gb-name" name="name" type="text" required autoComplete="name" maxLength={120} />
          </div>

          <div className="field">
            <label htmlFor="gb-message">Your message</label>
            <textarea id="gb-message" name="message" rows={7} required maxLength={5000} />
          </div>

          <div className="field">
            <label htmlFor="gb-email">
              Your email <span className="optional">(optional, never shown)</span>
            </label>
            <input id="gb-email" name="email" type="email" autoComplete="email" maxLength={320} />
          </div>

          <div className="honeypot" aria-hidden="true">
            <label htmlFor="gb-website">Website</label>
            <input id="gb-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {siteKey && (
            <div
              className="cf-turnstile"
              data-sitekey={siteKey}
              data-action="turnstile-spin-v2"
              /* Writing a tribute easily takes longer than a token's 300-second
                 life. Let Turnstile renew itself rather than failing on submit. */
              data-refresh-expired="auto"
            />
          )}

          {state.status === "error" && (
            <p className="form-error" role="alert">
              {state.message}
            </p>
          )}

          <button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add your message"}
          </button>
        </form>
      </section>
    </>
  );
}

"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef } from "react";
import { subscribe, type SubscribeState } from "./actions";

const initial: SubscribeState = { status: "idle" };

export default function SubscribeForm({ siteKey }: { siteKey?: string }) {
  const [state, formAction, pending] = useActionState(subscribe, initial);
  const widget = useRef<HTMLDivElement>(null);

  // A Turnstile token is single-use. After a failed submit the old one is spent,
  // so the widget has to be reset or the next attempt fails for the wrong reason.
  useEffect(() => {
    if (state.status === "error" && siteKey) {
      // reset() throws if Turnstile has already torn the widget down.
      try {
        (window as { turnstile?: { reset: () => void } }).turnstile?.reset();
      } catch (e) {
        console.warn("Turnstile reset failed (widget already gone):", e);
      }
    }
  }, [state, siteKey]);

  if (state.status === "ok") {
    return (
      <>
        <hr className="rule" />
        <h2>You are on the list!</h2>
        <p className="form-ok" role="status">
          {state.message}
        </p>
      </>
    );
  }

  return (
    <>
      {siteKey && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}

      <form action={formAction} className="form">
        <div className="field">
          <label htmlFor="email">Your email address</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            maxLength={320}
          />
        </div>

        <div className="field">
          <label htmlFor="name">
            Your name <span className="optional">(optional)</span>
          </label>
          <input id="name" name="name" type="text" autoComplete="name" maxLength={120} />
        </div>

        <div className="field">
          <label htmlFor="note">
            How did you know Joe? <span className="optional">(optional)</span>
          </label>
          <textarea id="note" name="note" rows={3} maxLength={500} />
        </div>

        {/* Honeypot. Hidden from people, tempting to naive bots. Not display:none —
            some bots skip those; this is off-screen and removed from the a11y tree. */}
        <div className="honeypot" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {/* data-action is Cloudflare's aggregate attribution marker for the
            Spin integration. Account-level only, never per-visitor. */}
        {siteKey && (
          <div
            ref={widget}
            className="cf-turnstile"
            data-sitekey={siteKey}
            data-action="turnstile-spin-v2"
            data-refresh-expired="auto"
          />
        )}

        {state.status === "error" && (
          <p className="form-error" role="alert">
            {state.message}
          </p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send it"}
        </button>
      </form>
    </>
  );
}

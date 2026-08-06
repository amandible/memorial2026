"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { submitTextMemory } from "./text-actions";
import { PHOTO_KINDS, PHOTO_KIND_LABELS, type PhotoKind } from "@/lib/photo-kinds";

const MAX_CAPTION = 500;
const MAX_BODY_TEXT = 5000;

/**
 * Submit a typed memory — a setlist, lyrics, a written recollection — with no
 * file at all.
 *
 * Deliberately a separate, small component rather than a branch inside
 * PhotoForm: that form's whole shape (file picking, per-file captions, EXIF,
 * retryable uploads) is about bytes, and none of it applies here. Mirrors
 * PhotoForm's Turnstile handling (same widget embedding, same token-wait
 * logic) because that part genuinely is shared, just not worth threading
 * through a shared component for one field's difference in behavior.
 *
 * The caller is responsible for only mounting one of PhotoForm/TextMemoryForm
 * at a time (see mode-switch.tsx) — Cloudflare's script places a hidden
 * `cf-turnstile-response` input inside whichever widget renders it, and two
 * widgets on the page at once would make a plain global lookup ambiguous.
 */
export default function TextMemoryForm({
  siteKey,
  defaultKind = "friends-family",
}: {
  siteKey?: string;
  defaultKind?: PhotoKind;
}) {
  const [kind, setKind] = useState<PhotoKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tsStatus, setTsStatus] = useState<"loading" | "ready" | "error">("loading");
  const turnstileBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const start = Date.now();

    function tick() {
      if (cancelled) return;
      const scriptLoaded = typeof (window as { turnstile?: unknown }).turnstile !== "undefined";
      const solved = Boolean(readToken());
      const hasWidget = Boolean(turnstileBox.current?.firstElementChild);

      const next: typeof tsStatus =
        scriptLoaded || solved || hasWidget
          ? "ready"
          : Date.now() - start > 20_000
            ? "error"
            : "loading";

      setTsStatus((prev) => (prev === next ? prev : next));
      if (next === "ready") return;
      setTimeout(tick, 300);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  function resetTurnstile() {
    try {
      (window as { turnstile?: { reset: () => void } }).turnstile?.reset();
    } catch (e) {
      console.warn("Turnstile reset failed (widget already gone):", e);
    }
  }

  function readToken(): string | null {
    return (
      (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)
        ?.value || null
    );
  }

  async function waitForToken(ms = 20_000): Promise<string | null> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const t = readToken();
      if (t) return t;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!body.trim()) {
      setError("Please write something before sending.");
      return;
    }

    setBusy(true);
    try {
      let token = readToken();
      if (!token) {
        token = await waitForToken(tsStatus === "error" ? 8_000 : 20_000);
      }
      if (!token) {
        setError(
          tsStatus === "error"
            ? "The verification check hasn't loaded. Try reloading the page, or email it to contact@billmelanson.org instead."
            : "Still verifying — please try again in a moment.",
        );
        return;
      }

      const result = await submitTextMemory(kind, title, body, name, email, token);
      if (!result.ok) {
        setError(result.error);
        resetTurnstile();
        return;
      }
      setSaved(true);
    } catch (e) {
      console.error("Text memory submission failed:", e);
      setError("Something went wrong sending that. Please try again.");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div id="add-text" className="form-ok-block">
        <p className="form-ok" role="status">
          Thank you &mdash; it has been sent.
        </p>
        <p className="muted-note">
          It will appear once someone has had a look at it.
        </p>
        <button type="button" className="btn-quiet" onClick={() => setSaved(false)}>
          Send another
        </button>{" "}
        <Link href={`/${kind}`} className="btn-quiet">
          View {PHOTO_KIND_LABELS[kind].toLowerCase()}
        </Link>
      </div>
    );
  }

  return (
    <>
      {siteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          async
          defer
          onError={() => setTsStatus("error")}
        />
      )}

      <section id="add-text" className="add-entry">
        <h2>Send text</h2>
        <p className="muted-note">
          A setlist, some lyrics, or anything else worth writing down instead
          of sending a photo of it.
        </p>

        <form onSubmit={submit} className="form">
          <div className="field">
            <label htmlFor="tm-kind">Which section?</label>
            <select
              id="tm-kind"
              disabled={busy}
              value={kind}
              onChange={(e) => setKind(e.target.value as PhotoKind)}
            >
              {PHOTO_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PHOTO_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tm-title">
              Title <span className="optional">(optional)</span>
            </label>
            <input
              id="tm-title"
              type="text"
              maxLength={MAX_CAPTION}
              disabled={busy}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="tm-body">The memory</label>
            <textarea
              id="tm-body"
              rows={8}
              maxLength={MAX_BODY_TEXT}
              disabled={busy}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="tm-name">
              Your name <span className="optional">(optional)</span>
            </label>
            <input id="tm-name" type="text" autoComplete="name" maxLength={120}
                   disabled={busy} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="tm-email">
              Your email <span className="optional">(optional, never shown)</span>
            </label>
            <input id="tm-email" type="email" autoComplete="email" maxLength={320}
                   disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {siteKey && (
            <div className="field">
              <div
                ref={turnstileBox}
                className="cf-turnstile"
                data-sitekey={siteKey}
                data-action="turnstile-text-memory"
                data-refresh-expired="auto"
              />
              {tsStatus === "loading" && (
                <p className="muted-note" role="status">
                  Loading the verification check&hellip;
                </p>
              )}
              {tsStatus === "error" && (
                <p className="muted-note" role="status">
                  Authenticating the form is taking longer than expected. Try
                  reloading the page — if the verification check still
                  doesn&rsquo;t appear, an ad blocker or privacy extension may be
                  blocking it, or you can email it to contact@billmelanson.org
                  instead.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy || !body.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      </section>
    </>
  );
}

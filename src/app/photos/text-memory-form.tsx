"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { submitTextMemory } from "./text-actions";
import { PHOTO_KINDS, PHOTO_KIND_LABELS, type PhotoKind } from "@/lib/photo-kinds";

const MAX_CAPTION = 500;
const MAX_BODY_TEXT = 5000;

type TurnstileGlobal = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

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
  const widgetId = useRef<string | null>(null);

  /**
   * Explicit rendering, not the implicit class="cf-turnstile" auto-scan.
   *
   * The scan only runs once, when the Turnstile script first parses the
   * page. This form's widget container doesn't exist yet at that moment if
   * "Send a photo" (the default tab) loaded the script first — switching
   * tabs mounts this container *after* the scan already ran, so it would
   * never be found. window.turnstile being truthy only means the *script*
   * loaded, not that *this* container has a widget — rendering explicitly
   * the moment a container is available is the only way this reliably
   * shows anything.
   */
  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const start = Date.now();

    function tick() {
      if (cancelled) return;
      const w = (window as { turnstile?: TurnstileGlobal }).turnstile;
      if (w && turnstileBox.current && !widgetId.current) {
        widgetId.current = w.render(turnstileBox.current, {
          sitekey: siteKey,
          action: "turnstile-text-memory",
          "refresh-expired": "auto",
        });
      }

      const solved = Boolean(readToken());
      const next: typeof tsStatus =
        widgetId.current || solved
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
      const w = (window as { turnstile?: TurnstileGlobal }).turnstile;
      if (widgetId.current && w) {
        try {
          w.remove(widgetId.current);
        } catch (e) {
          console.warn("Turnstile remove failed (widget already gone):", e);
        }
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  function resetTurnstile() {
    try {
      const w = (window as { turnstile?: TurnstileGlobal }).turnstile;
      if (widgetId.current) w?.reset(widgetId.current);
    } catch (e) {
      console.warn("Turnstile reset failed (widget already gone):", e);
    }
  }

  function readToken(): string | null {
    return (
      (turnstileBox.current?.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)
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
        {/* A link that reloads the page, not a button that resets local state.
            Succeeding unmounts the form, which detaches the div the Turnstile
            widget was rendered into — this component's own widgetId ref never
            gets cleared (nothing here unmounts to run that cleanup), so a
            second render() call would just silently no-op against a gone
            widget. Reloading is what actually gets a working widget back;
            see NEEDS_FULL_LOAD in lib/sections.ts for the same fix applied to
            cross-page navigation. */}
        <a href={`/photos/add?kind=${kind}`} className="btn-quiet">
          Send another
        </a>{" "}
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
              {/* No data-sitekey/data-action here — rendered explicitly via
                  window.turnstile.render() in the effect above, not the
                  implicit class="cf-turnstile" auto-scan. */}
              <div ref={turnstileBox} />
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

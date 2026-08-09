"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { requestMusicUpload, recordMusic } from "./music-actions";
import { PHOTO_KINDS, PHOTO_KIND_LABELS, type PhotoKind } from "@/lib/photo-kinds";
import { isAllowedMusicExtension } from "@/lib/music";

const MAX_CAPTION = 500;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type TurnstileGlobal = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

type UploadOutcome =
  | { ok: true }
  | { ok: false; kind: "http"; label: string }
  | { ok: false; kind: "connection" };

/**
 * Send one file, retrying only what's worth retrying.
 *
 * Copied from photos/form.tsx rather than imported — that file isn't
 * structured to export a piece of itself, and this is ~15 lines.
 */
async function uploadWithRetry(send: () => Promise<Response>, label: string): Promise<UploadOutcome> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await send();
      if (res.ok) return { ok: true };
      const detail = await res.text().catch(() => "");
      console.error("Upload rejected:", label, res.status, detail.slice(0, 300));
      return { ok: false, kind: "http", label: `${label} (${res.status})` };
    } catch (err) {
      lastErr = err;
      console.warn(`Upload attempt ${attempt} threw for`, label, err);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  console.error("Upload failed after retries for", label, lastErr);
  return { ok: false, kind: "connection" };
}

/**
 * Submit a recording — audio or video — with no in-browser player here.
 * Playback lives in the gallery/lightbox once it's approved; this form's job
 * is just getting the file to the (already public, per music-storage.ts's
 * comment) bucket.
 */
export default function MusicUploadForm({
  siteKey,
  defaultKind = "friends-family",
}: {
  siteKey?: string;
  defaultKind?: PhotoKind;
}) {
  const [kind, setKind] = useState<PhotoKind>(defaultKind);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tsStatus, setTsStatus] = useState<"loading" | "ready" | "error">("loading");
  const fileInput = useRef<HTMLInputElement>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  /**
   * Explicit rendering, not the implicit class="cf-turnstile" auto-scan.
   *
   * The scan only runs once, when the Turnstile script first parses the
   * page. Since this form only mounts when the add-mode toggle switches to
   * it — after "Send a photo" (the default tab) may already have loaded the
   * script — window.turnstile being truthy only proves the *script*
   * loaded, not that *this* container has a widget. A container added to
   * the DOM after the scan already ran is invisible to it. Rendering
   * explicitly the moment a container is available is the only way this
   * reliably shows anything.
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
          action: "turnstile-music",
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

  function onPick(list: FileList | null) {
    setError(null);
    const f = list?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    if (!isAllowedMusicExtension(f.name)) {
      setError("That doesn't look like an audio or video file — try an mp3, wav, m4a, or mp4.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError("That file is larger than 100 MB. Please email it to contact@billmelanson.org instead.");
      return;
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please choose a file first.");
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

      const ticket = await requestMusicUpload(file.name, file.size, token);
      if (!ticket.ok) {
        setError(ticket.error);
        resetTurnstile();
        return;
      }

      const outcome = await uploadWithRetry(
        () => fetch(ticket.uploadURL, { method: "PUT", body: file }),
        file.name,
      );
      if (!outcome.ok) {
        setError(
          outcome.kind === "http"
            ? `That file was rejected (${outcome.label}). Please try again.`
            : "The upload didn't go through. Please check your connection and try again.",
        );
        return;
      }

      const result = await recordMusic(
        kind,
        title,
        ticket.storageKey,
        ticket.handle,
        ticket.expiresAt,
        file.name,
        name,
        email,
      );
      if (!result.ok) {
        setError(result.error);
        resetTurnstile();
        return;
      }
      setSaved(true);
    } catch (e) {
      console.error("Music submission failed:", e);
      setError("Something went wrong sending that. Please try again.");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div id="add-music" className="form-ok-block">
        <p className="form-ok" role="status">
          Thank you &mdash; it has been sent.
        </p>
        <p className="muted-note">
          It will appear once someone has had a look at it.
        </p>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setSaved(false);
            setFile(null);
            if (fileInput.current) fileInput.current.value = "";
          }}
        >
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

      <section id="add-music" className="add-entry">
        <h2>Send a recording</h2>
        <p className="muted-note">
          Audio or video &mdash; mp3, wav, m4a, or mp4 work well. Up to 100 MB.
        </p>

        <form onSubmit={submit} className="form">
          <div className="field">
            <label htmlFor="mu-kind">Which section?</label>
            <select
              id="mu-kind"
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
            <label htmlFor="mu-file">Choose a file</label>
            <input
              id="mu-file"
              ref={fileInput}
              type="file"
              disabled={busy}
              onChange={(e) => onPick(e.target.files)}
            />
          </div>

          <div className="field">
            <label htmlFor="mu-title">
              Title <span className="optional">(optional)</span>
            </label>
            <input
              id="mu-title"
              type="text"
              maxLength={MAX_CAPTION}
              disabled={busy}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="mu-name">
              Your name <span className="optional">(optional)</span>
            </label>
            <input id="mu-name" type="text" autoComplete="name" maxLength={120}
                   disabled={busy} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="mu-email">
              Your email <span className="optional">(optional, never shown)</span>
            </label>
            <input id="mu-email" type="email" autoComplete="email" maxLength={320}
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
                  blocking it, or you can email the recording to
                  contact@billmelanson.org instead.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy || !file}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      </section>
    </>
  );
}

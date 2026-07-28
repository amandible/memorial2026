"use client";

import Script from "next/script";
import { useRef, useState } from "react";
import { requestUploads, recordPhotos, type Submission } from "./actions";

type Picked = { file: File; caption: string; key: string };

const MAX_FILES = 12;
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/heic,image/heif,image/webp,image/tiff,image/gif";

export default function PhotoForm({ siteKey }: { siteKey?: string }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  function onPick(list: FileList | null) {
    setError(null);
    if (!list) return;
    const files = Array.from(list);
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than 25 MB. Please send that one to contact@joeweisman.org instead.`);
      return;
    }
    const next = [...picked, ...files.map((f) => ({ file: f, caption: "", key: `${f.name}-${f.size}-${f.lastModified}` }))];
    const unique = next.filter((p, i) => next.findIndex((x) => x.key === p.key) === i);
    if (unique.length > MAX_FILES) {
      setError(`Please send up to ${MAX_FILES} photos at a time. You can come back and add more.`);
      return;
    }
    setPicked(unique);
  }

  function resetTurnstile() {
    (window as { turnstile?: { reset: () => void } }).turnstile?.reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (picked.length === 0) {
      setError("Please choose at least one photo.");
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: picked.length });

    try {
      const token =
        (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)
          ?.value ?? null;

      const res = await requestUploads(picked.length, token);
      if (!res.ok) {
        setError(res.error);
        resetTurnstile();
        return;
      }

      // Upload one at a time. Sequential rather than parallel so a phone on a
      // weak connection doesn't stall every request at once, and so progress
      // means something.
      const done: Submission[] = [];
      for (let i = 0; i < picked.length; i++) {
        const ticket = res.tickets[i];
        const body = new FormData();
        body.append("file", picked[i].file);
        const up = await fetch(ticket.uploadURL, { method: "POST", body });
        if (up.ok) {
          done.push({
            id: ticket.id,
            handle: ticket.handle,
            expiresAt: ticket.expiresAt,
            caption: picked[i].caption,
          });
        } else {
          console.error("Upload failed for", picked[i].file.name, up.status);
        }
        setProgress({ done: i + 1, total: picked.length });
      }

      if (done.length === 0) {
        setError("The photos couldn't be uploaded. Please try again.");
        resetTurnstile();
        return;
      }

      const rec = await recordPhotos(done, name, email);
      if (!rec.ok) {
        setError(rec.error ?? "Something went wrong.");
        resetTurnstile();
        return;
      }
      setSaved(rec.saved);
      setPicked([]);
    } catch (err) {
      // The generic message is what a visitor should see, but swallowing the
      // cause made a real failure undiagnosable. Log it, and surface it in
      // development where only we are looking.
      console.error("Photo submission failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      setError(
        process.env.NODE_ENV === "development"
          ? `Something went wrong: ${detail}`
          : "Something went wrong. Please try again, or write to contact@joeweisman.org.",
      );
      resetTurnstile();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (saved > 0) {
    return (
      <div id="add" className="form-ok-block">
        <p className="form-ok" role="status">
          Thank you — {saved === 1 ? "your photograph has" : `${saved} photographs have`} been sent.
        </p>
        <p className="muted-note">
          They&rsquo;ll appear in the gallery once someone has had a look at them.
        </p>
        <button type="button" className="btn-quiet" onClick={() => setSaved(0)}>
          Send more
        </button>
      </div>
    );
  }

  return (
    <>
      {siteKey && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}

      <section id="add" className="add-entry">
        <h2>Send your photographs</h2>
        <p className="muted-note">
          Anything at all — the boat, the commune, a sauna he built, a kitchen he
          improved. They&rsquo;ll appear here once someone has looked at them.
        </p>

        <form onSubmit={submit} className="form">
          <div className="field">
            <label htmlFor="ph-files">Choose photographs</label>
            <input
              id="ph-files"
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              multiple
              disabled={busy}
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="muted-note">
              Up to {MAX_FILES} at a time, 25 MB each. Photos straight off a phone are fine.
            </span>
          </div>

          {picked.length > 0 && (
            <ol className="picked">
              {picked.map((p, i) => (
                <li key={p.key}>
                  <div className="picked-head">
                    <span className="picked-name">{p.file.name}</span>
                    <button
                      type="button"
                      className="btn-quiet"
                      disabled={busy}
                      onClick={() => setPicked(picked.filter((x) => x.key !== p.key))}
                    >
                      Remove
                    </button>
                  </div>
                  <label htmlFor={`cap-${i}`} className="picked-caption-label">
                    Caption <span className="optional">(optional)</span>
                  </label>
                  <input
                    id={`cap-${i}`}
                    type="text"
                    maxLength={500}
                    disabled={busy}
                    placeholder="Who, where, when — whatever you remember"
                    value={p.caption}
                    onChange={(e) =>
                      setPicked(picked.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))
                    }
                  />
                </li>
              ))}
            </ol>
          )}

          <div className="field">
            <label htmlFor="ph-name">
              Your name <span className="optional">(optional)</span>
            </label>
            <input id="ph-name" type="text" autoComplete="name" maxLength={120}
                   disabled={busy} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="ph-email">
              Your email <span className="optional">(optional, never shown)</span>
            </label>
            <input id="ph-email" type="email" autoComplete="email" maxLength={320}
                   disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {siteKey && (
            <div className="cf-turnstile" data-sitekey={siteKey} data-action="turnstile-spin-v2" />
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {progress && (
            <p className="muted-note" role="status">
              Sending {progress.done} of {progress.total}…
            </p>
          )}

          <button type="submit" disabled={busy || picked.length === 0}>
            {busy ? "Sending…" : picked.length > 1 ? `Send ${picked.length} photographs` : "Send photograph"}
          </button>
        </form>
      </section>
    </>
  );
}

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
  const [verifying, setVerifying] = useState(false);
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
    // Turnstile removes its own widget on some failures (110200, for one), and
    // reset() then throws "Nothing to reset found for provided container".
    // That turned a clear error into the generic catch-all. Never let cleanup
    // become the reported failure.
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

  /**
   * Wait for the widget to produce a token.
   *
   * Turnstile tokens last 300 seconds, and this form routinely takes longer —
   * opening a file picker, choosing photos, writing a caption for each. So an
   * expired token is the normal case, not an exceptional one.
   *
   * The first attempt at handling that reset the widget and told the visitor to
   * press Send again, which did not work: solving a fresh challenge takes a
   * second or two, so pressing Send immediately found no token, showed the same
   * message and returned. It looked like a dead button. Waiting here means one
   * press is enough.
   */
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
    if (picked.length === 0) {
      setError("Please choose at least one photo.");
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: picked.length });

    // Which step we're on, so a failure says something useful instead of
    // "something went wrong". Three earlier reports were undiagnosable because
    // every failure produced the same sentence.
    let stage: "verify" | "tickets" | "upload" | "record" = "verify";

    try {
      let token = readToken();

      // Expired while they were choosing photos — refresh and wait for the new
      // one rather than bouncing them back to the button.
      if (!token) {
        setVerifying(true);
        resetTurnstile();
        token = await waitForToken();
        setVerifying(false);
      }

      if (!token) {
        // Managed mode escalated to a checkbox, or the widget is wedged. Say
        // what to actually do — the files and captions are still here.
        setError(
          "Please complete the verification below, then press Send again. Your photos and captions are still here.",
        );
        return;
      }

      stage = "tickets";
      const res = await requestUploads(picked.length, token);
      if (!res.ok) {
        setError(res.error);
        resetTurnstile();
        return;
      }

      // Upload one at a time. Sequential rather than parallel so a phone on a
      // weak connection doesn't stall every request at once, and so progress
      // means something.
      stage = "upload";
      const done: Submission[] = [];
      const failures: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const ticket = res.tickets[i];
        const body = new FormData();
        body.append("file", picked[i].file);
        try {
          const up = await fetch(ticket.uploadURL, { method: "POST", body });
          if (up.ok) {
            done.push({
              id: ticket.id,
              handle: ticket.handle,
              expiresAt: ticket.expiresAt,
              caption: picked[i].caption,
            });
          } else {
            const detail = await up.text().catch(() => "");
            console.error("Upload rejected:", picked[i].file.name, up.status, detail.slice(0, 300));
            failures.push(`${picked[i].file.name} (${up.status})`);
          }
        } catch (err) {
          // A single file failing must not abandon the others.
          console.error("Upload threw for", picked[i].file.name, err);
          failures.push(`${picked[i].file.name} (connection)`);
        }
        setProgress({ done: i + 1, total: picked.length });
      }

      if (done.length === 0) {
        resetTurnstile();
        setError(
          `Those photos couldn't be sent to our image service${failures.length ? ` — ${failures.join(", ")}` : ""}. Please try again, or email them to contact@joeweisman.org.`,
        );
        return;
      }
      if (failures.length > 0) {
        console.warn("Some photos failed to upload:", failures);
      }

      stage = "record";

      const rec = await recordPhotos(done, name, email);
      if (!rec.ok) {
        setError(rec.error ?? "Something went wrong.");
        resetTurnstile();
        return;
      }
      setSaved(rec.saved);
      setPicked([]);
    } catch (err) {
      console.error(`Photo submission failed at stage "${stage}":`, err);
      const detail = err instanceof Error ? err.message : String(err);
      // Name the step even in production. A visitor reporting "it failed while
      // sending" gives us something to act on; "something went wrong" does not.
      const where = {
        verify: "while checking the verification box",
        tickets: "while getting ready to upload",
        upload: "while sending the photos",
        record: "while saving the photos — they may have uploaded already",
      }[stage];
      setError(
        `Something went wrong ${where}. Please try again, or email them to contact@joeweisman.org.` +
          (process.env.NODE_ENV === "development" ? ` [${detail}]` : ""),
      );
      resetTurnstile();
    } finally {
      setBusy(false);
      setVerifying(false);
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
            <div
              className="cf-turnstile"
              data-sitekey={siteKey}
              data-action="turnstile-spin-v2"
              /* Renew the token automatically when it ages out, so submitting
                 after a long caption-writing session usually just works. */
              data-refresh-expired="auto"
            />
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {verifying && (
            <p className="muted-note" role="status">
              Refreshing the verification&hellip; this takes a moment.
            </p>
          )}

          {progress && !verifying && (
            <p className="muted-note" role="status">
              Sending {progress.done} of {progress.total}…
            </p>
          )}

          <button type="submit" disabled={busy || picked.length === 0}>
            {verifying
              ? "Verifying…"
              : busy
                ? "Sending…"
                : picked.length > 1
                  ? `Send ${picked.length} photographs`
                  : "Send photograph"}
          </button>
        </form>
      </section>
    </>
  );
}

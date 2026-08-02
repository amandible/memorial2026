"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import {
  requestUploads,
  recordPhotos,
  recordArtifactFiles,
  type Submission,
  type FileSubmission,
} from "./actions";
import { ARTIFACTS_LABEL } from "@/lib/sections";

type Kind = "photo" | "artifact";

type Picked = {
  file: File;
  caption: string;
  year: string;
  kind: Kind;
  /** Pictures go to Cloudflare Images; everything else goes to the R2 archive. */
  isImage: boolean;
  key: string;
};

const MAX_FILES = 12;
const MAX_OTHER_FILES = 6;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_OTHER_BYTES = 100 * 1024 * 1024;

/**
 * Some browsers report an empty type for HEIC straight off an iPhone — which is
 * the single most likely thing to arrive here — so fall back to the extension
 * rather than misrouting a photograph into the file archive, where it would
 * never reach the gallery.
 */
const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|tiff?|gif|avif|bmp)$/i;

function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || (f.type === "" && IMAGE_EXT.test(f.name));
}

type UploadOutcome =
  | { ok: true }
  | { ok: false; kind: "http"; label: string }
  | { ok: false; kind: "connection" };

/**
 * Send one file, retrying only what's worth retrying.
 *
 * A dropped connection is usually a one-off blip — weak wifi, a flaky hop — so
 * retry silently a couple of times before bothering the visitor with it. An HTTP
 * error response is deterministic: the far end actively rejected the file, and
 * sending it again will be rejected again.
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

export default function PhotoForm({
  siteKey,
  defaultKind = "photo",
}: {
  siteKey?: string;
  defaultKind?: Kind;
}) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  // Which galleries the batch went to, so the thank-you can link to the right
  // one. Read off what actually uploaded, not what was picked.
  const [savedKinds, setSavedKinds] = useState<Kind[]>([]);
  /** Non-photo files in the batch, which have no page to link to. */
  const [savedFiles, setSavedFiles] = useState(0);
  const [verifying, setVerifying] = useState(false);
  // Implicit rendering gives no event for "the widget appeared" — Cloudflare's
  // script just scans the DOM once it loads. Polling the container for the
  // iframe it injects is the only way to know the empty box isn't permanent.
  const [tsStatus, setTsStatus] = useState<"loading" | "ready" | "error">("loading");
  const fileInput = useRef<HTMLInputElement>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const start = Date.now();

    function tick() {
      if (cancelled) return;

      // Detect the *script*, not the widget. Looking for an iframe inside the
      // container was wrong twice over: Turnstile renders into a shadow root,
      // so querySelector never finds one, and a visibly working widget showing
      // "Success!" still reported "taking longer than expected".
      //
      // The only thing this warning is really about is whether an extension
      // blocked challenges.cloudflare.com, and that is exactly what the absence
      // of window.turnstile means. If the script is there, the check works —
      // whether the widget has finished is not our business.
      const scriptLoaded =
        typeof (window as { turnstile?: unknown }).turnstile !== "undefined";
      const solved = Boolean(readToken());
      const hasWidget = Boolean(turnstileBox.current?.firstElementChild);

      const next: typeof tsStatus =
        scriptLoaded || solved || hasWidget
          ? "ready"
          : Date.now() - start > 20_000
            ? "error"
            : "loading";

      // Only set state when it actually changes; this ticks every 300ms and
      // would otherwise re-render the whole form ~65 times while loading.
      setTsStatus((prev) => (prev === next ? prev : next));
      if (next === "ready") return;
      setTimeout(tick, 300);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  function onPick(list: FileList | null) {
    setError(null);
    if (!list) return;
    const files = Array.from(list);

    const tooBig = files.find(
      (f) => f.size > (isImageFile(f) ? MAX_IMAGE_BYTES : MAX_OTHER_BYTES),
    );
    if (tooBig) {
      setError(
        `"${tooBig.name}" is larger than ${isImageFile(tooBig) ? "25 MB" : "100 MB"}. Please send that one to contact@joeweisman.org instead.`,
      );
      return;
    }

    const next = [
      ...picked,
      ...files.map((f) => ({
        file: f,
        caption: "",
        year: "",
        // A file that isn't a picture is an artifact by definition — there is no
        // gallery it could go to — so the toggle isn't offered for those.
        kind: isImageFile(f) ? defaultKind : ("artifact" as Kind),
        isImage: isImageFile(f),
        key: `${f.name}-${f.size}-${f.lastModified}`,
      })),
    ];
    const unique = next.filter((p, i) => next.findIndex((x) => x.key === p.key) === i);

    if (unique.filter((p) => p.isImage).length > MAX_FILES) {
      setError(`Please send up to ${MAX_FILES} photos at a time. You can come back and add more.`);
      return;
    }
    if (unique.filter((p) => !p.isImage).length > MAX_OTHER_FILES) {
      setError(`Please send up to ${MAX_OTHER_FILES} files other than photographs at a time.`);
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
      setError("Please choose at least one file.");
      return;
    }

    // Two destinations: Cloudflare Images for anything renderable, R2 for the
    // rest. Split once here so the ticket request and both upload loops agree
    // on which file is which.
    const images = picked.filter((p) => p.isImage);
    const others = picked.filter((p) => !p.isImage);

    setBusy(true);
    setProgress({ done: 0, total: picked.length });

    // Which step we're on, so a failure says something useful instead of
    // "something went wrong". Three earlier reports were undiagnosable because
    // every failure produced the same sentence.
    let stage: "verify" | "tickets" | "upload" | "record" = "verify";

    try {
      let token = readToken();

      if (!token) {
        // Always wait, whatever the passive poll thinks. An earlier version
        // bailed immediately when tsStatus was "error" — but that status only
        // means "hasn't appeared yet", not "never will", and a slow widget that
        // was about to work got a hard "an ad blocker is active" instead. Never
        // refuse to try because of a guess about why something is slow.
        //
        // Waiting less when it already looks stuck, so a genuinely blocked
        // widget doesn't hold someone for the full twenty seconds.
        setVerifying(true);
        resetTurnstile();
        token = await waitForToken(tsStatus === "error" ? 8_000 : 20_000);
        setVerifying(false);
      }

      if (!token) {
        // Only now is it fair to blame the browser — we waited and nothing came.
        // tsStatus picks the wording, it no longer decides whether to try.
        setError(
          tsStatus === "error"
            ? "We couldn't load the security check — this usually means an ad blocker or privacy extension is active. Try turning it off for this site and reloading, or email the photos to contact@joeweisman.org instead. Your photos and captions are still here."
            : "Please complete the verification below, then press Send again. Your photos and captions are still here.",
        );
        return;
      }

      // One request for both kinds of upload, because a Turnstile token can only
      // be validated once — a second verification would need a second challenge
      // solved halfway through a submission that had already started uploading.
      stage = "tickets";
      const res = await requestUploads(
        images.length,
        others.map((p) => ({ name: p.file.name, size: p.file.size })),
        token,
      );
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
      const doneFiles: FileSubmission[] = [];
      const failures: string[] = [];
      let sent = 0;

      for (let i = 0; i < images.length; i++) {
        const ticket = res.tickets[i];
        const body = new FormData();
        body.append("file", images[i].file);

        const outcome = await uploadWithRetry(
          () => fetch(ticket.uploadURL, { method: "POST", body }),
          images[i].file.name,
        );
        if (outcome.ok) {
          done.push({
            id: ticket.id,
            handle: ticket.handle,
            expiresAt: ticket.expiresAt,
            caption: images[i].caption,
            year: images[i].year,
            kind: images[i].kind,
          });
        } else {
          failures.push(
            outcome.kind === "http" ? outcome.label : `${images[i].file.name} (connection)`,
          );
        }
        setProgress({ done: ++sent, total: picked.length });
      }

      // Straight to R2 with a PUT — a presigned URL takes the raw body, not a
      // multipart form, which is the difference between this and the images above.
      for (let i = 0; i < others.length; i++) {
        const ticket = res.fileTickets[i];
        const outcome = await uploadWithRetry(
          () => fetch(ticket.uploadURL, { method: "PUT", body: others[i].file }),
          others[i].file.name,
        );
        if (outcome.ok) {
          doneFiles.push({
            storageKey: ticket.storageKey,
            handle: ticket.handle,
            expiresAt: ticket.expiresAt,
            filename: others[i].file.name,
            contentType: others[i].file.type || null,
            byteSize: others[i].file.size,
            description: others[i].caption,
          });
        } else {
          failures.push(
            outcome.kind === "http" ? outcome.label : `${others[i].file.name} (connection)`,
          );
        }
        setProgress({ done: ++sent, total: picked.length });
      }

      if (done.length === 0 && doneFiles.length === 0) {
        resetTurnstile();
        setError(
          `Those files couldn't be sent${failures.length ? ` — ${failures.join(", ")}` : ""}. Please try again, or email them to contact@joeweisman.org.`,
        );
        return;
      }
      if (failures.length > 0) {
        console.warn("Some files failed to upload:", failures);
      }

      stage = "record";

      let savedTotal = 0;
      if (done.length > 0) {
        const rec = await recordPhotos(done, name, email);
        if (!rec.ok) {
          setError(rec.error ?? "Something went wrong.");
          resetTurnstile();
          return;
        }
        savedTotal += rec.saved;
      }
      if (doneFiles.length > 0) {
        const rec = await recordArtifactFiles(doneFiles, name, email);
        if (!rec.ok) {
          setError(rec.error ?? "Something went wrong.");
          resetTurnstile();
          return;
        }
        savedTotal += rec.saved;
      }

      setSaved(savedTotal);
      setSavedFiles(doneFiles.length);
      setSavedKinds(
        Array.from(new Set(done.map((d) => (d.kind === "artifact" ? "artifact" : "photo")))),
      );
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
          Thank you &mdash; {saved === 1 ? "it has" : `all ${saved} have`} been sent.
        </p>
        {saved > savedFiles && (
          <p className="muted-note">
            The pictures will appear in the gallery once someone has had a look at
            them.
          </p>
        )}
        {/* Say plainly that these don't show up anywhere, so nobody goes looking
            for a recording in a gallery and concludes it was lost. */}
        {savedFiles > 0 && (
          <p className="muted-note">
            {savedFiles === 1 ? "The other file is" : `The other ${savedFiles} files are`}{" "}
            kept in the family archive rather than shown on the site. Someone will
            look at {savedFiles === 1 ? "it" : "them"} and work out the right way to
            share {savedFiles === 1 ? "it" : "them"}.
          </p>
        )}
        <button type="button" className="btn-quiet" onClick={() => setSaved(0)}>
          Send more
        </button>{" "}
        {savedKinds.includes("photo") && (
          <Link href="/photos" className="btn-quiet">
            View the photographs
          </Link>
        )}{" "}
        {savedKinds.includes("artifact") && (
          <Link href="/artifacts" className="btn-quiet">
            View {ARTIFACTS_LABEL.toLowerCase()}
          </Link>
        )}
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

      <section id="add" className="add-entry">
        <h2>{defaultKind === "artifact" ? "Send something of his" : "Send your photographs"}</h2>
        <p className="muted-note">
          Anything at all &mdash; the boat, the commune, a sauna he built, a
          kitchen he improved. Pictures of things he made, marked, or kept go to{" "}
          <Link href="/artifacts">{ARTIFACTS_LABEL.toLowerCase()}</Link>; mark
          each one below. They&rsquo;ll appear once someone has looked at them.
        </p>

        <form onSubmit={submit} className="form">
          <div className="field">
            <label htmlFor="ph-files">Choose files</label>
            {/* No accept filter. Anything of his is worth having — a recording,
                a scan, a letter, the source to something he wrote — and an
                allowlist would quietly refuse whichever format nobody thought
                of. Non-pictures go to the private archive, never to a page, so
                there is nothing to be gained by narrowing what can be sent. */}
            <input
              id="ph-files"
              ref={fileInput}
              type="file"
              multiple
              disabled={busy}
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="muted-note">
              Up to {MAX_FILES} photographs at a time, 25 MB each &mdash; straight off
              a phone is fine. Other kinds of file are welcome too: recordings,
              scans, letters, documents, up to {MAX_OTHER_FILES} at a time and 100 MB
              each. Those go into the family archive rather than onto the site.
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
                  {/* Per file rather than per submission: a batch straight off
                      a phone is often a mix, and captions and years are already
                      per file, so this is the same shape. Whatever gets chosen,
                      the admin page can move it afterwards. */}
                  {p.isImage ? (
                    <fieldset className="kind-choice">
                      <legend className="picked-caption-label">What is this?</legend>
                      {(
                        [
                          ["photo", "Photograph of Joe"],
                          ["artifact", "Something he made or owned"],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="kind-option">
                          <input
                            type="radio"
                            name={`kind-${i}`}
                            value={value}
                            checked={p.kind === value}
                            disabled={busy}
                            onChange={() =>
                              setPicked(
                                picked.map((x) =>
                                  x.key === p.key ? { ...x, kind: value } : x,
                                ),
                              )
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    // No gallery could show a recording or a document, so there
                    // is no choice to offer — only an honest account of where it
                    // goes, rather than letting someone expect it on the site.
                    <p className="muted-note">
                      Not a picture &mdash; this goes into the family archive rather
                      than a gallery.
                    </p>
                  )}
                  <label htmlFor={`cap-${i}`} className="picked-caption-label">
                    {p.isImage ? "Caption" : "What is it?"}{" "}
                    <span className="optional">(optional)</span>
                  </label>
                  <input
                    id={`cap-${i}`}
                    type="text"
                    maxLength={500}
                    disabled={busy}
                    placeholder={
                      p.isImage
                        ? "Who, where, when — whatever you remember"
                        : "What it is, and anything we'd need to know to make sense of it"
                    }
                    value={p.caption}
                    onChange={(e) =>
                      setPicked(picked.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))
                    }
                  />
                  <label htmlFor={`yr-${i}`} className="picked-caption-label">
                    Year taken <span className="optional">(optional)</span>
                  </label>
                  <input
                    id={`yr-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    className="year-input"
                    disabled={busy}
                    placeholder="e.g. 1978"
                    value={p.year}
                    onChange={(e) =>
                      setPicked(
                        picked.map((x) =>
                          x.key === p.key
                            ? { ...x, year: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) }
                            : x,
                        ),
                      )
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
            <div className="field">
              <div
                ref={turnstileBox}
                className="cf-turnstile"
                data-sitekey={siteKey}
                data-action="turnstile-spin-v2"
                /* Renew the token automatically when it ages out, so submitting
                   after a long caption-writing session usually just works. */
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
                  blocking it, or you can email the photos to contact@joeweisman.org
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
                  ? `Send ${picked.length} files`
                  : "Send"}
          </button>
        </form>
      </section>
    </>
  );
}

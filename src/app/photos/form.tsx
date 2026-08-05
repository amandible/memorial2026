"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  requestUploads,
  recordPhotos,
  recordArtifactFiles,
  type Submission,
  type FileSubmission,
} from "./actions";
import { ARTIFACTS_LABEL } from "@/lib/sections";
import { parseYear } from "@/lib/year";

type Kind = "photo" | "artifact";

type Picked = {
  file: File;
  caption: string;
  year: string;
  kind: Kind;
  /** Pictures go to Cloudflare Images; everything else goes to the R2 archive. */
  isImage: boolean;
  /** Object URL for the preview, or null once the browser has failed to render it. */
  preview: string | null;
  /** True once the preview is the small EXIF thumbnail rather than the file itself. */
  previewIsThumb: boolean;
  /** Set when the year came from the file rather than the sender, so it can say so. */
  yearFromFile: boolean;
  /** Pixel size of the original, for the admin page. Not shown to the sender. */
  width: number | null;
  height: number | null;
  key: string;
};

const MAX_FILES = 12;
const MAX_OTHER_FILES = 6;
/**
 * Cloudflare Images refuses anything over 10 MB, so this has to match theirs.
 *
 * It used to say 25 MB, which meant a photograph between the two limits passed
 * our check, uploaded, and was rejected at the far end — the sender got
 * "IMG_4032.jpeg (413)" after waiting through the upload, with no idea what to
 * do about it. Better to say so before they wait.
 *
 * Their other documented limits are 12,000 px on a side and 100 megapixels;
 * nothing a camera produces comes near those, so only size is checked here.
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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

/**
 * Load the EXIF parser only once someone has actually picked a photograph.
 *
 * The lite build rather than the full one: 44 KB against 74 KB, and it still
 * reads HEIC, which is the format most of these arrive in. Statically importing
 * src/lib/exif.ts here would put the parser in the bundle for every visitor who
 * merely opens the page, most of whom never choose a file.
 */
async function exifLite() {
  return (await import(
    /* webpackChunkName: "exifr-lite" */ "exifr/dist/lite.esm.mjs"
  )) as {
    parse: (f: Blob, opts?: unknown) => Promise<Record<string, unknown> | undefined>;
    thumbnailUrl: (f: Blob) => Promise<string | undefined>;
  };
}

const EMAIL_FALLBACK =
  "you can email them to contact@joeweisman.org instead — we would much rather have them that way than not at all. Your photos and captions are still here.";

/**
 * Say what actually went wrong, because the advice differs completely.
 *
 * "Please complete the verification and press Send again" was shown for every
 * one of these. For an unsupported browser that is false and unactionable, and
 * it sends someone hunting for a checkbox that will never work.
 */
function turnstileFailureMessage(state: string, code: string | null): string {
  switch (state) {
    case "unsupported":
      return `The security check doesn't support this browser, which is nothing you've done wrong and isn't worth fighting — ${EMAIL_FALLBACK}`;
    case "blocked":
      return `We couldn't load the security check at all. That is usually an ad blocker or privacy extension. Try switching it off for this site and reloading — or ${EMAIL_FALLBACK}`;
    case "timeout":
      return `The security check timed out waiting for an answer. Reload the page and try once more, or ${EMAIL_FALLBACK}`;
    case "interactive":
      return "The security check below is waiting for you — please finish it, then press Send again. Your photos and captions are still here.";
    case "errored":
      return `The security check failed${code ? ` (${code})` : ""}. Reload the page and try again, or ${EMAIL_FALLBACK}`;
    case "expired":
      return "The security check expired while you were writing. It is refreshing now — give it a couple of seconds and press Send again. Your photos and captions are still here.";
    default:
      return "Please complete the verification below, then press Send again. Your photos and captions are still here.";
  }
}

/**
 * Tell the server a submission failed in the browser.
 *
 * Everything that has gone wrong with this form went wrong on someone else's
 * machine, where nothing we can read reaches. Vercel's free tier keeps runtime
 * logs for an hour, so even the server half is gone by the time anyone reports
 * it. Best effort and deliberately silent: this must never be the reason a
 * submission fails.
 */
async function reportClientFailure(info: {
  stage: string;
  detail: string;
  files: number;
}): Promise<void> {
  try {
    await fetch("/api/upload-trouble", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(info),
      keepalive: true,
    });
  } catch {
    // Reporting a failure must not create one.
  }
}

/** Only the parts of Cloudflare's API this form uses. */
type TurnstileApi = {
  ready: (cb: () => void) => void;
  render: (el: HTMLElement, params: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
  getResponse: (id?: string) => string | undefined;
  isExpired: (id?: string) => boolean;
};

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
  /**
   * Why there is no token, when there is no token.
   *
   * Previously this was one "loading | ready | error" flag inferred by polling,
   * and every distinct failure collapsed into the same sentence: "please
   * complete the verification below, then press Send again." Someone hit that
   * and pressing Send again did not help, which is what it looks like when the
   * cause was never "you haven't clicked it yet".
   *
   * Turnstile reports each of these separately through callbacks, so they are
   * kept separate here — they need different advice. An unsupported browser
   * cannot be fixed by trying again, and telling someone to disable an ad
   * blocker they do not have wastes the one thing they have left.
   */
  type TsState =
    | "loading" // script hasn't run yet
    | "ready" // widget rendered, no token yet
    | "solved" // we hold a token
    | "expired" // had one, it aged out
    | "interactive" // showing a challenge that needs a click
    | "timeout" // interactive challenge went unanswered
    | "unsupported" // Turnstile does not support this browser
    | "errored" // challenge failed or the network did
    | "blocked"; // script never arrived at all
  const [tsState, setTsState] = useState<TsState>("loading");
  const [tsErrorCode, setTsErrorCode] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const widgetId = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  /** Every object URL handed out, so none leaks when the page goes away. */
  const objectUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    };
  }, []);

  /**
   * Render the widget ourselves, so it can tell us what went wrong.
   *
   * Implicit rendering (a .cf-turnstile div that the script finds on its own)
   * gives no way to receive the callbacks, which meant the only signal available
   * was polling for a token and guessing at the silence. Explicit rendering
   * takes real function references, so every failure mode names itself.
   */
  const mountTurnstile = useCallback(() => {
    if (!siteKey || widgetId.current) return;
    const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    const box = turnstileBox.current;
    if (!api || !box) return;

    api.ready(() => {
      // React runs effects twice in development; a second render here would
      // leave an orphaned widget behind.
      if (widgetId.current || !turnstileBox.current) return;

      widgetId.current = api.render(turnstileBox.current, {
        sitekey: siteKey,
        action: "turnstile-spin-v2",
        "refresh-expired": "auto",
        callback: (token: string) => {
          tokenRef.current = token;
          setTsErrorCode(null);
          setTsState("solved");
        },
        "expired-callback": () => {
          // Expected on this form, not a fault: tokens last 300 seconds and
          // writing captions for a dozen photographs takes longer than that.
          tokenRef.current = null;
          setTsState("expired");
        },
        "before-interactive-callback": () => setTsState("interactive"),
        "after-interactive-callback": () =>
          setTsState((s) => (s === "interactive" ? "ready" : s)),
        "timeout-callback": () => {
          tokenRef.current = null;
          setTsState("timeout");
        },
        "unsupported-callback": () => {
          tokenRef.current = null;
          setTsState("unsupported");
        },
        "error-callback": (code?: string) => {
          tokenRef.current = null;
          setTsErrorCode(code ?? null);
          setTsState("errored");
          // Returning true keeps the widget alive so its own retry can run;
          // returning false would tear it down and leave an empty box.
          return true;
        },
      });
      setTsState((s) => (s === "loading" ? "ready" : s));
    });
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    // The script may already be present from an earlier mount.
    mountTurnstile();

    // If it never arrives at all, that is an extension or a network blocking
    // challenges.cloudflare.com, which is a different problem from any of the
    // widget's own failures and needs different advice.
    const giveUp = setTimeout(() => {
      if (!(window as unknown as { turnstile?: unknown }).turnstile) {
        setTsState((s) => (s === "loading" ? "blocked" : s));
      }
    }, 20_000);

    const id = widgetId.current;
    return () => {
      clearTimeout(giveUp);
      if (id) {
        try {
          (window as unknown as { turnstile?: TurnstileApi }).turnstile?.remove(id);
        } catch {
          // Already gone; nothing to clean up.
        }
        widgetId.current = null;
      }
    };
  }, [siteKey, mountTurnstile]);

  function onPick(list: FileList | null) {
    setError(null);
    if (!list) return;
    const files = Array.from(list);

    const tooBig = files.find(
      (f) => f.size > (isImageFile(f) ? MAX_IMAGE_BYTES : MAX_OTHER_BYTES),
    );
    if (tooBig) {
      setError(
        isImageFile(tooBig)
          ? `"${tooBig.name}" is ${(tooBig.size / 1048576).toFixed(0)} MB, and our image service can't take anything over 10 MB. Please email that one to contact@joeweisman.org — we'd still very much like to have it, and we'll resize it at this end.`
          : `"${tooBig.name}" is larger than 100 MB. Please email that one to contact@joeweisman.org instead.`,
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
        preview: null,
        previewIsThumb: false,
        yearFromFile: false,
        width: null,
        height: null,
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

    // Previews and dates are a nicety — never let one throw into the pick.
    for (const p of unique) {
      if (p.isImage && p.preview === null) void preparePreview(p.key, p.file);
    }
  }

  /**
   * Give each picked photograph a thumbnail and, where the file knows, a year.
   *
   * Without this the form is a list of filenames, and with five photographs
   * there is no way to tell which caption box belongs to which picture.
   *
   * Updates go through the functional form of setPicked and match on key: these
   * land out of order, after further picks and removals, and indexes will have
   * moved by then.
   */
  async function preparePreview(key: string, file: File) {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    setPicked((cur) => cur.map((p) => (p.key === key ? { ...p, preview: url } : p)));

    try {
      const { parse } = await exifLite();
      const tags = await parse(file, {
        // Blocks, not `pick`. `pick` resolves tag names through a dictionary the
        // lite build doesn't ship, so passing it made every call throw — which
        // the catch below was quietly eating, and the year never appeared.
        // Checked against all 26 archived originals: these options agree with
        // the full build's result on every one, including the eight with no
        // date at all.
        ifd0: false,
        exif: true,
        gps: false,
        // Keep the raw "YYYY:MM:DD hh:mm:ss" string. EXIF carries no timezone,
        // and letting it become a Date then reading it back shifts some
        // photographs into the previous day — occasionally the previous year.
        reviveValues: false,
      });
      const raw = String(tags?.DateTimeOriginal ?? tags?.CreateDate ?? "");
      const year = parseYear(raw.match(/^(\d{4})/)?.[1]);

      // EXIF dimensions are the fallback only. They describe what the camera
      // captured, so they go stale the moment anything is cropped — two of the
      // 29 archived originals disagree with their own file header for exactly
      // that reason. What the browser decoded wins, and is set below.
      const ew = Number(tags?.ExifImageWidth ?? tags?.ImageWidth ?? 0) || null;
      const eh = Number(tags?.ExifImageHeight ?? tags?.ImageHeight ?? 0) || null;

      if (!year && !(ew && eh)) return;

      setPicked((cur) =>
        cur.map((p) => {
          if (p.key !== key) return p;
          return {
            ...p,
            // Never overwrite something typed. A sender who has entered a year
            // knows more than the file does — a phone photograph of a 1975 print
            // is stamped with today's date and every automated check passes.
            ...(year && !p.year ? { year: String(year), yearFromFile: true } : {}),
            ...(ew && eh && !p.width ? { width: ew, height: eh } : {}),
          };
        }),
      );
    } catch (e) {
      // A file with no metadata resolves to undefined; it does not throw. So a
      // throw here means the parser itself is unhappy, which is a bug and not
      // the ordinary case — an empty catch hid exactly that for a whole release.
      console.warn("Couldn't read a date from", file.name, e);
    }
  }

  /**
   * Fall back to the thumbnail embedded in the file's own metadata.
   *
   * HEIC is the common case: Safari renders it, Chrome and Firefox don't, so an
   * iPhone photograph previews on the phone it came from and shows a broken
   * image on a laptop. The EXIF thumbnail is an ordinary JPEG that every browser
   * can draw.
   */
  async function onPreviewError(key: string, file: File, failedUrl: string | null) {
    if (failedUrl) {
      URL.revokeObjectURL(failedUrl);
      objectUrls.current.delete(failedUrl);
    }
    try {
      const { thumbnailUrl } = await exifLite();
      const url = await thumbnailUrl(file);
      if (url) {
        objectUrls.current.add(url);
        setPicked((cur) =>
          cur.map((p) => (p.key === key ? { ...p, preview: url, previewIsThumb: true } : p)),
        );
        return;
      }
    } catch (e) {
      // A file with no embedded thumbnail resolves to undefined rather than
      // throwing, so this is a real fault too, not the ordinary case.
      console.warn("Couldn't extract an embedded thumbnail from", file.name, e);
    }
    setPicked((cur) => cur.map((p) => (p.key === key ? { ...p, preview: null } : p)));
  }

  function forget(p: Picked) {
    if (p.preview) {
      URL.revokeObjectURL(p.preview);
      objectUrls.current.delete(p.preview);
    }
    setPicked((cur) => cur.filter((x) => x.key !== p.key));
  }

  function turnstileApi(): TurnstileApi | undefined {
    return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
  }

  function resetTurnstile() {
    tokenRef.current = null;
    // Turnstile removes its own widget on some failures (110200, for one), and
    // reset() then throws "Nothing to reset found for provided container".
    // That turned a clear error into the generic catch-all. Never let cleanup
    // become the reported failure.
    try {
      turnstileApi()?.reset(widgetId.current ?? undefined);
      setTsState((s) => (s === "solved" || s === "expired" ? "ready" : s));
    } catch (e) {
      console.warn("Turnstile reset failed (widget already gone):", e);
    }
  }

  /**
   * The token, from whichever source has it.
   *
   * The callback is authoritative and arrives the moment the challenge is
   * solved. getResponse() is the documented accessor and covers a token that
   * existed before this component mounted. The hidden input is last: it is a DOM
   * detail, and assuming DOM details is what caused the previous two bugs here.
   */
  function readToken(): string | null {
    if (tokenRef.current) return tokenRef.current;
    try {
      const t = turnstileApi()?.getResponse(widgetId.current ?? undefined);
      if (t) return t;
    } catch {
      // No widget rendered yet.
    }
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
        setVerifying(true);

        // Reset ONLY what is genuinely spent. The previous version reset
        // unconditionally before waiting, which is the likeliest cause of
        // "press Send again didn't work": pressing Send while the challenge is
        // mid-solve threw that challenge away and started a new one, so the
        // twenty-second wait was spent on a widget that had just been returned
        // to needing another click. Pressing Send again did the same thing
        // again. An expired or errored widget does need the reset; one that is
        // simply still working needs to be left alone.
        const spent =
          tsState === "expired" ||
          tsState === "errored" ||
          tsState === "timeout" ||
          (() => {
            try {
              return turnstileApi()?.isExpired(widgetId.current ?? undefined) === true;
            } catch {
              return false;
            }
          })();
        if (spent) resetTurnstile();

        // Always wait, whatever the state says. An earlier version bailed
        // immediately on a bad status — but "hasn't appeared yet" is not "never
        // will", and a slow widget that was about to work got a hard "an ad
        // blocker is active" instead. Never refuse to try because of a guess
        // about why something is slow. Wait less only when the script itself
        // never arrived, since nothing is coming.
        token = await waitForToken(tsState === "blocked" ? 8_000 : 20_000);
        setVerifying(false);
      }

      if (!token) {
        // Only now is it fair to say why. Each of these is a different problem
        // with different advice, and collapsing them into one sentence is what
        // made the last round undiagnosable.
        setError(turnstileFailureMessage(tsState, tsErrorCode));
        void reportClientFailure({
          stage: "verify",
          detail: `turnstile:${tsState}${tsErrorCode ? `:${tsErrorCode}` : ""}`,
          files: picked.length,
        });
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
            width: images[i].width,
            height: images[i].height,
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
      void reportClientFailure({ stage, detail: detail.slice(0, 200), files: picked.length });
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
          // Explicit rendering: we call turnstile.render ourselves so the
          // callbacks can be real functions rather than globals hung off window.
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={mountTurnstile}
          onError={() => setTsState("blocked")}
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
              Up to {MAX_FILES} photographs at a time, 10 MB each &mdash; straight off
              a phone is fine. Other kinds of file are welcome too: recordings,
              scans, letters, documents, up to {MAX_OTHER_FILES} at a time and 100 MB
              each. Those go into the family archive rather than onto the site.
            </span>
          </div>

          {picked.length > 0 && (
            <ol className="picked">
              {picked.map((p, i) => (
                <li key={p.key} className="picked-item">
                  {/* The thumbnail is why this list is usable: five filenames
                      give no way to tell which caption box belongs to which
                      photograph. */}
                  {p.isImage && (
                    <div className="picked-thumb" aria-hidden="true">
                      {p.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.preview}
                          alt=""
                          onError={() => void onPreviewError(p.key, p.file, p.preview)}
                          /* What the browser decoded is the true size of the
                             file, so it overrides anything EXIF claimed. Only
                             recorded for the full-size preview — the embedded
                             EXIF thumbnail is a different, tiny image. */
                          onLoad={(e) => {
                            const el = e.currentTarget;
                            if (!el.naturalWidth || p.previewIsThumb) return;
                            setPicked((cur) =>
                              cur.map((x) =>
                                x.key === p.key
                                  ? { ...x, width: el.naturalWidth, height: el.naturalHeight }
                                  : x,
                              ),
                            );
                          }}
                        />
                      ) : (
                        <span className="picked-thumb-none">no preview</span>
                      )}
                    </div>
                  )}
                  <div className="picked-body">
                  <div className="picked-head">
                    <span className="picked-name">{p.file.name}</span>
                    <button
                      type="button"
                      className="btn-quiet"
                      disabled={busy}
                      onClick={() => forget(p)}
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
                  {/* Only photographs carry a year — artifact_files has no such
                      column, and "year taken" means little for a document. */}
                  {p.isImage && (
                    <>
                      <label htmlFor={`yr-${i}`} className="picked-caption-label">
                        Year taken <span className="optional">(optional)</span>
                      </label>
                      <span className="year-row">
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
                                  ? {
                                      ...x,
                                      year: e.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                                      // Once it's been edited it is the sender's
                                      // answer, not the file's.
                                      yearFromFile: false,
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        {/* Say where it came from, and that it can be wrong. A
                            phone photograph of an old print is stamped with
                            today's date, which is exactly what a memorial
                            attracts — the sender is the only one who can tell. */}
                        {p.yearFromFile && (
                          <span className="muted-note">
                            from the file &mdash; please correct it if the photograph
                            is older than that
                          </span>
                        )}
                      </span>
                    </>
                  )}
                  </div>
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
              {/* No cf-turnstile class and no data-sitekey: those are what make
                  the script render a widget by itself, and it would then render
                  a second one on top of the one we render explicitly. */}
              <div ref={turnstileBox} />

              {/* Only says something when there is something worth saying. The
                  ordinary states — waiting, solved — need no commentary, and
                  narrating them is what previously told people the form was
                  broken while the widget above read "Success!". */}
              {tsState === "unsupported" && (
                <p className="muted-note" role="status">
                  The security check doesn&rsquo;t support this browser. Please
                  email your photographs to contact@joeweisman.org and
                  we&rsquo;ll add them for you.
                </p>
              )}
              {tsState === "blocked" && (
                <p className="muted-note" role="status">
                  The verification check couldn&rsquo;t load &mdash; usually an ad
                  blocker or privacy extension. Try switching it off for this
                  site and reloading, or email the photos to
                  contact@joeweisman.org instead.
                </p>
              )}
              {tsState === "timeout" && (
                <p className="muted-note" role="status">
                  The verification check timed out. Reload the page to try again.
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

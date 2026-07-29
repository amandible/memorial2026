import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cloudflare Images.
 *
 * Visitor photos go straight from the browser to Cloudflare via a one-time
 * direct-upload URL. Cloudflare transcodes on ingest, which is the whole reason
 * it's here: a large share of these will be HEIC from iPhones, which browsers
 * cannot render and which `sharp` does not decode in its default builds.
 *
 * Ingesting rather than archiving first is a deliberate change from PLAN.md §5.
 * The original plan held pending uploads in R2 and only pushed to Images on
 * approval — which would have meant moderating HEIC files with no viewable
 * derivative, i.e. approving photos you cannot see.
 *
 * Serving from here, never through next/image, is the security boundary in
 * PLAN.md §12: Next's optimizer runs sharp, and these files come from strangers.
 */

const API = "https://api.cloudflare.com/client/v4";

/** Named variant configured in the Cloudflare dashboard. "public" exists by default. */
const VARIANT = process.env.CF_IMAGES_VARIANT || "public";

/**
 * Smaller variant for the gallery grid.
 *
 * Deliberately falls back to the full-size variant when unset: Cloudflare
 * returns 404 for a variant that doesn't exist, so defaulting to a name that
 * might not be configured would break every image in the gallery. Set
 * CF_IMAGES_THUMB_VARIANT only once the variant exists in the dashboard.
 *
 * Named variants do not count against the transformations quota — they are
 * billed as Images Delivered — so this costs nothing extra.
 */
const THUMB_VARIANT = process.env.CF_IMAGES_THUMB_VARIANT || VARIANT;

/** Grid-sized URL. Same as imageUrl() until a thumbnail variant is configured. */
export function thumbUrl(id: string): string {
  return imageUrl(id, THUMB_VARIANT);
}

export function imagesConfigured(): boolean {
  return Boolean(process.env.CF_IMAGES_ACCOUNT_ID && process.env.CF_IMAGES_API_TOKEN);
}

/** Public delivery URL. The account hash is public — it appears in every image URL. */
export function imageUrl(id: string, variant: string = VARIANT): string {
  const hash = process.env.NEXT_PUBLIC_CF_IMAGES_HASH;
  if (!hash) return "";
  return `https://imagedelivery.net/${hash}/${encodeURIComponent(id)}/${variant}`;
}

export type DirectUpload = { id: string; uploadURL: string };

/**
 * Ask Cloudflare for a one-time upload URL. The browser POSTs the file there
 * directly, so the image never passes through our server.
 */
export async function createDirectUpload(): Promise<DirectUpload> {
  const account = process.env.CF_IMAGES_ACCOUNT_ID;
  const token = process.env.CF_IMAGES_API_TOKEN;
  if (!account || !token) throw new Error("Cloudflare Images is not configured.");

  const form = new FormData();
  // Expire the URL quickly: it is single-use, but a stale one shouldn't linger.
  form.set("expiry", new Date(Date.now() + 30 * 60_000).toISOString());
  // Metadata is stripped on ingest; nothing identifying is attached here.
  form.set("requireSignedURLs", "false");

  const res = await fetch(`${API}/accounts/${account}/images/v2/direct_upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await res.json()) as {
    success: boolean;
    result?: { id: string; uploadURL: string };
    errors?: { message: string }[];
  };
  if (!res.ok || !data.success || !data.result) {
    throw new Error(
      `Cloudflare Images direct_upload failed: ${data.errors?.map((e) => e.message).join("; ") ?? res.status}`,
    );
  }
  return { id: data.result.id, uploadURL: data.result.uploadURL };
}

/** Delete an image — used when a submission is rejected and purged. */
export async function deleteImage(id: string): Promise<void> {
  const account = process.env.CF_IMAGES_ACCOUNT_ID;
  const token = process.env.CF_IMAGES_API_TOKEN;
  if (!account || !token) return;
  await fetch(`${API}/accounts/${account}/images/v1/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => console.error("Failed to delete image", id, e));
}

/**
 * A short-lived signature binding an image id to a verified upload request.
 *
 * The browser has to make two calls — one to get an upload URL, one to record
 * the photo once it has uploaded — and Turnstile is checked on the first. This
 * carries that verification across to the second, so the recording endpoint
 * cannot be called with arbitrary image ids by anyone who skips the form.
 */
const HANDLE_TTL_MS = 60 * 60_000;

function handleSecret(): string {
  // Reuses the admin password purely as server-side key material; it is never
  // exposed and this grants no admin capability.
  const s = process.env.ADMIN_PASSWORD || process.env.TURNSTILE_SECRET;
  if (!s) throw new Error("No server secret available to sign upload handles.");
  return s;
}

export function signUploadHandle(id: string, expiresAt: number): string {
  return createHmac("sha256", handleSecret()).update(`${id}:${expiresAt}`).digest("hex");
}

export function newUploadHandle(id: string): { handle: string; expiresAt: number } {
  const expiresAt = Date.now() + HANDLE_TTL_MS;
  return { handle: signUploadHandle(id, expiresAt), expiresAt };
}

export function verifyUploadHandle(id: string, expiresAt: number, handle: string): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signUploadHandle(id, expiresAt);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(handle, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

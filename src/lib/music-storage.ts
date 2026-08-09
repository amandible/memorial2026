import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 — the PUBLIC bucket for approved-or-not recordings.
 *
 * A separate module from r2.ts on purpose, even though the shape is nearly
 * identical: r2.ts's own header comment says "nothing public ever reads
 * from here," and that needs to stay literally true rather than
 * conditionally true depending on which bucket a caller happened to pass.
 *
 * No staging step, no copy-on-approval: a recording is written here
 * directly at submission time, the same way a photo goes straight to
 * Cloudflare Images before anyone has moderated it. Approval only ever
 * controlled *listing*, never *object access* — see PLAN notes for photos.
 */

export function musicStorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_MUSIC_ACCESS_KEY_ID &&
      process.env.R2_MUSIC_SECRET_ACCESS_KEY &&
      process.env.R2_MUSIC_BUCKET,
  );
}

function client(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_MUSIC_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_MUSIC_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
}

function endpoint(key: string): string {
  const account = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_MUSIC_BUCKET;
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${path}`;
}

/**
 * A URL the browser can PUT one file to, without our server touching the
 * bytes — same shape and same reasoning as r2.ts's presignPut. Deliberately
 * not signing Content-Type (browsers disagree with each other about the
 * type of the same file, and there's no publish-time step here that needs
 * a trustworthy value to re-derive from — the object is just served as
 * whatever it is, from a different origin than billmelanson.org, which is
 * what actually contains the risk of a stranger's file).
 */
export async function presignPut(key: string, expiresInSeconds = 900): Promise<string> {
  if (!musicStorageConfigured()) throw new Error("Music storage is not configured.");

  const url = new URL(endpoint(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));

  const signed = await client().sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function deleteObject(key: string): Promise<void> {
  if (!musicStorageConfigured()) return;
  const res = await client().fetch(endpoint(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    console.error(`R2 (music) DELETE ${key} failed: ${res.status}`);
  }
}

/** The public URL a recording is served from — the free pub-*.r2.dev domain. */
export function publicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_MUSIC_PUBLIC_URL;
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 — the archive of photo originals.
 *
 * Not the serving layer. Nothing public ever reads from here; Cloudflare Images
 * serves the gallery. This exists so that the only copy of an irreplaceable
 * photograph is not sitting in one vendor's account.
 *
 * R2 speaks S3, which needs SigV4 request signing. aws4fetch is ~80KB and does
 * only that, rather than several megabytes of AWS SDK for a handful of PUTs.
 */

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

function client(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto", // R2 has no regions; "auto" is what it expects
  });
}

function endpoint(key: string): string {
  const account = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  // Encode each path segment but keep the slashes that separate them.
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${path}`;
}

export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  if (!r2Configured()) throw new Error("R2 is not configured.");

  // R2 rejects a PUT without Content-Length:
  //   411 MissingContentLength
  // An ArrayBuffer handed to fetch can be sent chunked with no length, which is
  // what happened in the Vercel runtime while working locally, where the
  // backfill script passes a Node Buffer and gets a length for free.
  // Normalise to a Uint8Array and state the length explicitly so both paths
  // behave the same.
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);

  const res = await client().fetch(endpoint(key), {
    method: "PUT",
    // Uint8Array is a valid fetch body at runtime; the DOM lib's BodyInit type
    // is narrower than reality here.
    body: bytes as unknown as BodyInit,
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
    },
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${key} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

export async function objectExists(key: string): Promise<boolean> {
  if (!r2Configured()) return false;
  const res = await client().fetch(endpoint(key), { method: "HEAD" });
  return res.ok;
}

export async function getObject(key: string): Promise<ArrayBuffer | null> {
  if (!r2Configured()) throw new Error("R2 is not configured.");
  const res = await client().fetch(endpoint(key));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status}`);
  return res.arrayBuffer();
}

export async function deleteObject(key: string): Promise<void> {
  if (!r2Configured()) return;
  const res = await client().fetch(endpoint(key), { method: "DELETE" });
  // 404 is success for our purposes — the object is gone either way.
  if (!res.ok && res.status !== 404) {
    console.error(`R2 DELETE ${key} failed: ${res.status}`);
  }
}

/** List every key under a prefix, following continuation tokens. */
export async function listObjects(prefix = ""): Promise<string[]> {
  if (!r2Configured()) throw new Error("R2 is not configured.");
  const account = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const url = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}`);
    url.searchParams.set("list-type", "2");
    if (prefix) url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);

    const res = await client().fetch(url.toString());
    if (!res.ok) throw new Error(`R2 list failed: ${res.status}`);
    const xml = await res.text();

    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      keys.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
      : undefined;
  } while (token);

  return keys;
}

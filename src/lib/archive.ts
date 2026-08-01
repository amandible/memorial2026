import { db } from "./db.ts";
import { putObject, objectExists, r2Configured } from "./r2.ts";
import { readExifDate } from "./exif.ts";

/**
 * Copy an approved photograph's original into R2.
 *
 * Cloudflare Images holds the only copy of a submitted photo until this runs.
 * That is fine for a week and unacceptable for a decade — the written content is
 * in git, but these are not, and the people who sent them are not thinking of
 * themselves as the backup.
 *
 * Archiving happens on approval rather than submission: it copies exactly what
 * the site has committed to keeping, and avoids permanently storing whatever a
 * stranger uploads to a public form. Anything missed is caught by
 * `npm run archive`.
 *
 * Always fails soft. A failed archive must never block approving a photograph.
 */

const API = "https://api.cloudflare.com/client/v4";

/** Fetch the byte-exact original from Cloudflare Images. Not a variant. */
async function fetchOriginal(imageId: string): Promise<{ body: ArrayBuffer; type: string }> {
  const account = process.env.CF_IMAGES_ACCOUNT_ID;
  const token = process.env.CF_IMAGES_API_TOKEN;
  if (!account || !token) throw new Error("Cloudflare Images is not configured.");

  const res = await fetch(`${API}/accounts/${account}/images/v1/${encodeURIComponent(imageId)}/blob`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Could not fetch original ${imageId}: ${res.status}`);
  return {
    body: await res.arrayBuffer(),
    type: res.headers.get("content-type") || "application/octet-stream",
  };
}

/**
 * The key an image is stored under.
 *
 * Keyed on the Cloudflare image id, which is stable and unique, so re-running is
 * idempotent and two photos can never collide.
 */
export function archiveKeyFor(imageId: string, contentType: string): string {
  const ext =
    { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif",
      "image/webp": "webp", "image/gif": "gif", "image/tiff": "tif" }[contentType] ?? "bin";
  return `photos/${imageId}.${ext}`;
}

export type ArchiveResult =
  | { status: "archived"; key: string; bytes: number }
  | { status: "skipped"; reason: string };

/**
 * Archive one photo by database row id. Idempotent: an object already present in
 * R2 is not re-uploaded, only recorded.
 */
export async function archivePhoto(rowId: string): Promise<ArchiveResult> {
  if (!r2Configured()) return { status: "skipped", reason: "R2 not configured" };

  const [row] = (await db()`
    select id, storage_ref, archived_at, taken_year, taken_source
    from photos where id = ${rowId}::uuid
  `) as {
    id: string; storage_ref: string; archived_at: Date | null;
    taken_year: number | null; taken_source: string | null;
  }[];

  if (!row) return { status: "skipped", reason: "no such photo" };
  if (row.archived_at) return { status: "skipped", reason: "already archived" };

  const { body, type } = await fetchOriginal(row.storage_ref);

  // The original is in hand for the archive, so read its capture date in the
  // same pass. Only fills a gap: a year the sender typed is never overwritten,
  // because they know things the file does not.
  try {
    const exif = await readExifDate(body);
    if (exif.takenAt || exif.year) {
      const fill = !row.taken_year;
      await db()`
        update photos set
          exif_taken_at = ${exif.takenAt},
          taken_year    = ${fill ? exif.year : row.taken_year},
          taken_source  = ${fill && exif.year ? "exif" : row.taken_source}
        where id = ${row.id}::uuid
      `;
    }
  } catch (e) {
    // Never let metadata reading break the archive it is riding along with.
    console.warn(`Could not read EXIF for ${row.storage_ref}:`, e);
  }
  const key = archiveKeyFor(row.storage_ref, type);

  // Belt and braces: if the object is already there from an interrupted run,
  // don't spend the upload, but do record it.
  if (!(await objectExists(key))) {
    await putObject(key, body, type);
  }

  await db()`
    update photos set archive_key = ${key}, archived_at = now() where id = ${row.id}::uuid
  `;

  return { status: "archived", key, bytes: body.byteLength };
}

/** Called from the approve action. Never throws. */
export async function archivePhotoQuietly(rowId: string): Promise<void> {
  try {
    const result = await archivePhoto(rowId);
    if (result.status === "archived") {
      console.log(`Archived ${result.key} (${result.bytes} bytes)`);
    } else if (result.reason !== "already archived") {
      console.warn(`Photo ${rowId} not archived: ${result.reason}`);
    }
  } catch (e) {
    // Left unarchived, with archived_at still null, so `npm run archive` picks
    // it up later. Approving must not fail because a backup did.
    console.error(`Failed to archive photo ${rowId}:`, e);
  }
}

/** Approved photos with no archive yet — what the backfill works through. */
export async function unarchivedPhotos(): Promise<{ id: string; storage_ref: string }[]> {
  return (await db()`
    select id, storage_ref from photos
    where status = 'approved' and archived_at is null
    order by created_at
  `) as { id: string; storage_ref: string }[];
}

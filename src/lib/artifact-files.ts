import { randomUUID } from "node:crypto";
// Explicit .ts extension so the pure helpers below can be imported by the test
// runner, which resolves as plain ESM rather than through the bundler.
import { db } from "./db.ts";

/**
 * Artifact submissions that aren't photographs.
 *
 * A recording, a scan, a document, source code, a letter in his block-print
 * hand. These go to R2 and stop there: nothing in this table is ever served to
 * the public, and there is no route that would. What to do with each one — a
 * transcript, a page of its own, a link, nothing — is decided by hand later, the
 * way the recipes were.
 *
 * That is also the security position. Serving stranger-supplied files from
 * joeweisman.org would make an uploaded .html or .svg a stored cross-site
 * scripting hole on our own origin, and no amount of extension filtering makes
 * that safe. Not serving them at all does.
 */

export type ArtifactFile = {
  id: string;
  submitter: string | null;
  email: string | null;
  description: string | null;
  filename: string;
  content_type: string | null;
  byte_size: number | null;
  storage_key: string;
  status: "pending" | "approved" | "rejected";
  created_at: Date;
};

/** Anything larger than this should be a conversation, not a form submission. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Reduce a submitted filename to something safe to put in an object key.
 *
 * Only ever cosmetic — the key is unique because of the UUID in front of it, and
 * the real name is kept verbatim in the database. This exists so that a pulled
 * archive is readable on disk, and so a name like `../../etc/passwd` cannot
 * describe a path.
 */
export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    // A leading dot would make it hidden on disk; leading dashes read as flags.
    .replace(/^[.-]+/, "")
    .slice(0, 80);
  return cleaned || "file";
}

/** Where a submission lands in the bucket. Generated here, never sender-supplied. */
export function newStorageKey(filename: string): string {
  return `artifacts/${randomUUID()}-${safeFilename(filename)}`;
}

export async function recordArtifactFile(row: {
  storageKey: string;
  filename: string;
  contentType: string | null;
  byteSize: number | null;
  description: string | null;
  submitter: string | null;
  email: string | null;
  ipHash: string | null;
}): Promise<void> {
  await db()`
    insert into artifact_files
      (storage_key, filename, content_type, byte_size, description, submitter, email, ip_hash)
    values
      (${row.storageKey}, ${row.filename}, ${row.contentType}, ${row.byteSize},
       ${row.description}, ${row.submitter}, ${row.email}, ${row.ipHash})
  `;
}

/** Everything submitted, pending first, for the admin page. */
export async function getArtifactFiles(): Promise<ArtifactFile[]> {
  return (await db()`
    select id, submitter, email, description, filename, content_type, byte_size,
           storage_key, status, created_at
    from artifact_files
    order by (status = 'pending') desc, created_at
    limit 200
  `) as ArtifactFile[];
}

export async function getArtifactFile(id: string): Promise<ArtifactFile | null> {
  const [row] = (await db()`
    select id, submitter, email, description, filename, content_type, byte_size,
           storage_key, status, created_at
    from artifact_files
    where id = ${id}::uuid
  `) as ArtifactFile[];
  return row ?? null;
}

/** Human-readable size for the admin list. */
export function formatBytes(n: number | null): string {
  if (!n) return "unknown size";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

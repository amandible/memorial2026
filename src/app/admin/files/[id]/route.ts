import { isAdmin } from "@/lib/admin-auth";
import { getArtifactFile, safeFilename } from "@/lib/artifact-files";
import { getObject } from "@/lib/r2";

/**
 * Download one archived file. Admin only.
 *
 * The single place stranger-supplied bytes are ever handed to a browser from
 * this origin, so the headers do the work:
 *
 *   - application/octet-stream, never the type the uploader claimed. An .html or
 *     .svg served as its own type would run as script on billmelanson.org and read
 *     the admin session cookie. As a binary blob it cannot.
 *   - Content-Disposition: attachment, so it is saved rather than rendered.
 *   - nosniff, because without it a browser may guess a type from the bytes and
 *     undo both of the above.
 *   - A sandboxed CSP as a third line of defence if something is opened anyway.
 *
 * Nothing here is cached: it is private, and one stale copy is one too many.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  // Anything that isn't a uuid would make the query throw; treat it as missing.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await getArtifactFile(id);
  if (!row) return new Response("Not found", { status: 404 });

  let bytes: ArrayBuffer | null;
  try {
    bytes = await getObject(row.storage_key);
  } catch (e) {
    console.error("Failed to read artifact file from R2:", row.storage_key, e);
    return new Response("The archive couldn't be reached.", { status: 502 });
  }
  if (!bytes) return new Response("That file is no longer in the archive.", { status: 404 });

  // Only ASCII in the quoted form — a filename with an accent or a quote in it
  // would otherwise produce a malformed header. filename* carries the real one.
  const ascii = safeFilename(row.filename);

  return new Response(bytes, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}

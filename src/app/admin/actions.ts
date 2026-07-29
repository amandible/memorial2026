"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { deleteImage } from "@/lib/cf-images";
import { archivePhotoQuietly } from "@/lib/archive";
import { deleteObject } from "@/lib/r2";
import { checkPassword, grantSession, revokeSession, isAdmin } from "@/lib/admin-auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = (formData.get("password") as string | null) ?? "";
  if (!checkPassword(password)) {
    // Deliberately vague: no hint about whether the password store is even set up.
    return { error: "That password isn't right." };
  }
  await grantSession();
  revalidatePath("/admin");
  return {};
}

export async function logout(): Promise<void> {
  await revokeSession();
  revalidatePath("/admin");
}

/**
 * Hide or restore a guestbook entry.
 *
 * Sets status rather than deleting: a removal made in haste, or a mistaken one,
 * should be reversible. Purging is a deliberate act done in the database.
 */
export async function setEntryStatus(id: string, status: "published" | "removed"): Promise<void> {
  // Every action re-checks. The page-level gate is not the security boundary —
  // server actions are callable directly by anyone who knows the endpoint.
  if (!(await isAdmin())) throw new Error("Not authorised.");

  await db()`update guestbook_entries set status = ${status} where id = ${id}::uuid`;
  revalidatePath("/admin");
  revalidatePath("/guestbook");
}

/**
 * Approve or reject a photo.
 *
 * Rejecting sets status and leaves the row and the image alone, so it can be
 * reconsidered. Purging is separate and deliberate.
 */
export async function setPhotoStatus(
  id: string,
  status: "pending" | "approved" | "rejected",
): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  await db()`
    update photos set status = ${status}, reviewed_at = now() where id = ${id}::uuid
  `;

  // Approving is the point at which the site commits to keeping a photograph, so
  // that is when it gets copied out of Cloudflare into R2.
  //
  // Deliberately awaited rather than deferred with after(). The first version
  // used after() so the click wouldn't wait on the copy — and the archive then
  // silently never happened in production, with no way to tell whether the
  // callback had run and failed or simply never run. For a backup of
  // irreplaceable photographs, "probably ran" is not good enough: an extra
  // second on a button an admin presses a few times a week buys certainty.
  //
  // Still never throws. A failed copy leaves archived_at null for
  // `npm run archive` to find, and must not stop the photo being approved.
  if (status === "approved") {
    await archivePhotoQuietly(id);
  }

  revalidatePath("/admin");
  revalidatePath("/photos");
}

/** Delete a rejected photo for good, removing it from Cloudflare Images too. */
export async function purgePhoto(id: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const [row] = (await db()`
    select storage_ref, archive_key from photos where id = ${id}::uuid and status = 'rejected'
  `) as { storage_ref: string; archive_key: string | null }[];
  // Only rejected photos can be purged, so an approved one can't go by mistake.
  if (!row) throw new Error("Only a rejected photo can be deleted.");

  await deleteImage(row.storage_ref);
  // "Delete for good" has to mean the archive too, or a purge would leave a
  // copy behind in R2 that nobody knows about.
  if (row.archive_key) await deleteObject(row.archive_key);
  await db()`delete from photos where id = ${id}::uuid`;
  revalidatePath("/admin");
}

export async function exportContactsCsv(): Promise<string> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const rows = (await db()`
    select email, name, note, created_at, removed_at
    from contacts
    where removed_at is null
    order by created_at
  `) as { email: string; name: string | null; note: string | null; created_at: Date }[];

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return [
    "email,name,note,created_at",
    ...rows.map((r) => [r.email, r.name, r.note, r.created_at.toISOString()].map(esc).join(",")),
  ].join("\n");
}

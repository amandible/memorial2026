import { db } from "./db";

export type Photo = {
  id: string;
  storage_ref: string;
  caption: string | null;
  submitter: string | null;
  created_at: Date;
  taken_year: number | null;
};

export type PendingPhoto = Photo & { email: string | null; status: string };

/**
 * Approved photos, in gallery order.
 *
 * Curated ones carry a sort_order and lead; submissions follow, newest first.
 * Oldest-first buried every new arrival at the bottom of the page, where the
 * person who had just sent it would never see it — the opposite of what you
 * want while photographs are still coming in before the service.
 *
 * Chronological by taken_year is the better arrangement once enough of those
 * are confirmed; see PLAN.md.
 *
 * Selects only what the public page renders — never email.
 */
export async function getApprovedPhotos(): Promise<Photo[]> {
  return (await db()`
    select id, storage_ref, caption, submitter, created_at, taken_year
    from photos
    where status = 'approved'
    order by sort_order nulls last, created_at desc
  `) as Photo[];
}

/** Everything awaiting review, oldest first so nothing sits forgotten. */
export async function getPendingPhotos(): Promise<PendingPhoto[]> {
  return (await db()`
    select id, storage_ref, caption, submitter, email, status, created_at
    from photos
    where status = 'pending'
    order by created_at
  `) as PendingPhoto[];
}

export async function countPhotosByStatus(): Promise<Record<string, number>> {
  const rows = (await db()`
    select status, count(*)::int as n from photos group by status
  `) as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

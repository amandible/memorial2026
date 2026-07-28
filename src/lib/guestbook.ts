import { db } from "./db";

export type Entry = {
  id: string;
  name: string;
  message: string;
  created_at: Date;
};

export const PAGE_SIZE = 50;

/**
 * Published entries, newest first.
 *
 * Selects only the columns the public page renders. `email` and `ip_hash` are
 * never read here, so they cannot leak into a page by accident.
 */
export async function getPublishedEntries(
  page = 0,
): Promise<{ entries: Entry[]; hasOlder: boolean }> {
  // Fetch one extra to detect a further page without a second count query.
  const rows = (await db()`
    select id, name, message, created_at
    from guestbook_entries
    where status = 'published'
    order by created_at desc
    limit ${PAGE_SIZE + 1}
    offset ${page * PAGE_SIZE}
  `) as Entry[];

  return { entries: rows.slice(0, PAGE_SIZE), hasOlder: rows.length > PAGE_SIZE };
}

/** How many entries came from this IP in the last hour. Rate limiting. */
export async function recentCountForIp(ipHash: string | null): Promise<number> {
  if (!ipHash) return 0;
  const [row] = (await db()`
    select count(*)::int as n
    from guestbook_entries
    where ip_hash = ${ipHash}
      and created_at > now() - interval '1 hour'
  `) as { n: number }[];
  return row?.n ?? 0;
}

/** Long-form dates: this is read by people, not scanned for data. */
export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

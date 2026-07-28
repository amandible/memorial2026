import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/guestbook";
import { isAdmin } from "@/lib/admin-auth";
import { logout } from "./actions";
import LoginForm from "./login-form";
import EntryActions from "./entry-actions";

export const metadata: Metadata = {
  title: "Admin",
  // Not linked from anywhere, but say so explicitly too.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  message: string;
  email: string | null;
  status: "published" | "removed";
  created_at: Date;
};

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="page" id="main">
        <h1 className="page-title">Admin</h1>
        <hr className="rule" />
        <LoginForm />
      </main>
    );
  }

  const entries = (await db()`
    select id, name, message, email, status, created_at
    from guestbook_entries
    order by created_at desc
    limit 100
  `) as Row[];

  const [counts] = (await db()`
    select
      (select count(*)::int from contacts where removed_at is null) as contacts,
      (select count(*)::int from guestbook_entries where status = 'published') as published,
      (select count(*)::int from guestbook_entries where status = 'removed') as removed
  `) as { contacts: number; published: number; removed: number }[];

  return (
    <main className="page page-wide" id="main">
      <div className="admin-head">
        <h1 className="page-title">Admin</h1>
        <form action={logout}>
          <button type="submit" className="btn-quiet">
            Sign out
          </button>
        </form>
      </div>
      <hr className="rule" />

      <dl className="stats">
        <div>
          <dt>Published</dt>
          <dd>{counts.published}</dd>
        </div>
        <div>
          <dt>Hidden</dt>
          <dd>{counts.removed}</dd>
        </div>
        <div>
          <dt>Email list</dt>
          <dd>{counts.contacts}</dd>
        </div>
      </dl>

      <h2>Guestbook</h2>
      {entries.length === 0 ? (
        <p className="muted-note">No entries yet.</p>
      ) : (
        <div className="entries">
          {entries.map((e) => (
            <article key={e.id} className={e.status === "removed" ? "entry is-removed" : "entry"}>
              <header className="entry-head">
                <span className="entry-name">
                  {e.name}
                  {e.status === "removed" && <span className="tag">hidden</span>}
                </span>
                <span className="entry-date">
                  {formatDate(e.created_at)}
                  {/* Submitter email is admin-only and never rendered publicly. */}
                  {e.email && <> &middot; {e.email}</>}
                </span>
              </header>
              <p className="entry-message">{e.message}</p>
              <EntryActions id={e.id} status={e.status} name={e.name} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

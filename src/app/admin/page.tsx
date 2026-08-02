import type { Metadata } from "next";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/guestbook";
import { isAdmin } from "@/lib/admin-auth";
import { thumbUrl } from "@/lib/cf-images";
import { logout } from "./actions";
import LoginForm from "./login-form";
import EntryActions from "./entry-actions";
import PhotoActions from "./photo-actions";
import CaptionEditor from "./caption-editor";
import YearEditor from "./year-editor";
import KindEditor from "./kind-editor";
import ExportButton from "./export-button";

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
      (select count(*)::int from guestbook_entries where status = 'removed') as removed,
      (select count(*)::int from photos where status = 'pending') as photos_pending,
      (select count(*)::int from photos where status = 'approved') as photos_approved,
      (select count(*)::int from photos
        where status = 'approved' and archived_at is null) as photos_unarchived
  `) as {
    contacts: number;
    published: number;
    removed: number;
    photos_pending: number;
    photos_approved: number;
    photos_unarchived: number;
  }[];

  // Pending first and oldest first, so nothing waits unnoticed.
  const photos = (await db()`
    select id, storage_ref, caption, submitter, email, status, created_at, archived_at,
           taken_year, taken_source, exif_taken_at, kind
    from photos
    order by (status = 'pending') desc, created_at
    limit 200
  `) as {
    id: string;
    storage_ref: string;
    caption: string | null;
    submitter: string | null;
    email: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: Date;
    archived_at: Date | null;
    taken_year: number | null;
    taken_source: string | null;
    exif_taken_at: Date | null;
    kind: string;
  }[];

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
        <div className={counts.photos_pending > 0 ? "stat-attention" : undefined}>
          <dt>Photos waiting</dt>
          <dd>{counts.photos_pending}</dd>
        </div>
        <div>
          <dt>Photos live</dt>
          <dd>{counts.photos_approved}</dd>
        </div>
        {/* An approved photo that isn't backed up is the one failure here that
            would otherwise be invisible. Only shown when it is non-zero. */}
        {counts.photos_unarchived > 0 && (
          <div className="stat-attention">
            <dt>Not backed up</dt>
            <dd>{counts.photos_unarchived}</dd>
          </div>
        )}
      </dl>

      {counts.photos_unarchived > 0 && (
        <p className="form-error">
          {counts.photos_unarchived}{" "}
          {counts.photos_unarchived === 1 ? "photograph is" : "photographs are"} live but not
          yet copied to the archive. Run <code>npm run archive</code> to fix.
        </p>
      )}

      <h2>Mailing list</h2>
      <ExportButton count={counts.contacts} />

      <h2>Photographs</h2>
      {photos.length === 0 ? (
        <p className="muted-note">None submitted yet.</p>
      ) : (
        <div className="mod-grid">
          {photos.map((p) => (
            <figure key={p.id} className={`mod-photo is-${p.status}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(p.storage_ref)} alt={p.caption ?? "Submitted photograph"} loading="lazy" />
              <figcaption>
                <span className={`tag tag-${p.status}`}>{p.status}</span>
                {p.status === "approved" && !p.archived_at && (
                  <span className="tag tag-pending">not backed up</span>
                )}
                <CaptionEditor id={p.id} caption={p.caption} />
                <KindEditor id={p.id} kind={p.kind} />
                <YearEditor
                  id={p.id}
                  year={p.taken_year}
                  source={p.taken_source}
                  exifTakenAt={p.exif_taken_at}
                />
                <span className="mod-meta">
                  {p.submitter ?? "anonymous"}
                  {p.email && <> &middot; {p.email}</>}
                </span>
              </figcaption>
              <PhotoActions id={p.id} status={p.status} />
            </figure>
          ))}
        </div>
      )}

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

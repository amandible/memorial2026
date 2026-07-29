-- Where the original of an approved photo has been archived in R2.
--
-- Cloudflare Images is currently the only copy of every submitted photograph.
-- Unlike the written content, which lives in git, these are irreplaceable — the
-- people who sent them will not think of themselves as the backup.
--
-- Null means "not archived yet", which is what `npm run archive` looks for.
alter table photos add column if not exists archive_key text;
alter table photos add column if not exists archived_at timestamptz;

-- The backfill scans for approved-but-unarchived, so make that cheap.
create index if not exists photos_needing_archive
  on photos (created_at)
  where status = 'approved' and archived_at is null;

-- Replace the two-way photo/artifact split with three photo categories:
-- Friends & Family, Camping, Gigs. Same underlying mechanism (a column on
-- `photos`, per 005_artifacts.sql's reasoning) — just more values.
--
-- Nothing has been submitted to the live site yet, so the value mapping below
-- (photo -> friends-family, artifact -> gigs) exists only so this migration is
-- safe to run against a database that already has rows, not because either
-- mapping is meaningful. Reclassify by hand on the admin page if it matters.
update photos set kind = 'friends-family' where kind = 'photo';
update photos set kind = 'gigs' where kind = 'artifact';

alter table photos alter column kind set default 'friends-family';
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('friends-family', 'camping', 'gigs'));

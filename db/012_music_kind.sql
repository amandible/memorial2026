-- Add a fifth photo gallery: Music. Missed in 011_music.sql, which added the
-- media_key/media_filename columns and the content-type check constraint but
-- not this one — the kind check constraint is separate and was still only
-- allowing the four kinds from 009_setlists.sql.
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('friends-family', 'camping', 'gigs', 'setlists', 'music'));

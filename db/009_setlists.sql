-- Add a fourth photo gallery: Setlists.
alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('friends-family', 'camping', 'gigs', 'setlists'));

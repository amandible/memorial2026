-- Fold Setlists into Music, same reasoning as folding Gigs into Music
-- (013_merge_gigs_into_music.sql): setlists are just another thing that
-- belongs under "photos and recordings of Bill playing," and a separate
-- section for them was more division than the content needs.
update photos set kind = 'music' where kind = 'setlists';

alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('friends-family', 'camping', 'music'));

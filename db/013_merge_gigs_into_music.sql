-- Fold Gigs into Music: since a recording can already be added to any
-- section, a separate Gigs section (photos of him performing) and a
-- separate Music section (recordings) were redundant. Music now covers
-- both — photos of him playing and recordings of him playing — and Gigs
-- goes away.
update photos set kind = 'music' where kind = 'gigs';

alter table photos drop constraint if exists photos_kind_check;
alter table photos add constraint photos_kind_check
  check (kind in ('friends-family', 'camping', 'setlists', 'music'));

-- A photos row can now be typed text instead of an image — a setlist, a
-- verse of lyrics, a written memory. storage_ref becomes optional and
-- body_text holds the content; caption keeps its existing meaning (a short
-- title) for both kinds of row.
alter table photos alter column storage_ref drop not null;
alter table photos add column if not exists body_text text;

alter table photos drop constraint if exists photos_image_or_text_check;
alter table photos add constraint photos_image_or_text_check
  check (storage_ref is not null or body_text is not null);

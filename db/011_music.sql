-- Music: recordings of Bill playing, as a third content type on `photos`
-- (alongside the image and typed-text kinds Part 3 added), and a fifth
-- gallery kind alongside Friends & Family / Camping / Gigs / Setlists.
--
-- media_key is the object key in the public music R2 bucket — a different
-- bucket from the private photo archive, so this app's other tables and
-- code keep meaning "nothing public ever reads from there" literally.
-- media_filename is the original name, kept to tell audio from video by
-- extension and as the suggested filename on the download link.
alter table photos add column if not exists media_key text unique;
alter table photos add column if not exists media_filename text;

-- Tightened from Part 3's "at least one" to "exactly one" now that there
-- are three content types to keep unambiguous.
alter table photos drop constraint if exists photos_image_or_text_check;
alter table photos drop constraint if exists photos_content_check;
alter table photos add constraint photos_content_check
  check (
    (storage_ref is not null)::int +
    (body_text  is not null)::int +
    (media_key  is not null)::int = 1
  );

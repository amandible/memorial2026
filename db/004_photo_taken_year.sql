-- When a photograph was taken, as distinct from when it was submitted.
--
-- Three columns because the value has three possible provenances and they are
-- not equally trustworthy:
--
--   submitter — typed in by the person sending it. Most reliable for old
--               photographs: someone sending a scan of a 1975 commune picture
--               knows it is 1975, and no amount of metadata will.
--   exif      — read from the file. Right for anything shot on a phone or
--               camera and sent directly; confidently wrong for a phone
--               photograph *of* an old print, which is exactly the case a
--               memorial attracts.
--   admin     — corrected by hand, and always wins.
alter table photos add column if not exists taken_year int
  check (taken_year is null or (taken_year between 1900 and 2100));
alter table photos add column if not exists taken_source text
  check (taken_source is null or taken_source in ('submitter', 'exif', 'admin'));

-- The raw EXIF timestamp, kept even when it is not the displayed value, so the
-- admin page can show what the file claimed alongside what is being shown.
alter table photos add column if not exists exif_taken_at timestamptz;

-- Pixel dimensions of the original, so the admin page can show them.
--
-- Two things this is for: seeing at a glance that a photograph uploaded whole
-- rather than as some truncated fragment, and spotting the ones too small to
-- survive being printed or projected at the service.
--
-- Not derivable from anything we already store. Cloudflare's Images API returns
-- filename, upload time and variant URLs, but no dimensions, and every delivery
-- variant is resized — measuring one tells you about the variant, not about what
-- the sender actually sent.
alter table photos add column if not exists width int
  check (width is null or width > 0);
alter table photos add column if not exists height int
  check (height is null or height > 0);

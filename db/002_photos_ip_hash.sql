-- Rate limiting for photo submissions needs the same salted IP hash the
-- guestbook uses. The original schema (001) omitted it from photos.
alter table photos add column if not exists ip_hash text;

-- Supports the "how many from this IP in the last hour" check.
create index if not exists photos_ip_recent on photos (ip_hash, created_at);

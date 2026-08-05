-- Failed upload attempts, as reported by the browser they failed in.
--
-- Every problem this form has had happened on someone else's machine: a widget
-- that never rendered, an extension blocking Cloudflare, a browser Turnstile
-- doesn't support. None of that reaches our server, so none of it is in any log
-- we own. Vercel's free tier keeps runtime logs for one hour, so even the server
-- half is gone before anyone gets round to reporting it.
--
-- Diagnostics only. Nothing reads this except the admin page, and it holds no
-- personal data — no name, no email, no filenames, and the IP is hashed with the
-- same salt as everywhere else.
create table if not exists upload_trouble (
  id         uuid primary key default gen_random_uuid(),
  stage      text not null,        -- verify | tickets | upload | record
  detail     text,                 -- e.g. "turnstile:unsupported", "turnstile:errored:300030"
  files      int,                  -- how many they were trying to send
  user_agent text,
  ip_hash    text,
  created_at timestamptz not null default now()
);

create index if not exists upload_trouble_recent on upload_trouble (created_at desc);

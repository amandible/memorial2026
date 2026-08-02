# Claude guidance for joeweisman.org

@AGENTS.md

## Project context

A memorial site for Joe Weisman (1944–2026), built by his child Jazz. Next.js 16
(App Router, TypeScript) on Vercel, deploying from `main`. Obituary and service
details render from Markdown in `content/`; a photo gallery with public submissions,
a guestbook, and email collection are live (see `README.md` "The services" for what's
deployed where).

Treat the subject with care. The people reading this site are grieving, and much
of the content is about a real person recently dead. Plainness beats cleverness in
both the design and the copy.

`PLAN.md` is the design document — what was chosen, what was rejected, and why.
Read it before any structural change. `README.md` covers running and deploying.
`AGENTS.md` holds the technical invariants and the reason behind each.

## Environment

Node 22 via fnm. Not Node 24 — it needs macOS 13.5+ and this machine is on macOS 12.

```bash
export PATH="$HOME/.local/bin:$PATH"
eval "$(fnm env --shell bash)"
fnm use 22
```

`npm run dev -- -p 3117`. Port 3117, not 3000 — Grafana usually holds 3000 on this
machine. Never kill a process by name to free a port; find another port.

## Commands

| Command | What it does |
|---|---|
| `npm run dev -- -p 3117` | Dev server on port 3117 (see Environment above) |
| `npm run build` | Production build — run before pushing anything structural |
| `npm start` | Serve the production build locally |
| `npm run lint` | ESLint (`eslint-config-next` core-web-vitals + typescript) |
| `npm test` | Runs `tests/*.test.mts` on Node's built-in test runner, no test framework dependency |
| `npm run migrate` | Applies any unapplied numbered `.sql` file in `db/` against Neon |
| `npm run archive` | Copies any approved photo not yet backed up to R2 |
| `npm run archive -- --pull` | Downloads the whole R2 photo archive to `media/archive/` (gitignored) |

Single test file: `node --experimental-strip-types --test tests/turnstile.test.mts`.

Run `npm test` before pushing anything touching `src/lib/` — the tests cover the
parts where a mistake is expensive and silent (a rejected Turnstile token being
refused even under the lenient outage policy, an unset `ADMIN_PASSWORD` locking
everyone out, a failing notification never throwing).

## Architecture

**Content vs. app code.** `content/*.md` (obituary, service) is read from the
filesystem and rendered by `src/lib/content.ts` via `marked` — this is the *only*
place `dangerouslySetInnerHTML` is used, because it's our own trusted Markdown.
`content/recipes/` is the opposite case: Joe's original files, rendered byte-for-byte
via `src/lib/recipes.ts`, never reformatted (see the README in that directory).
Unfilled `XXXX` placeholders in content are surfaced as build-log warnings by
`content.ts`, not build failures.

**Feature module shape.** Each public form (`guestbook/`, `photos/`, `subscribe/`)
follows the same three-file pattern: `page.tsx` (server component) + `form.tsx`
(client component, Turnstile widget + `useActionState`) + `actions.ts` (`"use
server"`, validates input, calls a query function in `src/lib/{feature}.ts`, then
`revalidatePath` and an `after()`-deferred admin email via `notify.ts`). Follow this
shape for any new visitor-facing form rather than inventing a new one.

**Data layer.** Neon Postgres, reached only through `src/lib/db.ts` (a lazy pooled
client) — the browser never touches the database directly. Schema changes are
numbered files in `db/` (`001_init.sql`, …), applied idempotently by
`scripts/migrate.mjs` via `npm run migrate`; there's no ORM. Per `PLAN.md` §3 M6,
the DB is temporary — the site freezes to static in year two — so keep the schema
flat and avoid features that assume Postgres is permanent.

**Photos pipeline is two storage systems with distinct jobs**, per `PLAN.md` §5:
R2 (`src/lib/r2.ts`, `scripts/archive.mjs`) holds every original permanently as the
private archive; Cloudflare Images (`src/lib/cf-images.ts`) is the serving layer,
populated only on admin approval, and handles HEIC transcode/thumbnails/delivery.
Visitor photos are never routed through `next/image` — see the `sharp`/libvips note
in `AGENTS.md` §12 — `next/image` is reserved for curated assets (`public/`).

**Artifacts are photographs with a `kind`, not a second entity.** `photos.kind`
is `'photo' | 'artifact'`; `/photos` and `/artifacts` are the same `Gallery`
component over `getApprovedPhotos(kind)`, which takes the kind explicitly so a
third gallery can't silently start dropping rows out of an existing one. The
section's display name lives in `ARTIFACTS_LABEL` (`src/lib/sections.ts`) because
it may change; the `/artifacts` URL deliberately doesn't derive from it, since
that URL ends up in email and print.

**Submissions that aren't photographs go to `artifact_files`, never to
`photos`.** They have no Cloudflare Images id and no viewable derivative, so
putting them in `photos` would mean every gallery query and the archive job had
to learn to skip them — and the first one that slipped through would have a
gallery rendering an audio file as an `<img>`. They upload straight to R2 via a
presigned PUT (`presignPut` in `r2.ts`), because a server action on Vercel caps
its body near 1 MB. **Nothing in that table is ever served publicly and no route
should ever serve it** — a stranger-supplied `.html` or `.svg` on our own origin
is stored XSS, and extension filtering doesn't fix that; not serving them does.
The single exception is `/admin/files/[id]`, which is admin-gated and forces
`application/octet-stream` + `Content-Disposition: attachment` + `nosniff`
rather than trusting the uploader's claimed type. **This requires a CORS policy
on the R2 bucket** (`PUT` from the site origins) — without it the browser's
preflight fails and uploads report a connection error; see `README.md`.

**Admin auth is split across two files on purpose.** `src/lib/admin-password.ts`
holds the password/token crypto with no `next/*` imports, so it's unit-testable
outside the framework; `src/lib/admin-auth.ts` layers the cookie session on top and
imports `next/headers`. `src/app/admin` itself is unlinked, `noindex`, single
shared password — moderates guestbook entries (hide/restore) and photos
(approve/reject/delete), and exports the contacts CSV.

**Turnstile verification (`src/lib/turnstile.ts`) takes an explicit
`OutagePolicy`** (`"deny" | "allow"`) per call site — a `success: false` from
Cloudflare is always refused, but what happens when Cloudflare itself is
unreachable is a per-form judgment call. Guestbook denies on outage (entries
publish immediately to a public page); forms writing only to private data may
allow. Match this pattern for any new form rather than hardcoding one behavior.

**On the client, never probe Turnstile's DOM — check for `window.turnstile`.**
The widget renders into a *shadow root*, so `querySelector("iframe")` on its
container finds nothing no matter how well it is working. A poll written that way
tells every visitor the form is broken while the widget above it reads "Success!"
— which is exactly what happened, and it looks like an intermittent bug because
the message only appears once the timeout elapses. The only thing that status text
is really about is whether an extension blocked `challenges.cloudflare.com`, and
the missing global is precisely what that looks like. Related: the submit path in
`src/app/photos/form.tsx` always calls `waitForToken()` and never refuses to try
based on that status — the status picks the wording, it does not gate submission.
A token expires after 300s and this form takes longer than that to fill in, so
"looks unready" and "will fail" are different claims.

**A Turnstile token can only be validated once** — a replay comes back
`timeout-or-duplicate`. This is why `requestUploads` takes both the photo count
and the list of other files in a single call and issues Cloudflare Images
tickets and presigned R2 URLs together: two `verifyTurnstile` calls would need
two solved challenges, the second landing halfway through a submission that had
already started uploading. If a third kind of upload is ever added, widen that
one call rather than adding a second verification. The follow-up actions
(`recordPhotos`, `recordArtifactFiles`) don't verify at all — they authenticate
with the HMAC upload handle from `src/lib/upload-handle.ts`, which is what
carries the original verification across to the recording step.

**`/api/health`** is the UptimeRobot target — it returns 503 only for a real
visitor-facing outage (DB unreachable, or `TURNSTILE_SECRET` missing in prod).
Optional services being merely unconfigured report as `degraded` in the body
without tripping the alert; don't make this endpoint call out to Cloudflare Images
or Resend, since a periodic health check would burn their quota.

**Styling is one file, no build tooling.** All CSS lives in `src/app/tokens.css` —
no Tailwind, no CSS-in-JS (`AGENTS.md`). Fonts are committed `.woff2` files loaded
via `next/font/local` in `src/app/fonts.ts`, never `next/font/google` (that fetches
at build time, a year-three failure mode `PLAN.md` §11 explains).

## Git commits

- **Before editing anything, confirm you are level with `origin/main`.** More than
  one person works on this repo. Run `git fetch && git status` and read the
  "behind by N commits" line — `git fetch` alone updates the remote-tracking ref
  and leaves your working copy where it was, so it is possible to `--all` your way
  to a correct answer about the remote while patching stale files. That happened:
  six of Luke's commits landed between a pull and the next fetch, and edits were
  written against his older versions of files he had since rewritten.
- **Do not include Claude attribution in commit messages.** No `Co-Authored-By`,
  no "Generated with" footer.
- **Never `git add -A` or `git add .`** — stage explicit paths, or `git add -u`.
- **Never force push** (`git push -f` / `--force`).
- **Never `git commit --amend`** — make a new commit.
- **Never `--no-verify`** — fix what the hook is complaining about.
- Always check `git status` before committing.
- Style: short subject line, blank line, body in bullet points explaining the *why*.
- `main` is published. See the warning at the top of `README.md` before pushing.

## Code editing

- **Never use sed, awk, or other command-line tools to edit files** — use the Edit tool.

## System access

- **Never run sudo commands directly** — ask Jazz to run them.

## Shell commands

- **Never use `sleep`** — poll for the actual condition instead.

## Comments

- Comments describe the current state only — never reference what the code used to do.

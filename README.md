# joeweisman.org

A memorial site for Joe Weisman (December 16, 1944 – July 10, 2026).

Obituary, service details, a photo gallery with public submissions, a guestbook,
seventy-one of his own recipes, and a way to collect email addresses. Built to be
cheap, boring, and durable — it should still be standing in ten years with nobody
tending it.

`PLAN.md` is the design document: what was chosen, what was rejected, and why.
Read it before making a structural change. This file is how to run and deploy the thing.

---

## ⚠️ Pushing to `main` publishes the site

There is no separate deploy step and no staging gate.

```
git push origin main   →   Vercel builds   →   live on joeweisman.org  (~1 min)
```

**If you are not ready for the world to see it, work on a branch.** Every branch and
pull request gets its own private preview URL, which is the right way to show a draft
to family before it goes live:

```bash
git checkout -b service-details
# ...edit...
git commit -am "Add service time and address"
git push -u origin service-details        # Vercel comments with a preview URL
```

Merging that branch to `main` is what makes it public.

**If a build fails, nothing changes** — the current site stays up and you get an email.
**To undo a bad deploy**, open the Vercel dashboard → Deployments → pick the previous
one → *Promote to Production*. It takes seconds; you don't need to revert the commit first.

---

## Running it locally

Node 22 via [fnm](https://github.com/Schniz/fnm). Node 24 is not used — it requires
macOS 13.5+, and this was set up on macOS 12.

If `node` isn't on your PATH, add this to `~/.bash_profile`:

```bash
export PATH="$HOME/.local/bin:$PATH"
eval "$(fnm env --use-on-cd --shell bash)"
```

Then:

```bash
npm install
npm run dev -- -p 3117      # http://localhost:3117
```

Port 3117 rather than the default 3000, because Grafana is usually on 3000 on the
development machine. Any free port works.

| Command | What it does |
|---|---|
| `npm run dev` | Development server, hot reload |
| `npm run build` | Production build — run this before pushing anything structural |
| `npm start` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Unit tests — Node's built-in runner, no dependencies |
| `npm run migrate` | Apply any unapplied `.sql` file in `db/` |

The tests cover the parts where a mistake is expensive and silent: that a rejected
Turnstile token is refused even under the lenient outage policy, that an unset
`ADMIN_PASSWORD` lets nobody in, and that a failing notification never throws. Run them
before pushing anything touching `src/lib/`.

---

## Editing the words

Content lives in Markdown, separate from the code, so changing it doesn't mean touching
React:

| File | Appears at |
|---|---|
| `content/obituary.md` | The home page |
| `content/service.md` | `/service` — while empty, that page shows a placeholder instead. Its `title:` frontmatter is the page heading. |
| `content/recipes/` | `/recipes` — Joe's own text files. See the README in that directory before touching them. |

Plain Markdown: blank line between paragraphs, `*italic*`, `## subheading`. Edit, commit,
push. That's the whole workflow.

The recipes are **not** Markdown and must not be reformatted — they are the original
files off his machine, rendered exactly as typed.

**Unfilled placeholders.** Anything like `XXXX` shows in amber during development and
prints a warning in the build log:

```
⚠  content/obituary.md still contains unfilled placeholders: XXXX
   These WILL appear on the live site.
```

It is a warning, not an error — it will not stop a deploy. Watch for it.

---

## What's where

```
content/
  obituary.md · service.md    The written pages
  recipes/                    Joe's original recipe files + _titles.json
db/                           Numbered .sql migrations, applied by npm run migrate
scripts/migrate.mjs           The migration runner
tests/                        Unit tests (npm test)
src/app/
  layout.tsx                  Shell, fonts, metadata, Open Graph
  nav.tsx                     Site header (client component — needs the current path)
  page.tsx                    Home: portrait, name, dates, obituary
  not-found.tsx               Styled 404
  tokens.css                  The entire design system
  fonts.ts · fonts/           Source Serif 4, EB Garamond, IBM Plex Mono
  icon.png · apple-icon.png   Favicons
  service/ recipes/           Content pages
  guestbook/ photos/ subscribe/   Forms — page + form.tsx + actions.ts each
  admin/                      Password-gated moderation
src/lib/
  content.ts recipes.ts       Read and render the written content
  db.ts                       Lazy Neon client (pooled connection)
  guestbook.ts photos.ts      Queries
  turnstile.ts                Bot verification, with the outage policy
  cf-images.ts                Direct uploads and delivery URLs
  notify.ts                   Admin emails via Resend
  admin-password.ts           Password + token crypto (no Next imports, so testable)
  admin-auth.ts               Cookie session on top of it
  ip.ts sections.ts
public/                       Only what ships: portrait-hero.jpg, og.jpg
media/                        Working files. GITIGNORED, never deployed.
```

Choices worth knowing before you fight them:

- **No Tailwind.** The design is typography-driven and lives in `tokens.css`. One less
  build dependency, and it survives the eventual freeze to static (`PLAN.md` §3, M6).
- **Fonts are committed as files**, not fetched by `next/font/google`. That loader
  downloads from Google at *build* time, so a rebuild in year three can fail if the API
  changes. `PLAN.md` §11.
- **Visitor photos are served straight from Cloudflare Images, never through
  `next/image`.** Next's optimizer runs `sharp`, and these files come from strangers.
  This is a security boundary, not a preference. `PLAN.md` §12.
- **Visitor text is never rendered as HTML.** `dangerouslySetInnerHTML` is only ever used
  for our own Markdown in `content/`.
- **`admin-password.ts` is separate from `admin-auth.ts`** because the latter imports
  `next/headers` and so can't be tested outside the framework.

---

## The services

| What | Where | Status |
|---|---|---|
| Domain | Cloudflare Registrar | Live. 10 years, auto-renew on |
| DNS | Cloudflare | Live. Records are **grey cloud** — see below |
| Hosting | Vercel | Live, free tier, auto-deploys from GitHub |
| Database | Neon (Postgres 18, `us-east-1`) | Live, free tier |
| Photo serving | Cloudflare Images | Live. **Starter Bundle, $5/mo** — see `PLAN.md` §2 |
| Bot defence | Cloudflare Turnstile | Live on all three forms |
| `contact@` | Cloudflare Email Routing | Live, forwards to the memorial Gmail |
| Admin notifications | Resend | Live, from `notifications.joeweisman.org` |
| Photo archive | Cloudflare R2 | **Not set up.** Originals live only in Cloudflare Images |
| Uptime alerts | UptimeRobot | **Not set up — do not skip this** |

Running cost is about **$5/month plus the domain**: everything is on a free tier except
Cloudflare Images.

> **Resend must never verify `joeweisman.org` itself.** Cloudflare Email Routing owns the
> apex MX records to deliver `contact@`, and Resend's MX would collide with them and break
> inbound mail. Only the `notifications.joeweisman.org` subdomain is verified, which keeps
> the two systems apart.

### How each account is logged into

Everything is under `joeweismanmemorial@gmail.com` rather than a personal address —
except the GitHub repo, which is on Jazz's personal account deliberately (the repo isn't
load-bearing for uptime; losing it means you can't *change* the site, not that it goes down).

| Account | Sign-in method |
|---|---|
| Cloudflare | Its own account — email + password, using the memorial Gmail |
| Vercel | **Google OAuth** via the memorial Gmail |
| Neon | **Google OAuth** via the memorial Gmail |
| GitHub | Jazz's personal account (`jazzlw`) |

> **⚠️ The Gmail is a single point of failure for Vercel and Neon.** Because both use
> Google sign-in, losing access to `joeweismanmemorial@gmail.com` means losing the host
> and the database with no separate password to fall back on. Cloudflare is safer here —
> it has its own credentials, so it survives independently.
>
> Mitigate: put a recovery phone and a recovery email on the Google account, save the
> 2FA backup codes somewhere a family member can reach, and make sure at least one other
> person can get into that Gmail. Do this before the site is something anyone relies on.

Secrets live in Vercel's environment variables, never in the repo. `.env.example` lists
what's needed; copy it to `.env.local` for development.

> **⚠️ Adding an environment variable in Vercel does nothing until you redeploy.**
> Values are injected into a deployment when it is built, so the running one keeps
> whatever it was built with. There is no error — the code simply behaves as though
> the variable is unset, which for this project means `/admin` refuses everyone,
> Turnstile refuses every submission, and IP hashing silently stops.
>
> After adding or changing any variable: **Deployments → latest → ⋯ → Redeploy.**
> This already cost one debugging round with `ADMIN_PASSWORD`.

Two variables are needed for the guestbook and admin, neither of which can be
recovered if lost:

| Variable | Notes |
|---|---|
| `ADMIN_PASSWORD` | The only way into `/admin`. The session cookie is derived from it, so changing it signs everyone out. |
| `IP_HASH_SALT` | Changing it orphans every existing hash and resets rate limiting. Set once. |

---

## Moderating the site

Everything happens at **`/admin`** — not linked from anywhere, `noindex`, one password.

**You get an email when something arrives.** A guestbook entry includes the full message,
so you can decide from your inbox whether it needs removing. Photos send one email per
submission, however many pictures it contained.

| | |
|---|---|
| **Guestbook** | Entries publish **immediately**. That is deliberate — a tribute that vanishes on submit reads as broken to the person who wrote it. *Hide* removes it from the public page; the row survives and *Restore* brings it back. |
| **Photos** | Held as `pending` and invisible until you *Approve*. *Reject* hides it reversibly. *Delete for good* appears only on already-rejected photos and also removes the file from Cloudflare — the one irreversible action here. |
| **Email list** | The count is on the dashboard. Export and send by hand from Gmail, BCC (see below). |

Rate limits, if someone reports being blocked: five guestbook entries and forty photos per
IP per hour.

---

## Sending an update to the list

There is no broadcast system, on purpose (`PLAN.md` §6). Export the addresses, then send
from `joeweismanmemorial@gmail.com` with everyone in **BCC** — never CC, which would leak
every mourner's address to every other mourner.

Fine up to about 200 recipients. Past ~300, split it across days or move to Buttondown;
the CSV makes that migration trivial, which is the main reason the addresses live in our
own table rather than someone's form widget.

When someone asks to be removed, set `removed_at` on their row. Honour it.

---

## First-time deployment setup

Done once. Recorded here so it isn't lost.

1. **Create the Vercel project** — import the GitHub repo at vercel.com. Next.js is
   detected automatically; no configuration needed.
2. **Add the domain** — Vercel → Settings → Domains → `joeweisman.org`. Add `www` as
   well and let Vercel redirect between them.
3. **Read the DNS records off the Vercel dashboard.** Do not copy values from a blog
   post — the CNAME target is specific to your project (something like
   `d1d4fc829fe7bc7c.vercel-dns-017.com`), not the old shared `cname.vercel-dns.com`.
4. **Create those records in Cloudflare with the proxy OFF — grey cloud, "DNS only."**

   > This is the step that goes wrong. With the orange cloud on, Cloudflare terminates
   > SSL itself, Vercel can't complete the Let's Encrypt handshake, and the domain sits
   > at "Invalid Configuration" forever. Nothing is lost by turning it off: Vercel's own
   > edge network does the CDN and certificate work.

5. **Wait a few minutes** for the certificate. Because the domain is registered at
   Cloudflare, the nameservers were always Cloudflare's — there's no nameserver
   propagation to wait out, only records.

---

## Things that will break this site, in order of likelihood

1. **A lapsed domain.** Registered for 10 years to make this unlikely. Set a calendar
   reminder for year nine.
2. **A dead credit card** on any of the accounts above.
3. **Nobody noticing it's down.** Hence UptimeRobot — an outage nobody sees for three
   weeks is the real failure mode, not an outage.

Monthly, once there's a database: export it, sync the R2 bucket, and keep both copies
somewhere that isn't one of these vendors. The text needs no backup; it's in git.

# joeweisman.org

A memorial site for Joe Weisman (December 16, 1944 – July 10, 2026).

Obituary, service details, a photo gallery with public submissions, a guestbook,
and a way to collect email addresses. Built to be cheap, boring, and durable —
it should still be standing in ten years with nobody tending it.

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

---

## Editing the words

Content lives in Markdown, separate from the code, so changing it doesn't mean touching
React:

| File | Appears at |
|---|---|
| `content/obituary.md` | The home page |
| `content/service.md` | `/service` — while empty, that page shows a placeholder instead |

Plain Markdown: blank line between paragraphs, `*italic*`, `## subheading`. Edit, commit,
push. That's the whole workflow.

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
content/            Markdown — the actual words
src/app/
  layout.tsx        Shell, fonts, metadata, Open Graph tags
  nav.tsx           Site header (client component — needs the current path)
  page.tsx          Home: portrait, name, dates, obituary
  tokens.css        The entire design system. Colors, type, layout, components.
  fonts.ts          Source Serif 4 + EB Garamond, loaded from committed .woff2
  fonts/            The font files themselves
  service|photos|guestbook|subscribe/    Section pages
src/lib/content.ts  Reads and renders the Markdown
public/             Only what ships — currently just portrait-hero.jpg
media/              Working files. GITIGNORED, never deployed.
  originals/        Untouched source photos, bound for R2 eventually
  gallery/          Staging for gallery photos
```

Two deliberate choices worth knowing before you fight them:

- **No Tailwind.** The design is typography-driven and lives in `tokens.css`. One less
  build dependency, and it survives the eventual freeze to static (see `PLAN.md` §3, M6).
- **Fonts are committed as files**, not fetched by `next/font/google`. That loader
  downloads from Google at *build* time, so a rebuild in year three can fail if the API
  changes. See `PLAN.md` §11.

---

## The services

| What | Where | Notes |
|---|---|---|
| Domain | Cloudflare Registrar | Registered 10 years, auto-renew on |
| DNS | Cloudflare | Records must be **grey cloud** — see below |
| Hosting | Vercel | Free tier, auto-deploys from GitHub |
| Database | Neon (Postgres) | Not wired up yet — Milestone 2 |
| Photo originals | Cloudflare R2 | Not wired up yet |
| Photo serving | Cloudflare Images | Not wired up yet |
| `contact@` | Cloudflare Email Routing | Forwards to the memorial Gmail |
| Admin notifications | Resend | Not wired up yet. Notifications only, not the mailing list |
| Uptime alerts | UptimeRobot | Not set up yet — do not skip this |

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

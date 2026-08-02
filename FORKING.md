# Setting up your own memorial site from this fork

This file is written for you, if you want to make a site like the Joe Weisman memorial site.

This file is designed to help you do this with the assistance of Claude Code. In particular, we wrote this file so you and Claude Code can both read it. Claude Code, after reading this file, can walk you through setting up and customizing your own version of the Joe Weisman site for your own loved one.

The first step is to "fork" the repository, meaning you will copy all the contents that run our site into a new place that will run yours.

Once it is forked, this information will help Claude Code walk you through personalizing
and deploying what you have copied, one step at a time, checking in after each one. It will not do everything silently in one long run so that you can control the process and understand what all the pieces are.



## What you'll end up with

A site with an obituary, a service-details page, a photo gallery with public
submissions and admin moderation, a guestbook, and a mailing-list signup.
`content/recipes/` is optional — skip it if it doesn't apply.

Running cost is about **$5/month plus a domain name** (`README.md` → "The
services" has the exact breakdown). It's built to need no ongoing technical
maintenance.

## If something goes wrong

Just describe the problem to Claude Code. It already has the full context of how this project is built and why, from `CLAUDE.md`, `AGENTS.md`, and`PLAN.md`.

Also, we would love to hear if this worked for you, and what was hard if something was. Please go to our original repository and post issues and requests for help, or email us directly.



## How to get started

If you are the person who forked this: you don't need to read the rest of
this file yourself. Just tell Claude Code:

> Read FORKING.md and walk me through setting this up.



## Instructions to Claude

If you are Claude Code reading this: confirm what the person wants before making changes, and prefer
asking over guessing when something below is ambiguous for their situation.



# Order of operations

1. **Get a GitHub account and fork the joeweisman repository**. Claude, this may involve some explanation to the user about what is happening.

2. **Get a blank version deployed first**, before touching any content. That
   proves the hosting, database, and image pipeline all work before there's
   anything to lose. Follow `README.md` → "First-time deployment setup" and
   "Running it locally" for the account creation and environment variables —
   Vercel, Neon (Postgres), Cloudflare (domain, Turnstile, Images), and
   optionally Resend. `.env.example` lists every variable needed.

3. **Personalize the content.** Everything below is safe to change and has
   no effect on the invariants in `AGENTS.md`:
   - `src/app/layout.tsx` — `SITE_NAME` and `DESCRIPTION` (used in the page
     title and social-share previews).
   - `content/obituary.md` — the home page.
   - `content/service.md` — service details; leave its placeholders
     (`XXXX`) until you have real dates, they only warn, never break a
     build.
   - `public/portrait-hero.jpg` and `public/og.jpg` — the portrait and the
     social-share image (1200×630).
   - `src/app/tokens.css` — colors, if you want a different palette. Check
     contrast in both light and dark mode before committing to one — see the
     note in `AGENTS.md`.
   - `content/recipes/` — remove this section and its nav entry
     (`src/lib/sections.ts`) entirely if it doesn't apply to your person.

4. **Set the two required environment variables** in Vercel (`ADMIN_PASSWORD`,
   `IP_HASH_SALT`) — see `README.md` for what each does and why redeploying
   after setting them matters.

5. **Test the golden path before sharing the link**: submit a guestbook
   entry, upload a photo, approve it from `/admin`, and sign up for the
   mailing list yourself.

## Reference

- `README.md` — running locally, deploying, moderating `/admin`, the full
  list of services and what each costs.
- `PLAN.md` — why each major decision was made, and what was tried and
  rejected instead. Read this before any structural change.
- `AGENTS.md` — the technical invariants this codebase depends on (visitor
  content is never rendered as HTML, no Tailwind, nothing animates, and a
  few others) — worth knowing before changing anything, not just for Claude.


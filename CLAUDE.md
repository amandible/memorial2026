# Claude guidance for joeweisman.org

@AGENTS.md

## Project context

A memorial site for Joe Weisman (1944–2026), built by his child Jazz. Next.js 16
(App Router, TypeScript) on Vercel, deploying from `main`. Obituary and service
details from Markdown in `content/`; a photo gallery with public submissions, a
guestbook, and email collection are still to come.

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

## Git commits

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

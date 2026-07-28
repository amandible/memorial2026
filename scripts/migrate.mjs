/**
 * Apply any .sql file in db/ that hasn't been applied yet.
 *
 * Deliberately not a migration framework — this project has three tables and
 * needs to still be comprehensible to whoever inherits it. Files run in filename
 * order and each is recorded in _migrations so it runs once.
 *
 *   npm run migrate
 *
 * Uses DATABASE_URL_UNPOOLED: DDL through a transaction-mode pooler is
 * unreliable. Falls back to DATABASE_URL if the direct URL isn't set.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local reader — this runs outside Next, so there's no loader.
function loadEnv() {
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* CI and Vercel supply real environment variables */
  }
}
loadEnv();

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL_UNPOOLED or DATABASE_URL. See README.");
  process.exit(1);
}

const sql = neon(url);

/**
 * Split a .sql file into statements.
 *
 * Splitting naively on ';' breaks on semicolons inside `--` comments and inside
 * string literals, which is not hypothetical — the first migration had one in a
 * comment and produced "syntax error at or near ...". This walks the text and
 * only treats ';' as a terminator at the top level.
 *
 * Does not handle dollar-quoted bodies ($$ ... $$). Add that if a migration ever
 * defines a function.
 */
function splitStatements(text) {
  const out = [];
  let buf = "";
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (c === "\n") { inLineComment = false; buf += c; }
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      buf += c;
      // '' is an escaped quote inside a string, not a terminator.
      if (c === "'") {
        if (next === "'") { buf += next; i++; } else { inString = false; }
      }
      continue;
    }
    if (c === "-" && next === "-") { inLineComment = true; i++; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (c === "'") { inString = true; buf += c; continue; }
    if (c === ";") { if (buf.trim()) out.push(buf.trim()); buf = ""; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

await sql`
  create table if not exists _migrations (
    filename    text primary key,
    applied_at  timestamptz not null default now()
  )
`;

const applied = new Set(
  (await sql`select filename from _migrations`).map((r) => r.filename),
);

const files = readdirSync(join(ROOT, "db"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

let ran = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip   ${file}`);
    continue;
  }
  const body = readFileSync(join(ROOT, "db", file), "utf8");
  try {
    // Statements are sent individually: the HTTP driver takes one per call.
    for (const stmt of splitStatements(body)) {
      await sql.query(stmt);
    }
    await sql`insert into _migrations (filename) values (${file})`;
    console.log(`  applied ${file}`);
    ran++;
  } catch (e) {
    console.error(`\n  FAILED  ${file}\n  ${e.message}\n`);
    process.exit(1);
  }
}

console.log(ran ? `\n${ran} migration(s) applied.` : "\nNothing to apply.");

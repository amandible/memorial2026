import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Joe's recipes, read from the original files in content/recipes/.
 *
 * These are the actual text files off his machine, copied in verbatim — the
 * four that were RTF, DOC or PDF were converted once and keep their original
 * names so the provenance stays visible. Titles live in _titles.json, derived
 * once by the script that built his cookbook and editable by hand since some
 * are only the filename tidied up.
 *
 * The URL slug comes from the filename rather than the title: three titles
 * collide ("Corn Chowder" twice, and so on) while every filename is unique. It
 * also keeps his own naming in the address bar, which is the point — the .fud
 * and .dip extensions are a filing system he invented.
 */

const DIR = join(process.cwd(), "content", "recipes");

export type Recipe = {
  slug: string;
  /** Original filename, e.g. "chicbroc.fud". Shown as provenance. */
  file: string;
  title: string;
  /** The text exactly as he typed it, minus the shared leading indent. */
  body: string;
  /** Year the file was created, from _dates.json. Null if unknown. */
  year: number | null;
};

export function slugFor(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Redact anything that looks like an email address.
 *
 * One of these files turned out to be a forwarded email Joe had saved, headers
 * and all, and it published four other people's addresses to the open internet
 * where scrapers harvest them. That file has been cleaned, but this is the
 * backstop: these are thirty years of files off a personal machine and nobody
 * has read all of them closely.
 *
 * Runs at build time, so a file added later cannot leak an address by being
 * dropped into the directory.
 */
function redactEmails(text: string): string {
  return text.replace(/[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[email address removed]");
}

/** Strip a leading mail-header block, for files that are saved emails. */
function stripMailHeaders(text: string): string {
  const lines = text.split("\n");
  const header =
    /^(Delivered-To|Authentication-Results|Received|Return-Path|Message-ID|MIME-Version|Content-Type|X-[\w-]+|Subject|From|To|Cc|Bcc|Sent|Date|Reply-To):/i;
  if (!header.test(lines[0] ?? "")) return text;

  let i = 0;
  while (i < lines.length && lines[i].trim()) i++;
  const subject = lines
    .slice(0, i)
    .find((l) => /^subject:/i.test(l))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
  const body = lines.slice(i);
  while (body.length && !body[0].trim()) body.shift();
  return (subject ? [subject, ""] : []).concat(body).join("\n");
}

/**
 * Remove the indentation every line shares.
 *
 * Most of these are indented six spaces wholesale. Dropping that buys back six
 * characters of width on a phone without altering the text's internal shape —
 * relative indentation inside a recipe is preserved.
 */
function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => l.length - l.trimStart().length);
  const common = indents.length ? Math.min(...indents) : 0;
  return common > 0 ? lines.map((l) => l.slice(common)).join("\n") : text;
}

let cache: Recipe[] | null = null;

export function getRecipes(): Recipe[] {
  if (cache) return cache;

  const titles = JSON.parse(readFileSync(join(DIR, "_titles.json"), "utf8")) as Record<
    string,
    string
  >;

  // Creation dates captured from the originals on Joe's machine. They live in a
  // file because git does not preserve mtimes — on a fresh clone, which is what
  // Vercel builds from, every file would appear to have been created at deploy
  // time. They span 1991 to 2015.
  const dates = JSON.parse(readFileSync(join(DIR, "_dates.json"), "utf8")) as Record<
    string,
    string
  >;

  const recipes = readdirSync(DIR)
    // Skip the manifest, dotfiles, and documentation. None of his recipe files
    // are Markdown, so excluding .md is safe and keeps README.md out.
    .filter((f) => !f.startsWith("_") && !f.startsWith(".") && !f.toLowerCase().endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(DIR, file), "utf8");
      const body = redactEmails(
        dedent(stripMailHeaders(raw.replace(/\r\n?/g, "\n"))),
      ).replace(/\s+$/, "");
      const year = dates[file] ? Number.parseInt(dates[file].slice(0, 4), 10) : null;
      return {
        slug: slugFor(file),
        file,
        title: titles[file] ?? file,
        body,
        year: Number.isFinite(year) ? year : null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));

  // A silently empty recipe section would be worse than a failed build.
  if (recipes.length === 0) {
    throw new Error("No recipes found in content/recipes — check the directory.");
  }

  const dupes = recipes.filter((r, i) => recipes.findIndex((x) => x.slug === r.slug) !== i);
  if (dupes.length) {
    throw new Error(`Duplicate recipe slugs: ${dupes.map((d) => d.slug).join(", ")}`);
  }

  cache = recipes;
  return recipes;
}

export function getRecipe(slug: string): Recipe | undefined {
  return getRecipes().find((r) => r.slug === slug);
}

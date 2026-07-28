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
};

export function slugFor(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  const recipes = readdirSync(DIR)
    // Skip the manifest, dotfiles, and documentation. None of his recipe files
    // are Markdown, so excluding .md is safe and keeps README.md out.
    .filter((f) => !f.startsWith("_") && !f.startsWith(".") && !f.toLowerCase().endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(DIR, file), "utf8");
      const body = dedent(raw.replace(/\r\n?/g, "\n")).replace(/\s+$/, "");
      return { slug: slugFor(file), file, title: titles[file] ?? file, body };
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

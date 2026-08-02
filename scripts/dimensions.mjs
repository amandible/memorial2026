/**
 * Fill in the pixel dimensions of any photograph that doesn't have them.
 *
 *   npm run dimensions           fill in what's missing
 *   npm run dimensions -- --all  re-measure everything, including rows already set
 *
 * New submissions record their own size: the browser has already decoded the
 * file to show a preview, so it knows. This exists for the photographs that
 * predate that, and as the repair when a browser couldn't measure one — a HEIC
 * on a desktop that can't render it, for instance.
 *
 * Reads the original from Cloudflare Images rather than a delivery variant.
 * Every variant is resized, so measuring one would record the variant's size and
 * quietly claim it was the sender's.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import exifr from "exifr";
import { imageSize } from "../src/lib/image-size.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const need = ["DATABASE_URL", "CF_IMAGES_ACCOUNT_ID", "CF_IMAGES_API_TOKEN"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const all = process.argv.includes("--all");
const sql = neon(process.env.DATABASE_URL);

const rows = all
  ? await sql`select id, storage_ref, width, height from photos order by created_at`
  : await sql`select id, storage_ref, width, height from photos
              where width is null or height is null order by created_at`;

if (rows.length === 0) {
  console.log("Every photograph already has its dimensions.");
  process.exit(0);
}
console.log(`Measuring ${rows.length} photograph(s)…\n`);

let done = 0;
let failed = 0;
let changed = 0;

for (const row of rows) {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_IMAGES_ACCOUNT_ID}/images/v1/${row.storage_ref}/blob`,
      { headers: { authorization: `Bearer ${process.env.CF_IMAGES_API_TOKEN}` } },
    );
    if (!res.ok) throw new Error(`blob fetch ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    // The file's own header first. EXIF describes what the camera captured and
    // goes stale as soon as anything is cropped, so it is only the fallback —
    // it is what covers HEIC, which imageSize() deliberately doesn't parse.
    let size = imageSize(bytes);
    let source = "header";
    if (!size) {
      const t = await exifr
        .parse(bytes, { pick: ["ExifImageWidth", "ExifImageHeight", "ImageWidth", "ImageHeight"] })
        .catch(() => null);
      const w = Number(t?.ExifImageWidth ?? t?.ImageWidth ?? 0);
      const h = Number(t?.ExifImageHeight ?? t?.ImageHeight ?? 0);
      if (w > 0 && h > 0) {
        size = { width: w, height: h };
        source = "exif";
      }
    }

    if (!size) {
      console.log(`  ?      ${row.storage_ref}  could not measure`);
      failed++;
      continue;
    }

    const was = row.width && row.height ? `${row.width}x${row.height}` : "unset";
    const now = `${size.width}x${size.height}`;
    if (was !== now) changed++;

    await sql`update photos set width = ${size.width}, height = ${size.height}
              where id = ${row.id}::uuid`;
    console.log(
      `  ok     ${row.storage_ref}  ${now.padEnd(11)} (${source})${was !== "unset" && was !== now ? `  was ${was}` : ""}`,
    );
    done++;
  } catch (e) {
    console.error(`  FAILED ${row.storage_ref}: ${e.message}`);
    failed++;
  }
}

console.log(`\n${done} measured, ${changed} changed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;

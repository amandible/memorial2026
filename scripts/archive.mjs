/**
 * Copy any approved photograph that isn't in R2 yet.
 *
 *   npm run archive          copy what's missing
 *   npm run archive -- --pull <dir>   download the whole bucket locally
 *
 * The first is the backfill and the drift-fixer: archiving normally happens when
 * a photo is approved, and this catches anything that failed or predates it.
 *
 * The second is the one that actually protects against losing an account. Two
 * copies at Cloudflare is one vendor; a folder on a disk somewhere is a
 * different kind of copy. Run it occasionally and put the result somewhere safe.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { AwsClient } from "aws4fetch";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const need = ["DATABASE_URL", "CF_IMAGES_ACCOUNT_ID", "CF_IMAGES_API_TOKEN",
              "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}\nSee README → "The services".`);
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const aws = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});
const base = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;
const url = (key) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif",
              "image/webp": "webp", "image/gif": "gif", "image/tiff": "tif" };

async function pull(dir) {
  mkdirSync(dir, { recursive: true });
  let token, keys = [];
  do {
    const u = new URL(base);
    u.searchParams.set("list-type", "2");
    if (token) u.searchParams.set("continuation-token", token);
    const res = await aws.fetch(u.toString());
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    const xml = await res.text();
    keys.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
      : undefined;
  } while (token);

  console.log(`  ${keys.length} object(s) in the bucket`);
  let got = 0, skipped = 0;
  for (const key of keys) {
    const dest = join(dir, key);
    if (existsSync(dest)) { skipped++; continue; }
    const res = await aws.fetch(url(key));
    if (!res.ok) { console.error(`  FAILED ${key}: ${res.status}`); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`  ↓ ${key}`);
    got++;
  }
  console.log(`\n  ${got} downloaded, ${skipped} already present, in ${dir}`);
}

async function backfill() {
  const rows = await sql`
    select id, storage_ref from photos
    where status = 'approved' and archived_at is null
    order by created_at`;

  if (rows.length === 0) {
    const [{ n }] = await sql`select count(*)::int n from photos where archived_at is not null`;
    console.log(`  Nothing to archive. ${n} photo(s) already backed up.`);
    return;
  }
  console.log(`  ${rows.length} photo(s) to archive`);

  let done = 0, failed = 0;
  for (const row of rows) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_IMAGES_ACCOUNT_ID}/images/v1/${row.storage_ref}/blob`,
        { headers: { authorization: `Bearer ${process.env.CF_IMAGES_API_TOKEN}` } });
      if (!res.ok) throw new Error(`Cloudflare returned ${res.status}`);

      const type = res.headers.get("content-type") || "application/octet-stream";
      const body = Buffer.from(await res.arrayBuffer());
      const key = `photos/${row.storage_ref}.${EXT[type] ?? "bin"}`;

      const put = await aws.fetch(url(key), {
        method: "PUT", body, headers: { "content-type": type },
      });
      if (!put.ok) throw new Error(`R2 PUT ${put.status}: ${(await put.text()).slice(0, 160)}`);

      await sql`update photos set archive_key = ${key}, archived_at = now() where id = ${row.id}::uuid`;
      console.log(`  ↑ ${key}  (${(body.length / 1024).toFixed(0)} KB)`);
      done++;
    } catch (e) {
      // Keep going: one bad photo shouldn't stop the rest being backed up.
      console.error(`  FAILED ${row.storage_ref}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n  ${done} archived, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

const pullIdx = process.argv.indexOf("--pull");
if (pullIdx !== -1) {
  await pull(process.argv[pullIdx + 1] || join(ROOT, "media", "archive"));
} else {
  await backfill();
}

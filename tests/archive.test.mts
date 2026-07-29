import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { archiveKeyFor, archivePhotoQuietly } from "../src/lib/archive.ts";
import { r2Configured } from "../src/lib/r2.ts";

/**
 * The archive runs inside the approve action. Production has no R2 credentials
 * yet, so the property that matters right now is that an unconfigured or broken
 * archive is invisible: approving a photograph must keep working either way.
 */

const R2_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

before(() => {
  for (const k of [...R2_KEYS, "DATABASE_URL", "CF_IMAGES_ACCOUNT_ID", "CF_IMAGES_API_TOKEN"]) {
    saved[k] = process.env[k];
  }
});
after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  globalThis.fetch = realFetch;
  for (const k of R2_KEYS) delete process.env[k];
});

describe("r2Configured", () => {
  test("false unless all four variables are present", () => {
    assert.equal(r2Configured(), false);
    process.env.R2_ACCOUNT_ID = "a";
    process.env.R2_ACCESS_KEY_ID = "b";
    process.env.R2_SECRET_ACCESS_KEY = "c";
    assert.equal(r2Configured(), false, "three of four is not configured");
    process.env.R2_BUCKET = "d";
    assert.equal(r2Configured(), true);
  });
});

describe("archivePhotoQuietly never throws", () => {
  // This is the one that protects production today: R2 is not set up there, so
  // every approval takes this path.
  test("when R2 is not configured at all", async () => {
    globalThis.fetch = (() => {
      throw new Error("nothing should be fetched when R2 is unconfigured");
    }) as typeof fetch;
    await assert.doesNotReject(() => archivePhotoQuietly("00000000-0000-0000-0000-000000000000"));
  });

  test("when the database lookup fails", async () => {
    for (const k of R2_KEYS) process.env[k] = "x";
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:1/none?sslmode=require";
    await assert.doesNotReject(() => archivePhotoQuietly("00000000-0000-0000-0000-000000000000"));
  });

  test("when Cloudflare or R2 return errors", async () => {
    for (const k of R2_KEYS) process.env[k] = "x";
    globalThis.fetch = (() => Promise.resolve(new Response("no", { status: 500 }))) as typeof fetch;
    await assert.doesNotReject(() => archivePhotoQuietly("00000000-0000-0000-0000-000000000000"));
  });
});

describe("archiveKeyFor", () => {
  test("keys on the image id, so re-running cannot duplicate or collide", () => {
    assert.equal(archiveKeyFor("abc-123", "image/jpeg"), "photos/abc-123.jpg");
    assert.equal(archiveKeyFor("abc-123", "image/jpeg"), "photos/abc-123.jpg");
    assert.notEqual(archiveKeyFor("abc-123", "image/jpeg"), archiveKeyFor("def-456", "image/jpeg"));
  });

  test("keeps HEIC as HEIC — the archive is the original, not a converted copy", () => {
    assert.equal(archiveKeyFor("x", "image/heic"), "photos/x.heic");
  });

  test("falls back to .bin rather than guessing at an unknown type", () => {
    assert.equal(archiveKeyFor("x", "application/octet-stream"), "photos/x.bin");
  });
});

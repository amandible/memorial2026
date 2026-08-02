import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseYear } from "../src/lib/year.ts";

/**
 * The submission form reads the year in the browser, using exifr's lite build.
 *
 * That shipped broken: it passed `pick`, which resolves tag names through a
 * dictionary the lite build doesn't include, so every call threw and an empty
 * catch swallowed it. Nothing looked wrong — the year simply never appeared.
 * These tests pin the parts that were wrong, so the next person to change the
 * options finds out at build time.
 *
 * The fixture is synthetic on purpose. The obvious alternative is committing one
 * of Joe's photographs, and this repository is public.
 */

/** Smallest JPEG carrying one EXIF DateTimeOriginal. */
function jpegWithDate(stamp: string): Uint8Array {
  assert.equal(stamp.length, 19, "EXIF timestamps are exactly 19 characters");

  const tiff = new Uint8Array(64);
  const view = new DataView(tiff.buffer);
  const LE = true;

  // TIFF header: little-endian, magic 42, IFD0 begins at byte 8.
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  view.setUint16(2, 42, LE);
  view.setUint32(4, 8, LE);

  // IFD0: one entry, an offset to the Exif sub-IFD at byte 26.
  view.setUint16(8, 1, LE);
  view.setUint16(10, 0x8769, LE); // ExifIFDPointer
  view.setUint16(12, 4, LE); // LONG
  view.setUint32(14, 1, LE);
  view.setUint32(18, 26, LE);
  view.setUint32(22, 0, LE); // no IFD1

  // Exif sub-IFD: one entry, DateTimeOriginal, 20 ASCII bytes at byte 44.
  view.setUint16(26, 1, LE);
  view.setUint16(28, 0x9003, LE); // DateTimeOriginal
  view.setUint16(30, 2, LE); // ASCII
  view.setUint32(32, 20, LE);
  view.setUint32(36, 44, LE);
  view.setUint32(40, 0, LE);

  for (let i = 0; i < 19; i++) tiff[44 + i] = stamp.charCodeAt(i);
  tiff[63] = 0; // NUL terminator

  const header = new TextEncoder().encode("Exif\0\0");
  const out = new Uint8Array(4 + 2 + header.length + tiff.length + 2);
  let o = 0;
  out[o++] = 0xff; out[o++] = 0xd8; // SOI
  out[o++] = 0xff; out[o++] = 0xe1; // APP1
  // Segment length counts itself but not the marker.
  out[o++] = ((header.length + tiff.length + 2) >> 8) & 0xff;
  out[o++] = (header.length + tiff.length + 2) & 0xff;
  out.set(header, o); o += header.length;
  out.set(tiff, o); o += tiff.length;
  out[o++] = 0xff; out[o++] = 0xd9; // EOI
  return out;
}

/** Exactly what src/app/photos/form.tsx passes. Must stay in step with it. */
const FORM_OPTIONS = { ifd0: false, exif: true, gps: false, reviveValues: false };

describe("exifr lite build, as the submission form uses it", () => {
  test("reads DateTimeOriginal with the form's options", async () => {
    const { parse } = await import("exifr/dist/lite.esm.mjs");
    const tags = await parse(jpegWithDate("2013:09:15 12:48:29"), FORM_OPTIONS);
    assert.equal(tags?.DateTimeOriginal, "2013:09:15 12:48:29");
  });

  test("reviveValues:false keeps the raw string, not a Date", async () => {
    const { parse } = await import("exifr/dist/lite.esm.mjs");
    const tags = await parse(jpegWithDate("1999:12:31 23:30:00"), FORM_OPTIONS);
    // A Date here would be read back in some timezone and could land in 2000.
    assert.equal(typeof tags?.DateTimeOriginal, "string");
    assert.equal(parseYear(String(tags?.DateTimeOriginal).slice(0, 4)), 1999);
  });

  test("`pick` throws on this build — the bug that shipped", async () => {
    const { parse } = await import("exifr/dist/lite.esm.mjs");
    await assert.rejects(
      () => parse(jpegWithDate("2013:09:15 12:48:29"), {
        // @ts-expect-error deliberately not in the type declaration, so that
        // reintroducing it in the form is caught at build time rather than here.
        pick: ["DateTimeOriginal"],
      }),
      "pick must still fail — if this starts passing, the declaration can allow it again",
    );
  });

  test("a file with no metadata resolves rather than throwing", async () => {
    const { parse } = await import("exifr/dist/lite.esm.mjs");
    // Bare SOI/EOI: a valid JPEG shell with no APP1 at all.
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const tags = await parse(bare, FORM_OPTIONS);
    assert.ok(tags === undefined || tags.DateTimeOriginal === undefined);
  });
});

describe("the year bound the form applies to what it reads", () => {
  test("rejects a date before Joe was born", () => {
    assert.equal(parseYear("1889"), null);
  });

  test("rejects a future date, which is what a wrong camera clock looks like", () => {
    assert.equal(parseYear(String(new Date().getFullYear() + 1)), null);
  });

  test("accepts a plausible one", () => {
    assert.equal(parseYear("2013"), 2013);
  });
});

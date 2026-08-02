import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { imageSize } from "../src/lib/image-size.ts";

/**
 * The header parser is the authority on how big a photograph is, and it earns
 * that: of 29 archived originals, two carried EXIF dimensions from before the
 * photograph was cropped, and the header was right both times.
 *
 * It also runs over stranger-supplied bytes, so the cases that matter most here
 * are the malformed ones — a parser that loops forever on a truncated file is a
 * denial of service, not a bug.
 */

function jpeg({ width, height, marker = 0xc0, extraSegments = 0 }: {
  width: number;
  height: number;
  marker?: number;
  extraSegments?: number;
}): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  // Padding segments before the frame header, so the walk has to skip them.
  for (let i = 0; i < extraSegments; i++) {
    out.push(0xff, 0xe0, 0x00, 0x08, 0, 0, 0, 0, 0, 0);
  }
  out.push(
    0xff, marker,
    0x00, 0x11, // segment length
    0x08, // sample precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, // components
    ...new Array(9).fill(0),
  );
  out.push(0xff, 0xd9);
  return new Uint8Array(out);
}

function png(width: number, height: number): Uint8Array {
  const out = new Uint8Array(24);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return out;
}

describe("imageSize", () => {
  test("reads JPEG dimensions", () => {
    assert.deepEqual(imageSize(jpeg({ width: 4592, height: 3056 })), {
      width: 4592,
      height: 3056,
    });
  });

  test("skips over segments before the frame header", () => {
    assert.deepEqual(imageSize(jpeg({ width: 640, height: 480, extraSegments: 6 })), {
      width: 640,
      height: 480,
    });
  });

  test("handles progressive JPEG, which uses a different SOF marker", () => {
    // SOF2. Real phone and scanner output uses this constantly.
    assert.deepEqual(imageSize(jpeg({ width: 1280, height: 960, marker: 0xc2 })), {
      width: 1280,
      height: 960,
    });
  });

  test("does not mistake a Huffman table for a frame header", () => {
    // 0xC4 sits in the SOF numeric range but is not one.
    assert.equal(imageSize(jpeg({ width: 100, height: 100, marker: 0xc4 })), null);
  });

  test("reads PNG dimensions", () => {
    assert.deepEqual(imageSize(png(1920, 1080)), { width: 1920, height: 1080 });
  });

  test("reads GIF dimensions, which are little-endian", () => {
    const g = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02]);
    assert.deepEqual(imageSize(g), { width: 800, height: 600 });
  });

  test("returns null for HEIC rather than guessing", () => {
    // ftypheic box. The caller falls back to EXIF, which HEIC always carries.
    const heic = new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    assert.equal(imageSize(heic), null);
  });
});

describe("imageSize on malformed input", () => {
  test("returns null, never throws, on junk", () => {
    for (const junk of [
      new Uint8Array(0),
      new Uint8Array([0xff]),
      new Uint8Array([0xff, 0xd8]),
      new Uint8Array(64),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG signature, truncated
      new Uint8Array(Array.from({ length: 200 }, (_, i) => i % 256)),
    ]) {
      assert.equal(imageSize(junk), null);
    }
  });

  test("terminates on a segment claiming a zero length", () => {
    // Without the length guard this advances by zero and spins forever.
    const evil = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0]);
    assert.equal(imageSize(evil), null);
  });

  test("terminates on a run of 0xff padding", () => {
    const padded = new Uint8Array(4096).fill(0xff);
    padded[0] = 0xff;
    padded[1] = 0xd8;
    assert.equal(imageSize(padded), null);
  });

  test("rejects a header stating an implausible size", () => {
    assert.equal(imageSize(jpeg({ width: 0, height: 0 })), null);
    assert.equal(imageSize(png(0, 500)), null);
  });
});

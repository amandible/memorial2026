/**
 * Read pixel dimensions out of an image's own header.
 *
 * Deliberately not a decoder and deliberately not a dependency. It reads the few
 * bytes that state the size and stops, which is all that's wanted and avoids
 * handing stranger-supplied files to an image library on our server — the same
 * reason visitor photographs never go through next/image (AGENTS.md §12).
 *
 * This is the authority when it disagrees with EXIF, and it does disagree: of 29
 * archived originals, two carried EXIF dimensions left over from before the
 * photograph was cropped. EXIF describes what the camera captured; the header
 * describes the file in your hand.
 */

export type ImageSize = { width: number; height: number };

/**
 * JPEG: walk the segment chain to a Start-Of-Frame marker, which carries the
 * dimensions. Anything else is skipped by its own declared length.
 */
function jpegSize(b: Uint8Array): ImageSize | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;

  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];

    // SOF0..SOF15 hold the frame header. C4 (Huffman tables), C8 (JPEG
    // extensions) and CC (arithmetic coding) sit in the same numeric range and
    // are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }

    const length = (b[i + 2] << 8) | b[i + 3];
    // A zero or negative length would spin here forever on a corrupt file.
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

/** PNG: fixed layout — the IHDR chunk always begins at byte 16. */
function pngSize(b: Uint8Array): ImageSize | null {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !SIGNATURE.every((v, i) => b[i] === v)) return null;

  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** GIF: little-endian width and height at a fixed offset in the header. */
function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
}

/**
 * Dimensions from the file itself, or null if this isn't a format handled here.
 *
 * HEIC returns null on purpose: its box structure needs real parsing, and the
 * caller has EXIF to fall back on, which is present in practically every HEIC a
 * phone produces.
 */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const size = pngSize(bytes) ?? gifSize(bytes) ?? jpegSize(bytes);
  // Guard against a header that parses but states nonsense.
  if (!size || size.width <= 0 || size.height <= 0) return null;
  if (size.width > 100_000 || size.height > 100_000) return null;
  return size;
}

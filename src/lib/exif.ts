import exifr from "exifr";

/**
 * Read the capture date out of a photograph.
 *
 * Only used to *suggest* a year. A submitter-provided year always wins, because
 * EXIF is confidently wrong in the case this site attracts most: someone
 * photographing an old print with their phone. The file says 2024, the
 * photograph is of Joe in 1975, and every automated check passes.
 */

export type ExifDate = {
  /** Year from DateTimeOriginal, or null. */
  year: number | null;
  /** Full timestamp, kept so the admin page can show what the file claimed. */
  takenAt: Date | null;
  /** Camera make and model, if present. */
  camera: string | null;
};

const EMPTY: ExifDate = { year: null, takenAt: null, camera: null };

/** Digital photography did not exist before this; anything earlier is junk data. */
const EARLIEST = 1990;

export async function readExifDate(bytes: ArrayBuffer | Uint8Array): Promise<ExifDate> {
  let tags: Record<string, unknown>;
  try {
    // reviveValues: false keeps DateTimeOriginal as its raw "YYYY:MM:DD hh:mm:ss"
    // string. EXIF carries no timezone, so letting it become a Date and then
    // formatting in UTC shifts some photographs into the previous or next day —
    // and occasionally the wrong year.
    tags =
      ((await exifr.parse(bytes as Buffer, {
        pick: ["DateTimeOriginal", "CreateDate", "Make", "Model"],
        reviveValues: false,
      })) as Record<string, unknown>) ?? {};
  } catch {
    // A file with no readable metadata is the normal case for scans and
    // screenshots, not an error worth surfacing.
    return EMPTY;
  }

  const raw = String(tags.DateTimeOriginal ?? tags.CreateDate ?? "");
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  const camera =
    [tags.Make, tags.Model].filter(Boolean).map(String).join(" ").trim() || null;

  if (!m) return { ...EMPTY, camera };

  const [, y, mo, d, h, mi, s] = m.map(Number);
  if (y < EARLIEST || y > new Date().getFullYear() + 1) return { ...EMPTY, camera };

  return {
    year: y,
    // Recorded as UTC. It is really local camera time with no zone, but the
    // value is only ever shown as a year, and this keeps it unambiguous.
    takenAt: new Date(Date.UTC(y, mo - 1, d, h, mi, s)),
    camera,
  };
}

// Lives in year.ts so the browser can use it without pulling in exifr; re-exported
// here because every server-side caller already imports it from this module.
export { parseYear } from "./year.ts";

/**
 * Year validation, kept apart from exif.ts on purpose.
 *
 * exif.ts imports the exifr parser at module scope, which is right on the
 * server and wrong in the browser — the submission form needs this bound check
 * too, and importing it from there would pull the whole parser into the client
 * bundle statically, defeating the dynamic import that keeps it off the page
 * until someone actually picks a photograph.
 */

/** Validate a year typed by a person, or read out of a file. Returns null rather than throwing. */
export function parseYear(input: unknown): number | null {
  const n = Number.parseInt(String(input ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  // Joe was born in 1944, so a photograph of him cannot predate that.
  if (n < 1944 || n > new Date().getFullYear()) return null;
  return n;
}

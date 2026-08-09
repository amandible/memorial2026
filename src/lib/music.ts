/**
 * Pure, browser-safe helpers for recordings.
 *
 * Deliberately no imports — gallery.tsx (a client component) needs
 * isVideoExtension to choose <audio> vs <video>, so nothing here can touch
 * db.ts or node:crypto, even transitively, the same reason photo-kinds.ts
 * is split out from photos.ts.
 */

/** Light validation only — there's no publish-time step here that needs a
 * trustworthy type to protect, so this exists for UX (reject an obviously
 * wrong file before uploading it) rather than as a security boundary. */
export const ALLOWED_MUSIC_EXTENSIONS = [
  "mp3",
  "wav",
  "m4a",
  "aac",
  "flac",
  "mp4",
  "mov",
  "m4v",
];

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);

/** Matches on the LAST extension only, so "song.mp3.html" is ".html", not sniffed as mp3. */
function lastExtension(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

export function isAllowedMusicExtension(filename: string): boolean {
  return ALLOWED_MUSIC_EXTENSIONS.includes(lastExtension(filename));
}

/** Whether to render <video> instead of <audio> in the gallery/lightbox. */
export function isVideoExtension(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(lastExtension(filename));
}

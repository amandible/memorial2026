/**
 * Which gallery a photograph belongs to.
 *
 * Each kind value doubles as its route segment (/friends-family, /camping,
 * /setlists, /music), so there is no separate slug-to-href table to keep in
 * sync.
 *
 * Deliberately has no database import — sections.ts pulls this into nav.tsx,
 * a client component, and every export from a module that touches ./db.ts
 * would drag the Neon client into the browser bundle.
 */
export type PhotoKind = "friends-family" | "camping" | "setlists" | "music";

export const PHOTO_KINDS: PhotoKind[] = ["friends-family", "camping", "setlists", "music"];

/** What each kind is called, in one place — nav, admin, and the add form all read from here. */
export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  "friends-family": "Friends & Family",
  camping: "Camping",
  setlists: "Setlists",
  music: "Music",
};

/** Narrow untrusted input to a kind, defaulting to the first gallery. */
export function parseKind(input: unknown): PhotoKind {
  return (PHOTO_KINDS as string[]).includes(input as string)
    ? (input as PhotoKind)
    : "friends-family";
}

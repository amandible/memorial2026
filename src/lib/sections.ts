/**
 * The site's sections, in nav order.
 *
 * Lives here rather than in nav.tsx because that file is a client component, and
 * every export from a "use client" module becomes a client reference — importing
 * this array from there into a server component yields a proxy, not an array.
 */
import { PHOTO_KINDS, PHOTO_KIND_LABELS } from "./photo-kinds";

export const SECTIONS = [
  { href: "/service", label: "The Service" },
  ...PHOTO_KINDS.map((kind) => ({ href: `/${kind}`, label: PHOTO_KIND_LABELS[kind] })),
  { href: "/guestbook", label: "Guestbook" },
  { href: "/subscribe", label: "Stay in touch" },
] as const;

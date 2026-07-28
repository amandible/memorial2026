/**
 * The site's sections, in nav order.
 *
 * Lives here rather than in nav.tsx because that file is a client component, and
 * every export from a "use client" module becomes a client reference — importing
 * this array from there into a server component yields a proxy, not an array.
 */
export const SECTIONS = [
  { href: "/service", label: "The Service" },
  { href: "/photos", label: "Photographs" },
  { href: "/guestbook", label: "Guestbook" },
  { href: "/recipes", label: "Recipes" },
  { href: "/subscribe", label: "Stay in touch" },
] as const;

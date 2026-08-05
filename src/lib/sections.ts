/**
 * The site's sections, in nav order.
 *
 * Lives here rather than in nav.tsx because that file is a client component, and
 * every export from a "use client" module becomes a client reference — importing
 * this array from there into a server component yields a proxy, not an array.
 */
/**
 * What the artifacts section is called, in one place.
 *
 * The name is not settled — "Artifacts" is accurate but cooler in tone than the
 * rest of the nav, and something plainer may replace it. Everything that shows
 * the word reads it from here so that change stays a single edit. The URL is
 * deliberately not derived from it: /artifacts will already be in emails and
 * printed material, and a renamed section must not break those links.
 */
export const ARTIFACTS_LABEL = "Artifacts";

export const SECTIONS = [
  { href: "/service", label: "The Service" },
  { href: "/photos", label: "Photographs" },
  { href: "/artifacts", label: ARTIFACTS_LABEL },
  { href: "/guestbook", label: "Guestbook" },
  { href: "/subscribe", label: "Stay in touch" },
] as const;

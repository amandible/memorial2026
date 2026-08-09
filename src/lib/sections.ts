/**
 * The site's sections, in nav order.
 *
 * Lives here rather than in nav.tsx because that file is a client component, and
 * every export from a "use client" module becomes a client reference — importing
 * this array from there into a server component yields a proxy, not an array.
 */
import { PHOTO_KINDS, PHOTO_KIND_LABELS } from "./photo-kinds";

/**
 * Pages carrying a Turnstile widget, which must be reached by a full page load.
 *
 * Turnstile's implicit rendering scans the DOM for `.cf-turnstile` once, when
 * its script executes. Next loads a `<Script>` exactly once per session — "even
 * if a user navigates between multiple routes", per its own docs — so after a
 * client-side navigation the script is already loaded, never runs again, and
 * never scans. The new page gets a widget container that nothing will ever fill:
 * `window.turnstile` is defined, no widget appears, no token is ever produced,
 * and the form says "please complete the verification below" over empty space.
 *
 * That was reported as intermittent for months upstream. It isn't: arriving by
 * link fails every time, arriving by reload works every time.
 *
 * A plain <a> forces a document load, so the script re-executes and scans. The
 * cost is one slower navigation on three pages; the alternative is a form that
 * cannot be submitted. **Do not turn these back into <Link>.**
 *
 * This is a *different* failure than the one the add-mode toggle on
 * /photos/add hits when switching between "Send a photo"/"Send text"/"Send
 * audio or video" — that's a container appearing mid-session on a page that
 * never navigated at all, which a full-page load can't fix by definition
 * (there's nowhere to navigate to). Those three forms render their Turnstile
 * widget explicitly via window.turnstile.render() instead, in
 * photos/form.tsx, text-memory-form.tsx, and music-upload-form.tsx — see the
 * comment on each. Both fixes are needed; neither covers the other's case.
 */
export const NEEDS_FULL_LOAD = ["/photos/add", "/guestbook/add", "/subscribe"];

/** True when a href lands on a page that renders a Turnstile widget. */
export function needsFullLoad(href: string): boolean {
  const path = href.split("?")[0];
  return NEEDS_FULL_LOAD.includes(path);
}

export const SECTIONS = [
  { href: "/service", label: "The Service" },
  ...PHOTO_KINDS.map((kind) => ({ href: `/${kind}`, label: PHOTO_KIND_LABELS[kind] })),
  { href: "/guestbook", label: "Guestbook" },
  { href: "/subscribe", label: "Stay in touch" },
] as const;

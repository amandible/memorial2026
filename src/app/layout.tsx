import type { Metadata } from "next";
import { bodySerif, displaySerif, mono } from "./fonts";
import Nav from "./nav";
import Footer from "./footer";
import "./tokens.css";

const SITE_NAME = "Bill Melanson";
const DESCRIPTION = "In memory of Bill Melanson, 1965–2026. More to come soon.";

/**
 * Absolute base for Open Graph URLs.
 *
 * Falling back straight to localhost was shipping
 * `og:image = http://localhost:3000/...` to production, so every Facebook share
 * resolved to nothing. The tag was present, which is why it looked fine.
 *
 * Preference order: an explicit APP_BASE_URL, then Vercel's stable production
 * domain, then the per-deployment URL (so branch previews get working cards too),
 * then localhost for development. Vercel's variables carry no protocol.
 *
 * The dev fallback follows PORT because this project doesn't run on 3000 —
 * Grafana usually holds that port on the development machine.
 */
function resolveBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3117}`;
}

export const metadata: Metadata = {
  metadataBase: new URL(resolveBaseUrl()),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  // These sites travel by Facebook share — PLAN.md §3, Milestone 1.
  openGraph: {
    type: "profile",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    // A dedicated 1200x630 crop. The square portrait was being centre-cropped by
    // Facebook and Twitter, which cut off his hands and the top of his head.
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodySerif.variable} ${displaySerif.variable} ${mono.variable}`}>
      {/* Browser extensions stamp attributes on <body> before React hydrates —
          Web of Trust adds wotdisconnected, others add their own — and React
          reports each as a hydration mismatch. This suppresses that comparison
          for <body>'s own attributes only; mismatches in the actual page
          content are still reported, which is what we want to hear about. */}
      <body suppressHydrationWarning>
        <a href="#main" className="skip">Skip to content</a>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}

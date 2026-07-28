import type { Metadata } from "next";
import { bodySerif, displaySerif } from "./fonts";
import Nav from "./nav";
import "./tokens.css";

const SITE_NAME = "Joe Weisman";
const DESCRIPTION =
  "In memory of Joe Weisman, 1944–2026. Curiosity, generosity, justice, and living life to the fullest.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
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
    images: [{ url: "/portrait-hero.jpg", width: 1200, height: 1193, alt: SITE_NAME }],
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodySerif.variable} ${displaySerif.variable}`}>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <Nav />
        {children}
      </body>
    </html>
  );
}

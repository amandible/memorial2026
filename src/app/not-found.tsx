import type { Metadata } from "next";
import Link from "next/link";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = { title: "Page not found" };

// Someone mistyping a URL off a printed program lands here, so it offers the
// way onward rather than just stating the error.
export default function NotFound() {
  return (
    <main className="page" id="main">
      <h1 className="page-title">That page isn&rsquo;t here</h1>
      <hr className="rule" />
      <div className="prose">
        <p>
          The address may have been mistyped, or the page may not have been
          built yet. Everything on the site is below.
        </p>
        <ul className="plainlist">
          <li>
            <Link href="/">Bill&rsquo;s obituary</Link>
          </li>
          {SECTIONS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href}>{label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <p className="contact-note">
        Still stuck? Write to{" "}
        <a href="mailto:contact@joeweisman.org">contact@joeweisman.org</a>.
      </p>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS, needsFullLoad } from "@/lib/sections";

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sitenav">
      <nav className="sitenav-inner" aria-label="Main">
        <Link href="/" className="wordmark" aria-current={pathname === "/" ? "page" : undefined}>
          Bill Melanson
        </Link>
        <ul>
          {SECTIONS.map(({ href, label }) => {
            const current = pathname === href;
            return (
              <li key={href}>
                {/* The current section is not a link to itself — it reads as a label. */}
                {current ? (
                  <span aria-current="page">{label}</span>
                ) : needsFullLoad(href) ? (
                  // Plain anchor on purpose — see needsFullLoad in lib/sections.
                  <a href={href}>{label}</a>
                ) : (
                  <Link href={href}>{label}</Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

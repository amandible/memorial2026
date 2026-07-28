"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS } from "@/lib/sections";

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sitenav">
      <nav className="sitenav-inner" aria-label="Main">
        <Link href="/" className="wordmark" aria-current={pathname === "/" ? "page" : undefined}>
          Joe Weisman
        </Link>
        <ul>
          {SECTIONS.map(({ href, label }) => {
            const current = pathname === href;
            return (
              <li key={href}>
                {/* The current section is not a link to itself — it reads as a label. */}
                {current ? (
                  <span aria-current="page">{label}</span>
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

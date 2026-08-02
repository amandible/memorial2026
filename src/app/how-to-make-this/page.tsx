import type { Metadata } from "next";
import { readDoc } from "@/lib/content";

export const metadata: Metadata = { title: "How to make a site like this" };

export default function HowToMakeThisPage() {
  const doc = readDoc("how-to-make-this");

  return (
    <main className="page" id="main">
      <h1 className="page-title">{doc.title ?? "How to make a site like this"}</h1>
      <hr className="rule" />
      <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import PhotoForm from "../form";
import { imagesConfigured } from "@/lib/cf-images";

export const metadata: Metadata = { title: "Add Photographs" };

export default function AddPhotosPage() {
  return (
    <main className="page" id="main">
      <h1 className="page-title">Add photographs</h1>
      <hr className="rule" />

      <p className="jump-note">
        <Link href="/photos">&larr; Back to the gallery</Link>
      </p>

      {/* Don't offer an upload form that cannot accept an upload. Without
          credentials the submission would fail after the visitor had chosen
          files and waited — say so up front instead. */}
      {imagesConfigured() ? (
        <PhotoForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      ) : (
        <section id="add" className="add-entry">
          <h2>Send your photographs</h2>
          <p className="prose">
            Photo submissions aren&rsquo;t open quite yet. If you have pictures of
            Joe, please start looking them out &mdash; or send them now to{" "}
            <a href="mailto:contact@joeweisman.org">contact@joeweisman.org</a>.
          </p>
        </section>
      )}
    </main>
  );
}

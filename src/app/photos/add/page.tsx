import type { Metadata } from "next";
import Link from "next/link";
import PhotoForm from "../form";
import { imagesConfigured } from "@/lib/cf-images";
import { parseKind } from "@/lib/photos";
import { PHOTO_KIND_LABELS } from "@/lib/photo-kinds";

export const metadata: Metadata = { title: "Add Photos" };

export default async function AddPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  // Arriving from a gallery page preselects that kind, so the common case
  // needs no interaction. The toggle is still there per file, because a batch
  // off someone's phone is often a mix.
  const defaultKind = parseKind((await searchParams).kind);
  const label = PHOTO_KIND_LABELS[defaultKind];

  return (
    <main className="page" id="main">
      <h1 className="page-title">Add to {label.toLowerCase()}</h1>
      <hr className="rule" />

      <p className="jump-note">
        <Link href={`/${defaultKind}`}>&larr; Back to the gallery</Link>
      </p>

      {/* Don't offer an upload form that cannot accept an upload. Without
          credentials the submission would fail after the visitor had chosen
          files and waited — say so up front instead. */}
      {imagesConfigured() ? (
        <PhotoForm
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          defaultKind={defaultKind}
        />
      ) : (
        <section id="add" className="add-entry">
          <h2>Send your photos</h2>
          <p className="prose">
            Photo submissions aren&rsquo;t open quite yet. If you have pictures of
            Bill, please start looking them out &mdash; or send them now to{" "}
            <a href="mailto:contact@billmelanson.org">contact@billmelanson.org</a>.
          </p>
        </section>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import Gallery from "../photos/gallery";
import { getApprovedPhotos } from "@/lib/photos";
import { ARTIFACTS_LABEL } from "@/lib/sections";
import { imageUrl, thumbUrl, imagesConfigured } from "@/lib/cf-images";

export const metadata: Metadata = { title: ARTIFACTS_LABEL };

// Reads the database per request so a newly approved photo appears immediately.
export const dynamic = "force-dynamic";

export default async function ArtifactsPage() {
  let photos: Awaited<ReturnType<typeof getApprovedPhotos>> = [];
  let failed = false;
  try {
    photos = await getApprovedPhotos("artifact");
  } catch (e) {
    // A database problem shouldn't take the page down — the gallery below still tries.
    console.error("Failed to load artifacts:", e);
    failed = true;
  }

  return (
    <main className="page page-photos" id="main">
      <h1 className="page-title">{ARTIFACTS_LABEL}</h1>
      {/* Part of the title, above the rule — as its own block below it, this
          was one more thing to read before reaching the pictures. */}
      <blockquote className="epigraph">
        <p>Work for beauty as for bread.</p>
        <cite>the motto on the harpsichord he built</cite>
      </blockquote>
      <hr className="rule" />

      <p className="prose">
        Things Joe made, marked, or kept &mdash; the saunas and fish ponds and
        improved kitchens, the annotated recipes, the block-print hand that was
        unmistakably his.
      </p>

      <div className="toolbar-row">
        <Link href="/photos/add?kind=artifact" className="btn-primary">
          Send Something of His
        </Link>

        <p className="muted-note">
          Not only photographs &mdash; recordings, scans, letters, and
          documents are welcome too.
        </p>
      </div>

      {failed ? (
        <p className="form-error">
          This page can&rsquo;t be loaded just now. Please try again shortly.
        </p>
      ) : photos.length === 0 ? (
        <p className="prose empty-state">
          Nothing here yet.{" "}
          {imagesConfigured() ? (
            <>
              If you have something he made, or something of his worth keeping,{" "}
              <Link href="/photos/add?kind=artifact">please send a picture of it</Link> &mdash;
              it&rsquo;ll appear here.
            </>
          ) : (
            <>There will be a way to add things here shortly.</>
          )}
        </p>
      ) : (
        <Gallery
          photos={photos.map((p) => ({
            id: p.id,
            thumb: thumbUrl(p.storage_ref),
            full: imageUrl(p.storage_ref),
            caption: p.caption,
            submitter: p.submitter,
            year: p.taken_year,
          }))}
        />
      )}
    </main>
  );
}

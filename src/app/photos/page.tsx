import type { Metadata } from "next";
import PhotoForm from "./form";
import Gallery from "./gallery";
import { getApprovedPhotos } from "@/lib/photos";
import { imageUrl, imagesConfigured } from "@/lib/cf-images";

export const metadata: Metadata = { title: "Photographs" };

// Reads the database per request so a newly approved photo appears immediately.
export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  let photos: Awaited<ReturnType<typeof getApprovedPhotos>> = [];
  let failed = false;
  try {
    photos = await getApprovedPhotos();
  } catch (e) {
    // A database problem shouldn't take the page down — the form still works.
    console.error("Failed to load photos:", e);
    failed = true;
  }

  return (
    <main className="page page-photos" id="main">
      <h1 className="page-title">Photographs</h1>
      <hr className="rule" />

      {failed ? (
        <p className="form-error">
          The gallery can&rsquo;t be loaded just now. Please try again shortly.
        </p>
      ) : photos.length === 0 ? (
        <p className="prose empty-state">
          The gallery is still being put together.{" "}
          {imagesConfigured() ? (
            <>
              If you have photographs of Joe, <a href="#add">please send them</a>{" "}
              &mdash; they&rsquo;ll appear here.
            </>
          ) : (
            <>If you have photographs of Joe, there will be a way to add them shortly.</>
          )}
        </p>
      ) : (
        <Gallery
          photos={photos.map((p) => ({
            id: p.id,
            src: imageUrl(p.storage_ref),
            caption: p.caption,
            submitter: p.submitter,
          }))}
        />
      )}

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

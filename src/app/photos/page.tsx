import type { Metadata } from "next";
import Link from "next/link";
import Gallery from "./gallery";
import { getApprovedPhotos } from "@/lib/photos";
import { imageUrl, thumbUrl, imagesConfigured } from "@/lib/cf-images";

export const metadata: Metadata = { title: "Photographs" };

// Reads the database per request so a newly approved photo appears immediately.
export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  let photos: Awaited<ReturnType<typeof getApprovedPhotos>> = [];
  let failed = false;
  try {
    photos = await getApprovedPhotos();
  } catch (e) {
    // A database problem shouldn't take the page down — the gallery below still tries.
    console.error("Failed to load photos:", e);
    failed = true;
  }

  return (
    <main className="page page-photos" id="main">
      <h1 className="page-title">Photographs</h1>
      <hr className="rule" />

      <p className="jump-note">
        <Link href="/photos/add" className="btn-primary">
          Add More Photographs
        </Link>
      </p>

      <p className="muted-note">
        If some of the pictures are not loading, please hit your browser reload button.
      </p>

      {failed ? (
        <p className="form-error">
          The gallery can&rsquo;t be loaded just now. Please try again shortly.
        </p>
      ) : photos.length === 0 ? (
        <p className="prose empty-state">
          The gallery is still being put together.{" "}
          {imagesConfigured() ? (
            <>
              If you have photographs of Joe, <Link href="/photos/add">please send them</Link>{" "}
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
            thumb: thumbUrl(p.storage_ref),
            full: imageUrl(p.storage_ref),
            caption: p.caption,
            submitter: p.submitter,
          }))}
        />
      )}
    </main>
  );
}

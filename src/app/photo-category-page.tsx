import Link from "next/link";
import Gallery from "./photos/gallery";
import { getApprovedPhotos, type PhotoKind } from "@/lib/photos";
import { PHOTO_KIND_LABELS } from "@/lib/photo-kinds";
import { imageUrl, thumbUrl, imagesConfigured } from "@/lib/cf-images";

/**
 * One gallery page, parametrized by kind.
 *
 * Friends & Family, Camping, and Gigs are the same page in every respect that
 * matters to the code — same query, same Gallery component, same add flow —
 * and differ only in which rows they show and what the empty state says. A
 * fourth category is adding one entry to PHOTO_KINDS and one call to this
 * function, not a new page.
 */
export default async function PhotoCategoryPage({
  kind,
  intro,
}: {
  kind: PhotoKind;
  intro: string;
}) {
  const label = PHOTO_KIND_LABELS[kind];
  let photos: Awaited<ReturnType<typeof getApprovedPhotos>> = [];
  let failed = false;
  try {
    photos = await getApprovedPhotos(kind);
  } catch (e) {
    // A database problem shouldn't take the page down — the gallery below still tries.
    console.error(`Failed to load ${kind}:`, e);
    failed = true;
  }

  return (
    <main className="page page-photos" id="main">
      <h1 className="page-title">{label}</h1>
      <hr className="rule" />

      <p className="prose">{intro}</p>

      <div className="toolbar-row">
        <Link href={`/photos/add?kind=${kind}`} className="btn-primary">
          Add to this section
        </Link>
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
              If you have a photo or a memory for this section,{" "}
              <Link href={`/photos/add?kind=${kind}`}>please send it</Link> &mdash; it&rsquo;ll
              appear here.
            </>
          ) : (
            <>There will be a way to add things here shortly.</>
          )}
        </p>
      ) : (
        <Gallery
          photos={photos.map((p) => ({
            id: p.id,
            thumb: p.storage_ref ? thumbUrl(p.storage_ref) : null,
            full: p.storage_ref ? imageUrl(p.storage_ref) : null,
            bodyText: p.body_text,
            caption: p.caption,
            submitter: p.submitter,
            year: p.taken_year,
          }))}
        />
      )}
    </main>
  );
}

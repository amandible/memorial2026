import type { Metadata } from "next";
import PhotoCategoryPage from "../photo-category-page";
import { PHOTO_KIND_LABELS } from "@/lib/photo-kinds";

export const metadata: Metadata = { title: PHOTO_KIND_LABELS.music };

// Reads the database per request so a newly approved photo or recording appears immediately.
export const dynamic = "force-dynamic";

export default function MusicPage() {
  return (
    <PhotoCategoryPage
      kind="music"
      intro="Photos and recordings of Bill playing — including setlists."
    />
  );
}

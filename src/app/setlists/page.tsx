import type { Metadata } from "next";
import PhotoCategoryPage from "../photo-category-page";
import { PHOTO_KIND_LABELS } from "@/lib/photo-kinds";

export const metadata: Metadata = { title: PHOTO_KIND_LABELS.setlists };

// Reads the database per request so a newly approved photo appears immediately.
export const dynamic = "force-dynamic";

export default function SetlistsPage() {
  return <PhotoCategoryPage kind="setlists" intro="Photos of setlists." />;
}

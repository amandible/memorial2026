import type { Metadata } from "next";
import PhotoCategoryPage from "../photo-category-page";
import { PHOTO_KIND_LABELS } from "@/lib/photo-kinds";

export const metadata: Metadata = { title: PHOTO_KIND_LABELS["friends-family"] };

// Reads the database per request so a newly approved photo appears immediately.
export const dynamic = "force-dynamic";

export default function FriendsFamilyPage() {
  return (
    <PhotoCategoryPage kind="friends-family" intro="Photos of Bill with friends and family." />
  );
}

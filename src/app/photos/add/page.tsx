import type { Metadata } from "next";
import Link from "next/link";
import AddModeSwitch from "./mode-switch";
import { imagesConfigured } from "@/lib/cf-images";
import { musicStorageConfigured } from "@/lib/music-storage";
import { parseKind } from "@/lib/photos";
import { PHOTO_KIND_LABELS } from "@/lib/photo-kinds";

export const metadata: Metadata = { title: "Add" };

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

      <AddModeSwitch
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        defaultKind={defaultKind}
        imagesConfigured={imagesConfigured()}
        musicConfigured={musicStorageConfigured()}
      />
    </main>
  );
}

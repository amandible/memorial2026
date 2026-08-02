import type { Metadata } from "next";
import Link from "next/link";
import PhotoForm from "../form";
import { imagesConfigured } from "@/lib/cf-images";
import { parseKind } from "@/lib/photos";
import { ARTIFACTS_LABEL } from "@/lib/sections";

export const metadata: Metadata = { title: "Add Photographs" };

export default async function AddPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  // Arriving from the artifacts gallery preselects that kind, so the common
  // case needs no interaction. The toggle is still there per file, because a
  // batch off someone's phone is often a mix.
  const defaultKind = parseKind((await searchParams).kind);
  const fromArtifacts = defaultKind === "artifact";

  return (
    <main className="page" id="main">
      <h1 className="page-title">
        {fromArtifacts ? `Add to ${ARTIFACTS_LABEL.toLowerCase()}` : "Add photographs"}
      </h1>
      <hr className="rule" />

      <p className="jump-note">
        <Link href={fromArtifacts ? "/artifacts" : "/photos"}>
          &larr; Back to the gallery
        </Link>
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

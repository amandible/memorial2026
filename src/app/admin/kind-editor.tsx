"use client";

import { useState, useTransition } from "react";
import { setPhotoKind } from "./actions";

/**
 * Move a photograph between the photographs gallery and the artifacts one.
 *
 * A single toggle rather than the Edit/Save shape used by CaptionEditor and
 * YearEditor, because there are only two values and no way to typo one. Nothing
 * to confirm and nothing to get wrong — and it is reversible in one more click,
 * which is the reason it needs no confirmation step.
 */
export default function KindEditor({ id, kind }: { id: string; kind: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const isArtifact = kind === "artifact";

  return (
    <span className="mod-year-row">
      <span className="mod-year">{isArtifact ? "Artifact" : "Photograph"}</span>
      <button
        type="button"
        className="btn-quiet"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(false);
            try {
              await setPhotoKind(id, isArtifact ? "photo" : "artifact");
            } catch {
              setError(true);
            }
          })
        }
      >
        {pending ? "…" : isArtifact ? "Move to photographs" : "Move to artifacts"}
      </button>
      {error && <span className="mod-year-source">Didn&rsquo;t save</span>}
    </span>
  );
}

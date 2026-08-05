"use client";

import { useState, useTransition } from "react";
import { setPhotoKind } from "./actions";
import { PHOTO_KINDS, PHOTO_KIND_LABELS, type PhotoKind } from "@/lib/photo-kinds";

/**
 * Move a photograph between the three galleries.
 *
 * A plain select rather than a toggle, now that there are three values instead
 * of two — a button pair only reads unambiguously when there's exactly one
 * "other" option to switch to.
 */
export default function KindEditor({ id, kind }: { id: string; kind: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  return (
    <span className="mod-year-row">
      <select
        className="btn-quiet"
        value={kind}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setError(false);
          start(async () => {
            try {
              await setPhotoKind(id, next);
            } catch {
              setError(true);
            }
          });
        }}
      >
        {PHOTO_KINDS.map((k: PhotoKind) => (
          <option key={k} value={k}>
            {PHOTO_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      {pending && <span className="mod-year-source">…</span>}
      {error && <span className="mod-year-source">Didn&rsquo;t save</span>}
    </span>
  );
}

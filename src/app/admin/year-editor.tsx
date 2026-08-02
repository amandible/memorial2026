"use client";

import { useState, useTransition } from "react";
import { setPhotoYear } from "./actions";

/**
 * Edit the year a photograph was taken.
 *
 * Follows the same shape as CaptionEditor deliberately — read-only row with an
 * Edit button, swapping to an input — so the moderation grid has one interaction
 * pattern rather than two.
 *
 * Shows where the year came from, because that decides how much to trust it.
 * EXIF is right for a photo taken on a phone and sent directly, and confidently
 * wrong for a phone photograph *of* an old print — which is much of what a
 * memorial receives. That case is only fixable by someone who recognises the
 * picture, so it needs to be visible rather than silently authoritative.
 */
export default function YearEditor({
  id,
  year,
  source,
  exifTakenAt,
}: {
  id: string;
  year: number | null;
  source: string | null;
  exifTakenAt: Date | string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(year ? String(year) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const exifYear = exifTakenAt ? new Date(exifTakenAt).getUTCFullYear() : null;

  function save() {
    setError(null);
    start(async () => {
      try {
        await setPhotoYear(id, value);
        setEditing(false);
      } catch {
        setError("Not a plausible year");
      }
    });
  }

  if (!editing) {
    return (
      <span className="mod-year-row">
        {year ? (
          <span className="mod-year">
            {year}
            {source && <span className="mod-year-source"> from {source}</span>}
          </span>
        ) : (
          <span className="mod-year mod-caption-empty">No year</span>
        )}
        {/* Surface the file's own claim when it isn't what's being shown, so a
            wrong displayed year and a wrong file can be told apart. */}
        {exifYear && exifYear !== year && (
          <span className="mod-year-source">file says {exifYear}</span>
        )}
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setValue(year ? String(year) : "");
            setEditing(true);
          }}
        >
          Edit year
        </button>
      </span>
    );
  }

  return (
    <span className="mod-year-row">
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        className="year-input"
        placeholder={exifYear ? String(exifYear) : "e.g. 1978"}
        value={value}
        disabled={pending}
        autoFocus
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <button type="button" className="btn-quiet" disabled={pending} onClick={save}>
        {pending ? "…" : "Save"}
      </button>
      <button type="button" className="btn-quiet" disabled={pending} onClick={() => setEditing(false)}>
        Cancel
      </button>
      {/* Empty clears the year rather than reverting to EXIF — clearing usually
          means EXIF was the thing that was wrong. */}
      <span className="mod-year-source">{error ?? "blank to clear"}</span>
    </span>
  );
}

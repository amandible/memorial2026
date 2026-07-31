"use client";

import { useState, useTransition } from "react";
import { setPhotoCaption } from "./actions";

const MAX_CAPTION = 500;

export default function CaptionEditor({ id, caption }: { id: string; caption: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(caption ?? "");
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <span className="mod-caption-row">
        {caption ? (
          <span className="mod-caption">{caption}</span>
        ) : (
          <span className="mod-caption mod-caption-empty">No caption</span>
        )}
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setValue(caption ?? "");
            setEditing(true);
          }}
        >
          Edit caption
        </button>
      </span>
    );
  }

  return (
    <span className="mod-caption-row">
      <input
        type="text"
        className="mod-caption-input"
        maxLength={MAX_CAPTION}
        value={value}
        disabled={pending}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="button"
        className="btn-quiet"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setPhotoCaption(id, value);
            setEditing(false);
          })
        }
      >
        {pending ? "…" : "Save"}
      </button>
      <button type="button" className="btn-quiet" disabled={pending} onClick={() => setEditing(false)}>
        Cancel
      </button>
    </span>
  );
}

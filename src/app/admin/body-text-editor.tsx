"use client";

import { useState, useTransition } from "react";
import { setPhotoBodyText } from "./actions";

const MAX_BODY_TEXT = 5000;

/** Edit a typed memory's text. Mirrors CaptionEditor's shape — a textarea instead of an input. */
export default function BodyTextEditor({ id, bodyText }: { id: string; bodyText: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bodyText ?? "");
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <span className="mod-caption-row">
        <span className="mod-caption mod-text-body">{bodyText}</span>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setValue(bodyText ?? "");
            setEditing(true);
          }}
        >
          Edit text
        </button>
      </span>
    );
  }

  return (
    <span className="mod-caption-row">
      <textarea
        className="mod-caption-input mod-text-input"
        rows={6}
        maxLength={MAX_BODY_TEXT}
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
            await setPhotoBodyText(id, value);
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

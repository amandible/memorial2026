"use client";

import { useTransition } from "react";
import { setEntryStatus } from "./actions";

export default function EntryActions({
  id,
  status,
  name,
}: {
  id: string;
  status: "published" | "removed";
  name: string;
}) {
  const [pending, start] = useTransition();
  const removing = status === "published";

  return (
    <button
      type="button"
      className={removing ? "btn-quiet btn-danger" : "btn-quiet"}
      disabled={pending}
      onClick={() => {
        // Removing is reversible (status flip, not a delete), so a confirm is
        // enough — no undo stack needed.
        if (removing && !confirm(`Hide the message from ${name}? You can restore it.`)) return;
        start(() => {
          void setEntryStatus(id, removing ? "removed" : "published");
        });
      }}
    >
      {pending ? "…" : removing ? "Hide" : "Restore"}
    </button>
  );
}

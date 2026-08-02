"use client";

import { useTransition } from "react";
import { setArtifactFileStatus, purgeArtifactFile } from "./actions";

/**
 * Triage for archived files. Mirrors PhotoActions, but the words are different
 * on purpose: nothing here is on the site, so "Approve" would imply a publishing
 * step that doesn't exist. Keeping and discarding is all this decides.
 */
export default function FileActions({
  id,
  status,
}: {
  id: string;
  status: "pending" | "approved" | "rejected";
}) {
  const [pending, start] = useTransition();

  return (
    <div className="photo-actions">
      {status !== "approved" && (
        <button
          type="button"
          className="btn-quiet"
          disabled={pending}
          onClick={() => start(() => void setArtifactFileStatus(id, "approved"))}
        >
          {pending ? "…" : "Keep"}
        </button>
      )}
      {status !== "rejected" && (
        <button
          type="button"
          className="btn-quiet btn-danger"
          disabled={pending}
          onClick={() => start(() => void setArtifactFileStatus(id, "rejected"))}
        >
          Not wanted
        </button>
      )}
      {status === "rejected" && (
        <>
          <button
            type="button"
            className="btn-quiet"
            disabled={pending}
            onClick={() => start(() => void setArtifactFileStatus(id, "pending"))}
          >
            Undo
          </button>
          {/* The only irreversible action here — it removes the object from R2,
              and this is the only copy. */}
          <button
            type="button"
            className="btn-quiet btn-danger"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this file for good? This is the only copy.")) return;
              start(() => void purgeArtifactFile(id));
            }}
          >
            Delete for good
          </button>
        </>
      )}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { setPhotoStatus, purgePhoto } from "./actions";

export default function PhotoActions({
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
          onClick={() => start(() => void setPhotoStatus(id, "approved"))}
        >
          {pending ? "…" : "Approve"}
        </button>
      )}
      {status !== "rejected" && (
        <button
          type="button"
          className="btn-quiet btn-danger"
          disabled={pending}
          onClick={() => start(() => void setPhotoStatus(id, "rejected"))}
        >
          {status === "approved" ? "Remove" : "Reject"}
        </button>
      )}
      {status === "rejected" && (
        <>
          <button
            type="button"
            className="btn-quiet"
            disabled={pending}
            onClick={() => start(() => void setPhotoStatus(id, "pending"))}
          >
            Undo
          </button>
          {/* Only offered for rejected photos, and it is the one irreversible
              action in the admin — it deletes from Cloudflare Images too. */}
          <button
            type="button"
            className="btn-quiet btn-danger"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this photograph for good? This cannot be undone.")) return;
              start(() => void purgePhoto(id));
            }}
          >
            Delete for good
          </button>
        </>
      )}
    </div>
  );
}

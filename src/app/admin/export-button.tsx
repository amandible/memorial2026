"use client";

import { useState } from "react";
import { exportContactsCsv } from "./actions";

/**
 * Download the mailing list as CSV.
 *
 * Builds the file in the browser from the server action's string rather than
 * serving it from a route, so the data never sits at a URL that could be
 * fetched by anything holding a stale cookie.
 */
export default function ExportButton({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const csv = await exportContactsCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      // Dated, because you will end up with several of these.
      a.download = `billmelanson-mailing-list-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("CSV export failed:", e);
      setError("Couldn't build the file. Try reloading and signing in again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export">
      <button type="button" className="btn-quiet" onClick={download} disabled={busy || count === 0}>
        {busy ? "Preparing…" : `Download ${count} address${count === 1 ? "" : "es"} as CSV`}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted-note">
        Send with everyone in <strong>BCC</strong>, never CC &mdash; CC would show every
        mourner&rsquo;s address to every other mourner.
      </p>
    </div>
  );
}

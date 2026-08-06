"use client";

import { useState } from "react";
import PhotoForm from "../form";
import TextMemoryForm from "../text-memory-form";
import type { PhotoKind } from "@/lib/photo-kinds";

/**
 * Toggle between sending a photo and typing a memory.
 *
 * Only one of PhotoForm/TextMemoryForm is ever mounted at a time — not just a
 * styling choice. Each renders its own Cloudflare Turnstile widget, and that
 * widget places a hidden `cf-turnstile-response` input wherever it renders;
 * both forms read the token back with a plain document-wide lookup, which
 * only works unambiguously when exactly one widget exists in the page.
 */
export default function AddModeSwitch({
  siteKey,
  defaultKind,
  imagesConfigured,
}: {
  siteKey?: string;
  defaultKind: PhotoKind;
  imagesConfigured: boolean;
}) {
  const [mode, setMode] = useState<"photo" | "text">("photo");

  return (
    <>
      <div className="mode-tabs" role="tablist" aria-label="How to add this">
        <button
          type="button"
          role="tab"
          className={mode === "photo" ? "btn-primary" : "btn-quiet"}
          aria-selected={mode === "photo"}
          onClick={() => setMode("photo")}
        >
          Send a photo
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "text" ? "btn-primary" : "btn-quiet"}
          aria-selected={mode === "text"}
          onClick={() => setMode("text")}
        >
          Send text instead
        </button>
      </div>

      {mode === "photo" ? (
        imagesConfigured ? (
          <PhotoForm siteKey={siteKey} defaultKind={defaultKind} />
        ) : (
          <section id="add" className="add-entry">
            <h2>Send your photos</h2>
            <p className="prose">
              Photo submissions aren&rsquo;t open quite yet. If you have pictures of
              Bill, please start looking them out &mdash; or send them now to{" "}
              <a href="mailto:contact@billmelanson.org">contact@billmelanson.org</a>.
            </p>
          </section>
        )
      ) : (
        <TextMemoryForm siteKey={siteKey} defaultKind={defaultKind} />
      )}
    </>
  );
}

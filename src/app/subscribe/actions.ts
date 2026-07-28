"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";

export type SubscribeState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

// Deliberately permissive. The job is to catch typos and obvious nonsense, not to
// adjudicate RFC 5322 — a real address that a strict regex rejects is a person
// who doesn't hear about the service.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_EMAIL = 320;
const MAX_NAME = 120;
const MAX_NOTE = 500;

export async function subscribe(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  // Honeypot: a field hidden from people but filled in by naive bots.
  if ((formData.get("website") as string | null)?.trim()) {
    // Report success so the bot learns nothing. Nothing is written.
    return { status: "ok", message: "Thank you — we'll be in touch when there's news." };
  }

  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const note = (formData.get("note") as string | null)?.trim() ?? "";

  if (!email) return { status: "error", message: "Please enter an email address." };
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) {
    return { status: "error", message: "That doesn't look like an email address — please check it." };
  }
  if (name.length > MAX_NAME || note.length > MAX_NOTE) {
    return { status: "error", message: "That's longer than we can store. Please shorten it." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const check = await verifyTurnstile(
    formData.get("cf-turnstile-response") as string | null,
    ip,
  );
  if (!check.ok) return { status: "error", message: check.error };

  try {
    // on conflict do nothing: signing up twice is a silent success, never an error.
    // The unique index is on lower(email), so case doesn't create duplicates.
    await db()`
      insert into contacts (email, name, note)
      values (${email}, ${name || null}, ${note || null})
      on conflict do nothing
    `;
  } catch (e) {
    console.error("Failed to record a contact:", e);
    return {
      status: "error",
      message:
        "Something went wrong saving that. Please try again, or write to contact@joeweisman.org.",
    };
  }

  return { status: "ok", message: "Thank you — we'll be in touch when there's news." };
}

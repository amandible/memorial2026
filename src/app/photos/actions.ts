"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/ip";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  createDirectUpload,
  imagesConfigured,
  newUploadHandle,
  verifyUploadHandle,
} from "@/lib/cf-images";

export type Ticket = { id: string; uploadURL: string; handle: string; expiresAt: number };

export type RequestResult =
  | { ok: true; tickets: Ticket[] }
  | { ok: false; error: string };

/** Per submission, and per IP per hour. Generous, but not unbounded. */
const MAX_PER_SUBMISSION = 12;
const HOURLY_LIMIT = 40;
const MAX_CAPTION = 500;
const MAX_NAME = 120;
const MAX_EMAIL = 320;

/**
 * Step one: prove you're a person, get upload URLs.
 *
 * Turnstile is checked here rather than at recording time, so a bot can't even
 * obtain somewhere to upload to. "deny" on outage — these end up on a public
 * page once approved.
 */
export async function requestUploads(
  count: number,
  turnstileToken: string | null,
): Promise<RequestResult> {
  if (!imagesConfigured()) {
    console.error("Cloudflare Images is not configured — refusing uploads.");
    return { ok: false, error: "Photo uploads aren't available just now. Please try again later." };
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_PER_SUBMISSION) {
    return { ok: false, error: `Please choose between 1 and ${MAX_PER_SUBMISSION} photos at a time.` };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  const check = await verifyTurnstile(turnstileToken, ip, "deny");
  if (!check.ok) return { ok: false, error: check.error ?? "Verification failed." };

  try {
    const [row] = (await db()`
      select count(*)::int as n from photos
      where ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
    `) as { n: number }[];
    if ((row?.n ?? 0) + count > HOURLY_LIMIT) {
      return {
        ok: false,
        error: "That's a lot of photos in a short time. Please come back in a little while, or write to contact@joeweisman.org.",
      };
    }

    const tickets: Ticket[] = [];
    for (let i = 0; i < count; i++) {
      const { id, uploadURL } = await createDirectUpload();
      const { handle, expiresAt } = newUploadHandle(id);
      tickets.push({ id, uploadURL, handle, expiresAt });
    }
    return { ok: true, tickets };
  } catch (e) {
    console.error("Failed to create direct uploads:", e);
    return { ok: false, error: "Something went wrong starting the upload. Please try again." };
  }
}

export type Submission = {
  id: string;
  handle: string;
  expiresAt: number;
  caption: string;
};

/**
 * Step two: record the photos that uploaded successfully.
 *
 * Each entry must carry the signed handle issued in step one, so this cannot be
 * called with arbitrary image ids by anything that skipped the form.
 */
export async function recordPhotos(
  submissions: Submission[],
  submitter: string,
  email: string,
): Promise<{ ok: boolean; saved: number; error?: string }> {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return { ok: false, saved: 0, error: "No photos to save." };
  }
  if (submissions.length > MAX_PER_SUBMISSION) {
    return { ok: false, saved: 0, error: "Too many photos in one submission." };
  }

  const name = submitter.trim().slice(0, MAX_NAME);
  const mail = email.trim().slice(0, MAX_EMAIL);

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  let saved = 0;
  for (const s of submissions) {
    if (!verifyUploadHandle(s.id, s.expiresAt, s.handle)) {
      console.warn("Rejected a photo submission with an invalid handle:", s.id);
      continue;
    }
    try {
      await db()`
        insert into photos (submitter, email, caption, storage_ref, status, ip_hash)
        values (${name || null}, ${mail || null},
                ${s.caption.trim().slice(0, MAX_CAPTION) || null},
                ${s.id}, 'pending', ${ipHash})
      `;
      saved++;
    } catch (e) {
      console.error("Failed to record photo", s.id, e);
    }
  }

  if (saved === 0) {
    return { ok: false, saved: 0, error: "Those photos couldn't be saved. Please try again." };
  }

  revalidatePath("/admin");
  return { ok: true, saved };
}

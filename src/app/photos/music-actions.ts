"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { notifyMusicSubmission } from "@/lib/notify";
import { presignPut, musicStorageConfigured } from "@/lib/music-storage";
import { isAllowedMusicExtension } from "@/lib/music";
import { safeFilename } from "@/lib/artifact-files";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/ip";
import { verifyTurnstile } from "@/lib/turnstile";
import { parseKind } from "@/lib/photos";
import { newUploadHandle, verifyUploadHandle } from "@/lib/upload-handle";

const MAX_CAPTION = 500;
const MAX_NAME = 120;
const MAX_EMAIL = 320;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
/** Same hourly ceiling as the other two add-modes — same table, same abuse surface. */
const HOURLY_LIMIT = 40;

export type RequestResult =
  | { ok: true; storageKey: string; uploadURL: string; handle: string; expiresAt: number }
  | { ok: false; error: string };

/** Where a recording lands in the public bucket. Generated here, never sender-supplied. */
function newMusicStorageKey(filename: string): string {
  return `music/${randomUUID()}-${safeFilename(filename)}`;
}

/**
 * Step one: prove you're a person, get somewhere to upload to.
 *
 * Same two-step shape as photos/artifact files (Turnstile verified before a
 * write-capable URL is issued, then a signed handle proves step two's record
 * came from this request) — unlike a typed memory, there's a real file here,
 * so the reasons for that shape still apply. Only one file per submission,
 * unlike the batch photo form, so there's exactly one ticket, not an array.
 */
export async function requestMusicUpload(
  filename: string,
  size: number,
  turnstileToken: string | null,
): Promise<RequestResult> {
  if (!musicStorageConfigured()) {
    console.error("Music storage is not configured — refusing uploads.");
    return { ok: false, error: "Sending recordings isn't available just now. Please try again later." };
  }
  if (!isAllowedMusicExtension(filename)) {
    return {
      ok: false,
      error: "That doesn't look like an audio or video file. Please email it to contact@billmelanson.org instead.",
    };
  }
  if (!Number.isFinite(size) || size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "That file is too large to send through the form. Please email it to contact@billmelanson.org instead.",
    };
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
    if ((row?.n ?? 0) >= HOURLY_LIMIT) {
      return {
        ok: false,
        error: "That's a lot in a short time. Please come back in a little while, or write to contact@billmelanson.org.",
      };
    }

    const storageKey = newMusicStorageKey(filename);
    const uploadURL = await presignPut(storageKey);
    const { handle, expiresAt } = newUploadHandle(storageKey);
    return { ok: true, storageKey, uploadURL, handle, expiresAt };
  } catch (e) {
    console.error("Failed to start a music upload:", e);
    return { ok: false, error: "Something went wrong starting the upload. Please try again." };
  }
}

export type RecordResult = { ok: true } | { ok: false; error: string };

/**
 * Step two: record a recording that uploaded successfully.
 *
 * The signed handle proves storageKey came from a Turnstile-verified
 * request in step one, so this cannot be called with an arbitrary bucket
 * key by anything that skipped it. Unlike photos/text memories, the file is
 * already public the moment this row exists — see notifyMusicSubmission's
 * comment.
 */
export async function recordMusic(
  kind: string,
  title: string,
  storageKey: string,
  handle: string,
  expiresAt: number,
  filename: string,
  submitter: string,
  email: string,
): Promise<RecordResult> {
  if (!verifyUploadHandle(storageKey, expiresAt, handle)) {
    return { ok: false, error: "That upload wasn't recognised. Please try again." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  const trimmedTitle = title.trim().slice(0, MAX_CAPTION) || null;
  const name = submitter.trim().slice(0, MAX_NAME) || null;
  const mail = email.trim().slice(0, MAX_EMAIL) || null;
  const trimmedFilename = filename.slice(0, 255) || "file";

  try {
    await db()`
      insert into photos (submitter, email, caption, media_key, media_filename, status, ip_hash, kind)
      values (${name}, ${mail}, ${trimmedTitle}, ${storageKey}, ${trimmedFilename}, 'pending', ${ipHash}, ${parseKind(kind)})
    `;
  } catch (e) {
    console.error("Failed to record music submission:", e);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  revalidatePath("/admin");

  after(() =>
    notifyMusicSubmission({ submitter: name, email: mail, title: trimmedTitle, filename: trimmedFilename }),
  );

  return { ok: true };
}

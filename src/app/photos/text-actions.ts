"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { notifyTextMemory } from "@/lib/notify";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/ip";
import { verifyTurnstile } from "@/lib/turnstile";
import { parseKind } from "@/lib/photos";

const MAX_CAPTION = 500;
const MAX_BODY_TEXT = 5000;
const MAX_NAME = 120;
const MAX_EMAIL = 320;
/** Same hourly ceiling as photo submissions — same table, same abuse surface. */
const HOURLY_LIMIT = 40;

export type TextMemoryResult = { ok: true } | { ok: false; error: string };

/**
 * Submit a typed memory — a setlist, lyrics, a written recollection — with no
 * file at all.
 *
 * A single step, unlike the photo/file upload flow's request-then-record
 * pair. That two-step dance exists to get bytes past Vercel's body-size
 * limits and to stop a forged record pointing at an arbitrary storage key —
 * neither applies here, since there is nothing to upload.
 */
export async function submitTextMemory(
  kind: string,
  title: string,
  body: string,
  submitter: string,
  email: string,
  turnstileToken: string | null,
): Promise<TextMemoryResult> {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return { ok: false, error: "Please write something before sending." };
  }
  if (trimmedBody.length > MAX_BODY_TEXT) {
    return { ok: false, error: `That's longer than we can store — ${MAX_BODY_TEXT.toLocaleString()} characters is the limit.` };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  const check = await verifyTurnstile(turnstileToken, ip, "deny");
  if (!check.ok) return { ok: false, error: check.error ?? "Verification failed." };

  const trimmedTitle = title.trim().slice(0, MAX_CAPTION) || null;
  const name = submitter.trim().slice(0, MAX_NAME) || null;
  const mail = email.trim().slice(0, MAX_EMAIL) || null;

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

    await db()`
      insert into photos (submitter, email, caption, body_text, status, ip_hash, kind)
      values (${name}, ${mail}, ${trimmedTitle}, ${trimmedBody}, 'pending', ${ipHash}, ${parseKind(kind)})
    `;
  } catch (e) {
    console.error("Failed to record text memory:", e);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  revalidatePath("/admin");

  after(() =>
    notifyTextMemory({ submitter: name, email: mail, title: trimmedTitle, body: trimmedBody }),
  );

  return { ok: true };
}

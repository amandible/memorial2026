import { headers } from "next/headers";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/ip";

/**
 * Record that an upload failed in someone's browser.
 *
 * Deliberately unauthenticated: the whole point is to hear from people who
 * cannot get past the verification, so requiring a verified submission to
 * report a failed verification would be circular.
 *
 * That makes it writable by anyone, so it is built to be worth nothing to abuse:
 * it stores no free text from the caller beyond a short bounded `detail`, holds
 * no personal data, is rate-limited per IP, and nothing renders it except the
 * admin page. Worst case is a spammed diagnostics table, which is a nuisance and
 * not a breach — and `delete from upload_trouble` fixes it.
 */

const STAGES = new Set(["verify", "tickets", "upload", "record"]);
const MAX_DETAIL = 200;
const MAX_UA = 400;
/** Per IP per hour. A stuck person retrying earnestly won't reach this. */
const HOURLY_LIMIT = 40;

export async function POST(req: Request) {
  // Always 204, whatever happens. A visitor already failing to upload must not
  // also see an error from the thing reporting it, and an attacker learns
  // nothing about what got through.
  const ok = () => new Response(null, { status: 204 });

  try {
    const body = (await req.json()) as {
      stage?: unknown;
      detail?: unknown;
      files?: unknown;
    };

    const stage = String(body.stage ?? "");
    if (!STAGES.has(stage)) return ok();

    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ipHash = hashIp(ip);

    const [row] = (await db()`
      select count(*)::int as n from upload_trouble
      where ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
    `) as { n: number }[];
    if ((row?.n ?? 0) >= HOURLY_LIMIT) return ok();

    const files = Number(body.files);

    await db()`
      insert into upload_trouble (stage, detail, files, user_agent, ip_hash)
      values (
        ${stage},
        ${String(body.detail ?? "").slice(0, MAX_DETAIL) || null},
        ${Number.isInteger(files) && files >= 0 && files < 1000 ? files : null},
        ${(hdrs.get("user-agent") ?? "").slice(0, MAX_UA) || null},
        ${ipHash}
      )
    `;
  } catch (e) {
    // Including a malformed body, or the table not existing yet.
    console.error("Could not record an upload failure:", e);
  }

  return ok();
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkPassword, grantSession, revokeSession, isAdmin } from "@/lib/admin-auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = (formData.get("password") as string | null) ?? "";
  if (!checkPassword(password)) {
    // Deliberately vague: no hint about whether the password store is even set up.
    return { error: "That password isn't right." };
  }
  await grantSession();
  revalidatePath("/admin");
  return {};
}

export async function logout(): Promise<void> {
  await revokeSession();
  revalidatePath("/admin");
}

/**
 * Hide or restore a guestbook entry.
 *
 * Sets status rather than deleting: a removal made in haste, or a mistaken one,
 * should be reversible. Purging is a deliberate act done in the database.
 */
export async function setEntryStatus(id: string, status: "published" | "removed"): Promise<void> {
  // Every action re-checks. The page-level gate is not the security boundary —
  // server actions are callable directly by anyone who knows the endpoint.
  if (!(await isAdmin())) throw new Error("Not authorised.");

  await db()`update guestbook_entries set status = ${status} where id = ${id}::uuid`;
  revalidatePath("/admin");
  revalidatePath("/guestbook");
}

export async function exportContactsCsv(): Promise<string> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const rows = (await db()`
    select email, name, note, created_at, removed_at
    from contacts
    where removed_at is null
    order by created_at
  `) as { email: string; name: string | null; note: string | null; created_at: Date }[];

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return [
    "email,name,note,created_at",
    ...rows.map((r) => [r.email, r.name, r.note, r.created_at.toISOString()].map(esc).join(",")),
  ].join("\n");
}

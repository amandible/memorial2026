import type { Metadata } from "next";
import Link from "next/link";
import GuestbookForm from "../form";

export const metadata: Metadata = { title: "Add a message" };

export default function AddGuestbookPage() {
  return (
    <main className="page" id="main">
      <h1 className="page-title">Add a message</h1>
      <hr className="rule" />

      <p className="jump-note">
        <Link href="/guestbook">&larr; Back to the guestbook</Link>
      </p>

      <GuestbookForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
    </main>
  );
}

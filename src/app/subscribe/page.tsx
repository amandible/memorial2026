import type { Metadata } from "next";
import SubscribeForm from "./form";

export const metadata: Metadata = { title: "Stay in touch" };

export default function SubscribePage() {
  return (
    <main className="page" id="main">
      <h1 className="page-title">Stay in touch</h1>
      <hr className="rule" />
      <div className="prose">
        <p>
          Leave your address and we&rsquo;ll write when the service details are
          confirmed, and when the photographs and guestbook open.
        </p>
        <p>
          It will be occasional &mdash; a handful of messages, not a mailing list
          you need to escape from. Reply to any of them to be taken off.
        </p>
      </div>

      <SubscribeForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />

      <p className="contact-note">
        Would rather just write to someone?{" "}
        <a href="mailto:contact@joeweisman.org">contact@joeweisman.org</a>.
      </p>
    </main>
  );
}

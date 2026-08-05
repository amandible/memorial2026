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
          Leave your address and we will write when the service details are
          confirmed.
        </p>
        <p>
          Rest assured, you are signing up for only a handful of messages. You
          can reply to any of them to ask to be taken off the list.
        </p>
      </div>

      <SubscribeForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />

      <p className="contact-note">
        Would you rather just write to someone?{" "}
        <a href="mailto:contact@billmelanson.org">contact@billmelanson.org</a>.
      </p>
    </main>
  );
}

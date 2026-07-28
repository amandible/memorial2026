import type { Metadata } from "next";
import Placeholder from "../placeholder";

export const metadata: Metadata = { title: "Stay in touch" };

export default function SubscribePage() {
  return (
    <Placeholder title="Stay in touch">
      <p>
        A form will be here shortly for leaving your email address, so we can
        tell you when the service details are confirmed and when the photographs
        and guestbook are open.
      </p>
      <p>
        It will be occasional — a handful of messages, not a mailing list you
        need to escape from.
      </p>
    </Placeholder>
  );
}

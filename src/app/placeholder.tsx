import type { ReactNode } from "react";

/**
 * A section that exists but isn't built yet.
 *
 * Says plainly what will be here and when, rather than "coming soon" — a visitor
 * who came looking for the service time needs to know whether to check back or
 * write to someone.
 */
export default function Placeholder({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="page" id="main">
      <h1 className="page-title">{title}</h1>
      <hr className="rule" />
      <div className="prose">{children}</div>
      <p className="contact-note">
        In the meantime, you can write to{" "}
        <a href="mailto:contact@billmelanson.org">contact@billmelanson.org</a>.
      </p>
    </main>
  );
}

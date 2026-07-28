import type { Metadata } from "next";
import Placeholder from "../placeholder";

export const metadata: Metadata = { title: "Guestbook" };

export default function GuestbookPage() {
  return (
    <Placeholder title="Guestbook">
      <p>
        There will be a place here to leave a memory of Joe, for his family and
        for everyone else who knew him to read.
      </p>
      <p>It will be open shortly.</p>
    </Placeholder>
  );
}

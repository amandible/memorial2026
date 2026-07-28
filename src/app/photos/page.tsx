import type { Metadata } from "next";
import Placeholder from "../placeholder";

export const metadata: Metadata = { title: "Photographs" };

export default function PhotosPage() {
  return (
    <Placeholder title="Photographs">
      <p>
        A gallery of photographs of Joe is being put together, and there will be
        a way to add your own here shortly — photographs sent in before the
        service can be part of the day itself.
      </p>
      <p>
        If you have pictures of him, please start looking them out. Anything at
        all: the boat, the commune, the sauna, a kitchen he improved, a project
        he talked you into.
      </p>
    </Placeholder>
  );
}

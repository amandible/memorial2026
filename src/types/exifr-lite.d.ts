/**
 * Types for exifr's lite build, which ships no declarations of its own.
 *
 * The package's own types cover the default entry point (the full 74 KB build).
 * The submission form imports the lite build directly instead — it still reads
 * HEIC, which is what most of these photographs are, at a little over half the
 * size — and that deep path has no types attached to it.
 *
 * Only the two functions actually used are declared, so a typo in a third goes
 * on being a compile error rather than silently `any`.
 */
declare module "exifr/dist/lite.esm.mjs" {
  /**
   * Read tags. Resolves undefined when the file carries no metadata.
   *
   * Note there is deliberately no `pick` here. It exists in exifr's API, but it
   * resolves tag names through a dictionary the lite build doesn't ship, so
   * passing it throws on every file. Leaving it out of this declaration means
   * reintroducing it is a compile error rather than a silent runtime failure.
   */
  export function parse(
    input: Blob | ArrayBuffer | Uint8Array,
    options?: {
      ifd0?: boolean;
      exif?: boolean;
      gps?: boolean;
      reviveValues?: boolean;
    },
  ): Promise<Record<string, unknown> | undefined>;

  /** Object URL for the thumbnail embedded in the file, if it has one. */
  export function thumbnailUrl(input: Blob | ArrayBuffer | Uint8Array): Promise<string | undefined>;
}

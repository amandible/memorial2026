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
  /** Read selected tags. Resolves undefined when the file carries no metadata. */
  export function parse(
    input: Blob | ArrayBuffer | Uint8Array,
    options?: { pick?: string[]; reviveValues?: boolean },
  ): Promise<Record<string, unknown> | undefined>;

  /** Object URL for the thumbnail embedded in the file, if it has one. */
  export function thumbnailUrl(input: Blob | ArrayBuffer | Uint8Array): Promise<string | undefined>;
}

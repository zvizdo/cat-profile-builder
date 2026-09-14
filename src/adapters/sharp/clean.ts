import "server-only";
import sharp from "sharp";
import { decode } from "./decode";

// The clean derivative (ADR-007, ADR-015 → Layout; FR-009): the one file a public page
// ever loads for a photo. Every piece of metadata — EXIF with its GPS block, ICC, XMP —
// is dropped: sharp writes none unless asked, and nothing here asks.

/** The longest edge a clean photo keeps, in pixels (ADR-015). */
export const CLEAN_LONG_EDGE = 2560;

/** JPEG quality of the clean derivative. */
export const CLEAN_QUALITY = 88;

/** The clean JPEG and its pixel size. */
export interface CleanPhoto {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Turns an uploaded photo into its clean derivative: the EXIF orientation baked into the
 * pixels, every tag stripped, sRGB, the long edge capped at {@link CLEAN_LONG_EDGE} without
 * ever enlarging, saved as a JPEG at quality {@link CLEAN_QUALITY}. A file that will not
 * decode — truncated, corrupt — is refused as `unsupported` and nothing is produced.
 */
export async function cleanPhoto(bytes: Uint8Array): Promise<CleanPhoto> {
  const { data, info } = await decode(() =>
    sharp(bytes)
      .rotate()
      .toColorspace("srgb")
      .resize({
        width: CLEAN_LONG_EDGE,
        height: CLEAN_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: CLEAN_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }),
  );
  return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}

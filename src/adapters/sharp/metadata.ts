import "server-only";
import sharp from "sharp";
import { decode } from "./decode";

/** A photo's size in pixels as it displays, with any EXIF orientation applied. */
export interface ImageMetadata {
  width: number;
  height: number;
}

/**
 * Reads the displayed size of a photo (ADR-005 step 3 — "reads dimensions with sharp").
 * A phone held upright stores landscape pixels with an orientation tag; the size reported
 * here is the upright one, the same the clean derivative will have. Bytes that are not an
 * image sharp can open are refused as `unsupported`.
 */
export async function readImageMetadata(bytes: Uint8Array): Promise<ImageMetadata> {
  const { autoOrient } = await decode(() => sharp(bytes).metadata());
  return { width: autoOrient.width, height: autoOrient.height };
}

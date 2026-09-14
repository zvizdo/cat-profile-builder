import jsQR from "jsqr";
import { PNG } from "pngjs";

// What a phone would read from the QR card (FR-088): the symbol decoded from a PNG
// screenshot of the card's `<svg>`.

/** The QR's payload in `png`, or `null` when no symbol decodes. */
export function decodeQr(png: Buffer): string | null {
  const image = PNG.sync.read(png);
  const code = jsQR(new Uint8ClampedArray(image.data.buffer), image.width, image.height);
  return code === null ? null : code.data;
}

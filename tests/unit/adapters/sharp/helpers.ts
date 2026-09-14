import { readFileSync } from "node:fs";
import sharp from "sharp";

// What the sharp adapter tests share: the committed fixtures, a generated JPEG with GPS
// coordinates and an orientation tag (the kind a phone writes), and a reader for the tags
// of an EXIF block, so a test can prove GPS was there before and gone after.

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
}

/** The tag that points at the GPS IFD (`GPSInfo`, `0x8825`) — present iff the file has GPS data. */
export const GPS_IFD_TAG = 0x8825;

/**
 * A 100×60 red JPEG carrying GPS coordinates and EXIF orientation 6 (rotate 90° clockwise),
 * so it displays as 60×100 — the shape a phone held upright produces.
 */
export async function gpsPhoto(): Promise<Uint8Array> {
  const bytes = await sharp({ create: { width: 100, height: 60, channels: 3, background: "#c00" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "Test" },
      IFD3: {
        GPSLatitude: "45/1 30/1 0/1",
        GPSLatitudeRef: "N",
        GPSLongitude: "14/1 30/1 0/1",
        GPSLongitudeRef: "E",
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return new Uint8Array(bytes);
}

/** The tag ids in IFD0 of an EXIF block as sharp returns it (`Exif\0\0` + TIFF). */
export function ifd0Tags(exif: Buffer): number[] {
  const tiff = exif.subarray(6);
  const little = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const ifd0 = u32(4);
  const count = u16(ifd0);
  const tags: number[] = [];
  for (let i = 0; i < count; i += 1) tags.push(u16(ifd0 + 2 + i * 12));
  return tags;
}

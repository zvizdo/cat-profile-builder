import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readImageMetadata } from "@/adapters/sharp/metadata";
import { UnsupportedError } from "@/core/errors";
import { fixture, gpsPhoto, GPS_IFD_TAG, ifd0Tags } from "./helpers";

describe("readImageMetadata", () => {
  it("reads the pixel size of a fixture", async () => {
    expect(await readImageMetadata(fixture("cat-1.jpg"))).toEqual({ width: 1600, height: 1205 });
    expect(await readImageMetadata(fixture("small.jpg"))).toEqual({ width: 640, height: 850 });
  });

  it("reports the size as displayed, with the EXIF orientation applied", async () => {
    const photo = await gpsPhoto();
    const raw = await sharp(photo).metadata();
    expect(raw.width).toBe(100);
    expect(ifd0Tags(raw.exif as Buffer)).toContain(GPS_IFD_TAG);
    expect(await readImageMetadata(photo)).toEqual({ width: 60, height: 100 });
  });

  it("refuses bytes that are not an image as unsupported, with the decoder's error kept as cause", async () => {
    const failure = readImageMetadata(new TextEncoder().encode("not an image"));
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    await expect(failure).rejects.toMatchObject({
      message: expect.stringContaining("We can't read that file."),
      cause: expect.any(Error),
    });
  });
});

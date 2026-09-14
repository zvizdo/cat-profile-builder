import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cleanPhoto } from "@/adapters/sharp/clean";
import { UnsupportedError } from "@/core/errors";
import { fixture, gpsPhoto, GPS_IFD_TAG, ifd0Tags } from "./helpers";

// The clean derivative (ADR-007, ADR-015; FR-009): EXIF rotation applied, every piece of
// metadata gone, sRGB, long edge capped at 2560, JPEG.

describe("cleanPhoto", () => {
  it("strips the GPS data and every other tag, and bakes the orientation in", async () => {
    const input = await gpsPhoto();
    expect(ifd0Tags((await sharp(input).metadata()).exif as Buffer)).toContain(GPS_IFD_TAG);

    const clean = await cleanPhoto(input);
    const meta = await sharp(clean.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.format).toBe("jpeg");
    expect(meta.space).toBe("srgb");
    expect([meta.width, meta.height]).toEqual([60, 100]);
    expect(clean).toMatchObject({ width: 60, height: 100 });
  });

  it("leaves a photo under the cap at its size and reports it", async () => {
    const clean = await cleanPhoto(fixture("cat-1.jpg"));
    expect(clean).toMatchObject({ width: 1600, height: 1205 });
    expect(await sharp(clean.bytes).metadata()).toMatchObject({ width: 1600, height: 1205 });
  });

  it("caps the long edge at 2560 without enlarging anything", async () => {
    const wide = await sharp({
      create: { width: 4000, height: 1000, channels: 3, background: "#0c0" },
    })
      .png()
      .toBuffer();
    const clean = await cleanPhoto(new Uint8Array(wide));
    expect(clean).toMatchObject({ width: 2560, height: 640 });
    expect((await sharp(clean.bytes).metadata()).format).toBe("jpeg");
  });

  it("refuses a truncated file as unsupported rather than writing a broken derivative", async () => {
    const failure = cleanPhoto(fixture("cat-1.jpg").slice(0, 4000));
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    await expect(failure).rejects.toMatchObject({ cause: expect.any(Error) });
  });
});

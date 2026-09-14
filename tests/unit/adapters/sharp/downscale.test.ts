import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { downscaleForModel } from "@/adapters/sharp/downscale";
import { fixture } from "./helpers";

// What the describer receives: a JPEG no longer than 768 px on its long edge, never the
// original (ADR-005 step 5).

describe("downscaleForModel", () => {
  it("brings a 1600 px photo down to 768 px on the long edge as a JPEG", async () => {
    const small = await downscaleForModel(fixture("cat-1.jpg"));
    const meta = await sharp(small).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 768, height: 578 });
    expect(meta.exif).toBeUndefined();
    expect(small.byteLength).toBeLessThan(fixture("cat-1.jpg").byteLength);
  });

  it("judges the long edge, so a tall 640×850 photo comes down to 768 high", async () => {
    const small = await downscaleForModel(fixture("small.jpg"));
    expect(await sharp(small).metadata()).toMatchObject({ width: 578, height: 768 });
  });

  it("does not enlarge a photo already under 768 px", async () => {
    const tiny = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#00c" },
    })
      .jpeg()
      .toBuffer();
    const small = await downscaleForModel(new Uint8Array(tiny));
    expect(await sharp(small).metadata()).toMatchObject({ width: 300, height: 200 });
  });
});

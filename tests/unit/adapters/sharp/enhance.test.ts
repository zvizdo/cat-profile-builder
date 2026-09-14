import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { enhance } from "@/adapters/sharp/enhance";
import { UnsupportedError } from "@/core/errors";
import { fixture } from "./helpers";

// The `auto-v1` recipe (ADR-016): `normalise()` → `modulate({ brightness: 1.03,
// saturation: 1.08 })` → `linear(1.06, -4)` → `sharpen({ sigma: 0.8 })` → JPEG q88, applied
// to the cleaned original. There is nothing subjective to review here — determinism and a
// measured brightness gain are the whole quality test.

/** The mean of the greyscale histogram sharp reports for `bytes`. */
async function meanLuminance(bytes: Uint8Array | Buffer): Promise<number> {
  const stats = await sharp(bytes).greyscale().stats();
  const channel = stats.channels[0];
  if (channel === undefined) throw new Error("no channel");
  return channel.mean;
}

/** A 64×64 JPEG at 40% grey (`rgb(102,102,102)`), the mid-grey card the recipe brightens. */
async function greyCard(): Promise<Uint8Array> {
  const bytes = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 102, g: 102, b: 102 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(bytes);
}

describe("enhance", () => {
  it("is deterministic: the same input produces byte-identical output across two runs", async () => {
    const input = fixture("dim.jpg");
    const first = await enhance(input, "auto-v1");
    const second = await enhance(input, "auto-v1");
    const { createHash } = await import("node:crypto");
    const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    expect(sha256(first)).toBe(sha256(second));
    expect(Buffer.compare(first, second)).toBe(0);
  });

  it("brightens a mid-grey card by at least the measured floor", async () => {
    const input = await greyCard();
    const before = await meanLuminance(input);
    const output = await enhance(input, "auto-v1");
    const after = await meanLuminance(output);
    // Measured once against the 40%-grey (rgb 102,102,102) 64×64 card: the recipe lifts
    // mean luminance from 102.0 to 107.0, a gain of exactly 5.0. Asserting ≥ 4 leaves
    // margin for the JPEG re-encode while still catching a broken or no-op recipe.
    expect(after - before).toBeGreaterThanOrEqual(4);
  });

  it("keeps the output's pixel dimensions equal to the input's", async () => {
    const input = fixture("dim.jpg");
    const before = await sharp(input).metadata();
    const output = await enhance(input, "auto-v1");
    const after = await sharp(output).metadata();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  it("writes no EXIF, ICC or XMP — the output carries no metadata at all", async () => {
    const output = await enhance(fixture("dim.jpg"), "auto-v1");
    const meta = await sharp(output).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.format).toBe("jpeg");
  });

  it("refuses a truncated file as unsupported rather than writing a broken output", async () => {
    const failure = enhance(fixture("dim.jpg").slice(0, 4000), "auto-v1");
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    await expect(failure).rejects.toMatchObject({ cause: expect.any(Error) });
  });
});

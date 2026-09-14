import "server-only";
import sharp from "sharp";
import { decode } from "./decode";

// The `auto-v1` recipe (ADR-016): the one deterministic, model-free enhancement a volunteer
// can apply to a photo. Stretch the luminance range, lift brightness and saturation a touch,
// add light contrast, sharpen, re-encode as a modest JPEG. No option here reads or writes
// metadata — `withMetadata()` is never called — so the output carries none, matching
// `cleanPhoto`. `mozjpeg`'s own progressive scan ordering does not depend on anything but
// the pixels, so it does not threaten the determinism the adapter test proves.

/** JPEG quality of an enhanced photo (ADR-016). */
export const ENHANCE_QUALITY = 88;

/** The recipe versions this adapter knows. Any change to the numbers below is `auto-v2`. */
export type EnhanceRecipe = "auto-v1";

/**
 * Runs `recipe` over `bytes` — the cleaned original of a photo, never a fresh upload — and
 * answers the enhanced JPEG. `auto-v1` is exactly: `normalise()` (stretch the luminance
 * range), `modulate({ brightness: 1.03, saturation: 1.08 })`, `linear(1.06, -4)` (light
 * contrast), `sharpen({ sigma: 0.8 })`, JPEG quality {@link ENHANCE_QUALITY}. Deterministic:
 * the same bytes always produce the same output, byte for byte. Dimensions are unchanged —
 * nothing here resizes. Bytes that will not decode are refused as `unsupported`, the same as
 * every other sharp adapter.
 */
export async function enhance(bytes: Uint8Array | Buffer, recipe: EnhanceRecipe): Promise<Buffer> {
  // `recipe` is taken, not branched on: `auto-v1` is the only recipe that exists, and a
  // branch with one reachable arm is the defensive code Principle VII forbids. The
  // parameter documents the version on every call site instead.
  void recipe;
  return decode(() =>
    sharp(bytes)
      .normalise()
      .modulate({ brightness: 1.03, saturation: 1.08 })
      .linear(1.06, -4)
      .sharpen({ sigma: 0.8 })
      .jpeg({ quality: ENHANCE_QUALITY, mozjpeg: true })
      .toBuffer(),
  );
}

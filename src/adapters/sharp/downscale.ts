import "server-only";
import sharp from "sharp";
import { decode } from "./decode";

/** The longest edge of what a model sees, in pixels (ADR-005 step 5). */
export const MODEL_LONG_EDGE = 768;

/**
 * The version of a clean photo the describer receives: at most {@link MODEL_LONG_EDGE} px
 * on its long edge, never enlarged, as a modest JPEG. The input is the clean derivative, so
 * an original — with whatever it carried — never reaches a model.
 */
export async function downscaleForModel(bytes: Uint8Array): Promise<Uint8Array> {
  const data = await decode(() =>
    sharp(bytes)
      .resize({
        width: MODEL_LONG_EDGE,
        height: MODEL_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer(),
  );
  return new Uint8Array(data);
}

import { RefusedError } from "@/core/errors";
import { isWebClipUri } from "@/core/media/clip-uri";
import type { DescribeResult, Describer } from "@/core/ports";

// The runtime fake Describer, wired when `MODEL=fake` (ADR-012, data-model.md →
// Configuration). Every photo and clip becomes the same sentence, so the builder's alt text
// path works without a model; `FAKE_DESCRIBER=fail` makes every call fail instead, which is
// how the "write the description yourself" path (FR-073) is driven in the browser.

/** The one description the fake ever writes. */
export const FAKE_DESCRIPTION = "A tabby cat on a windowsill.";

export function createFakeDescriber(env: { FAKE_DESCRIBER?: string }): Describer {
  const result: DescribeResult =
    env.FAKE_DESCRIBER === "fail" ? { failed: "model" } : { text: FAKE_DESCRIPTION };

  return {
    async describePhoto() {
      return result;
    },
    async describeVideo(gsUri) {
      if (!isWebClipUri(gsUri)) {
        throw new RefusedError("Only the finished web clip can be described.");
      }
      return result;
    },
  };
}

import { describe, expect, it } from "vitest";
import { RefusedError } from "@/core/errors";
import type { Describer } from "@/core/ports";

// The Describer contract (contracts/ports.md, ADR-006): `describeVideo` is only ever handed
// the finished `web.{rev}.mp4` — the trimmed, silent, ≤ 15 s clip — never an original. The
// caller enforces it; every implementation refuses anything else so a slip cannot reach a
// model. `describePhoto` receives bytes and answers `{ text }` or `{ failed }`.

const WEB_URI = "gs://public-bucket/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4";

export function runDescriberContract(name: string, factory: () => Describer): void {
  describe(`Describer contract (${name})`, () => {
    it("accepts a web clip URI and answers with text or a failure", async () => {
      const result = await factory().describeVideo(WEB_URI);
      expect("text" in result || "failed" in result).toBe(true);
    });

    it.each([
      "gs://private-bucket/profiles/abcdefgh/media/mmmmmmm2/original",
      "gs://public-bucket/profiles/abcdefgh/media/mmmmmmm2/poster.0123456789.jpg",
      "gs://public-bucket/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mov",
      "https://cdn.test/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
      "",
    ])("refuses to describe anything but a web clip: %s", async (uri) => {
      await expect(factory().describeVideo(uri)).rejects.toBeInstanceOf(RefusedError);
    });

    it("describes photo bytes with text or a failure", async () => {
      const result = await factory().describePhoto(new Uint8Array([0xff, 0xd8]));
      expect("text" in result || "failed" in result).toBe(true);
    });
  });
}

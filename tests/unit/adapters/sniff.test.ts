import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sniffType } from "@/adapters/sniff";

// Magic-byte sniffing (ADR-005): the bytes decide what a file is, never its name or the
// type the browser declared. The fixtures cover each accepted kind and the renamed PNG.

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url)));
}

describe("sniffType", () => {
  it("names a JPEG, a PNG and an MP4 by their bytes", async () => {
    expect(await sniffType(fixture("cat-1.jpg"))).toBe("image/jpeg");
    expect(await sniffType(fixture("not-a-video.mp4"))).toBe("image/png");
    expect(await sniffType(fixture("clip-2s.mp4"))).toBe("video/mp4");
  });

  it("needs only the head of the file", async () => {
    expect(await sniffType(fixture("clip-2s.mp4").slice(0, 65_536))).toBe("video/mp4");
    expect(await sniffType(fixture("cat-1.jpg").slice(0, 4096))).toBe("image/jpeg");
  });

  it("answers undefined for bytes it does not recognise", async () => {
    expect(await sniffType(new TextEncoder().encode("hello, not a file"))).toBeUndefined();
    expect(await sniffType(new Uint8Array())).toBeUndefined();
  });
});

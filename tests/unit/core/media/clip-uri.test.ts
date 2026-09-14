import { describe, expect, it } from "vitest";
import { isWebClipUri } from "@/core/media/clip-uri";

describe("isWebClipUri", () => {
  it("accepts only a gs:// URI of a web.{rev}.mp4 in a media folder", () => {
    expect(isWebClipUri("gs://bucket/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4")).toBe(
      true,
    );
    expect(isWebClipUri("gs://b-1.x/profiles/zyxwvuts/media/nnnnnnn3/web.abcdef0123.mp4")).toBe(
      true,
    );
  });

  it("accepts the file:/// form the filesystem store answers for the same object", () => {
    expect(
      isWebClipUri("file:///tmp/data/public/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4"),
    ).toBe(true);
    expect(isWebClipUri("file:///tmp/data/public/profiles/abcdefgh/media/mmmmmmm2/original")).toBe(
      false,
    );
    expect(isWebClipUri("file://profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4")).toBe(false);
  });

  it.each([
    "file:///tmp/../etc/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
    "file:///../profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
    "file:///tmp/data/..//profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
    "file:///tmp/data?x=1/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
  ])("rejects a file:/// form that climbs out of its folder: %s", (uri) => {
    expect(isWebClipUri(uri)).toBe(false);
  });

  it.each([
    "gs://bucket/profiles/abcdefgh/media/mmmmmmm2/original",
    "gs://bucket/profiles/abcdefgh/media/mmmmmmm2/poster.0123456789.jpg",
    "gs://bucket/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mov",
    "gs://bucket/profiles/abcdefgh/media/mmmmmmm2/web.012345678.mp4",
    "gs://bucket/profiles/ABCDEFGH/media/mmmmmmm2/web.0123456789.mp4",
    "gs://bucket/profiles/abcdefgh/media/mmmmmmm2/../web.0123456789.mp4",
    "gs:///profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
    "https://cdn.test/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
    "",
  ])("rejects %s", (uri) => {
    expect(isWebClipUri(uri)).toBe(false);
  });
});

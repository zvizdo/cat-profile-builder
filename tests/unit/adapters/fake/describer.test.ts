import { describe, expect, it } from "vitest";
import { createFakeDescriber, FAKE_DESCRIPTION } from "@/adapters/fake/describer";

const WEB = "gs://b/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4";

describe("createFakeDescriber", () => {
  it("describes every photo and clip as a tabby on a windowsill", async () => {
    const describer = createFakeDescriber({});
    expect(FAKE_DESCRIPTION).toBe("A tabby cat on a windowsill.");
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ text: FAKE_DESCRIPTION });
    expect(await describer.describeVideo(WEB)).toEqual({ text: FAKE_DESCRIPTION });
  });

  it("fails every call when FAKE_DESCRIBER=fail (the FR-073 path)", async () => {
    const describer = createFakeDescriber({ FAKE_DESCRIBER: "fail" });
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ failed: "model" });
    expect(await describer.describeVideo(WEB)).toEqual({ failed: "model" });
  });

  it("treats any other FAKE_DESCRIBER value as the normal mode", async () => {
    const describer = createFakeDescriber({ FAKE_DESCRIBER: "" });
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ text: FAKE_DESCRIPTION });
  });
});

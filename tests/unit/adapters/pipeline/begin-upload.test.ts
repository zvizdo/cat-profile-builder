import { describe, expect, it } from "vitest";
import { beginUpload } from "@/adapters/pipeline/begin-upload";
import { NotFoundError, TooLargeError } from "@/core/errors";
import { MB, PID, pipelineDeps, seedProfile } from "./helpers";

// `beginUpload` (ADR-005 step 1; FR-007): the declared size is judged before any byte
// moves, a media id is minted, and the signed upload comes back with everything the browser
// must send. Nothing is written — the record appears only when `finalizeUpload` passes.

describe("beginUpload", () => {
  it("mints a media id and answers the signed upload for that object and byte size", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    const result = await beginUpload(deps, {
      profileId: PID,
      fileName: "PXL_20260622_022941724.jpg",
      byteSize: 2 * MB,
      declaredType: "image/jpeg",
    });
    expect(result).toEqual({
      mediaId: "maaaaaab",
      uploadUrl: `memory://upload/profiles/${PID}/media/maaaaaab/original`,
      method: "PUT",
      headers: {},
    });
    expect(deps.mediaStore.signedUploads).toEqual([
      { pid: PID, mid: "maaaaaab", contentLength: 2 * MB },
    ]);
    expect(await deps.mediaStore.listMedia(PID)).toEqual([]);
  });

  it("refuses a photo of 25 MB + 1 as too_large before touching either store", async () => {
    const deps = pipelineDeps();
    let exists = 0;
    deps.profileStore.exists = async () => {
      exists += 1;
      return true;
    };
    const failure = beginUpload(deps, {
      profileId: PID,
      fileName: "huge.jpg",
      byteSize: 25 * MB + 1,
      declaredType: "image/jpeg",
    });
    await expect(failure).rejects.toBeInstanceOf(TooLargeError);
    await expect(failure).rejects.toMatchObject({ message: "That photo is over 25MB." });
    expect(exists).toBe(0);
    expect(deps.mediaStore.signedUploads).toEqual([]);
  });

  it("refuses a video of 200 MB + 1 and lets a 100 MB one through", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    await expect(
      beginUpload(deps, {
        profileId: PID,
        fileName: "long.mp4",
        byteSize: 200 * MB + 1,
        declaredType: "video/mp4",
      }),
    ).rejects.toMatchObject({ code: "too_large", message: "That video is over 200MB." });
    await expect(
      beginUpload(deps, {
        profileId: PID,
        fileName: "clip.mov",
        byteSize: 100 * MB,
        declaredType: "video/quicktime",
      }),
    ).resolves.toMatchObject({ mediaId: "maaaaaab" });
  });

  it("answers not_found for a cat that does not exist and signs nothing", async () => {
    const deps = pipelineDeps();
    const failure = beginUpload(deps, {
      profileId: PID,
      fileName: "cat.jpg",
      byteSize: MB,
      declaredType: "image/jpeg",
    });
    await expect(failure).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.mediaStore.signedUploads).toEqual([]);
  });
});

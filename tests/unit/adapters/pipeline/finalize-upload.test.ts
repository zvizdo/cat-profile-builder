import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { finalizeUpload } from "@/adapters/pipeline/finalize-upload";
import { NotFoundError, RefusedError, UnsupportedError, UpstreamError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import { MediaAssetSchema } from "@/core/media/schema";
import { checkReadiness } from "@/core/profile/readiness";
import type { ProfileDocument, PublishedDocument } from "@/core/profile/schema";
import { photoAsset } from "../../core/media/builders";
import { gpsPhoto, GPS_IFD_TAG, ifd0Tags } from "../sharp/helpers";
import { fixture, NOW, PID, pipelineDeps, type PipelineDeps } from "./helpers";

// `finalizeUpload` (ADR-005 step 3–5; FR-008, FR-009, FR-011, FR-073): the sniff decides
// the kind, every check passes before anything is written, the clean derivative carries no
// metadata, the describer sees a downscale and never the original, and every refusal
// deletes the uploaded object.

const MID = "mmmmmmm2";

async function uploaded(deps: PipelineDeps, bytes: Uint8Array, mid = MID) {
  await deps.mediaStore.putOriginal(PID, mid, bytes);
}

function input(overrides: Partial<Parameters<typeof finalizeUpload>[1]> = {}) {
  return {
    profileId: PID,
    mediaId: MID,
    fileName: "charlotte-1.jpg",
    declaredType: "image/jpeg",
    ...overrides,
  };
}

/** Everything left for `mid`: the record, the original and the derived files. */
async function remains(deps: PipelineDeps, mid = MID) {
  return {
    asset: await deps.mediaStore.readAsset(PID, mid),
    original: await deps.mediaStore.originalSize(PID, mid),
    listed: await deps.mediaStore.listMedia(PID),
  };
}

describe("finalizeUpload — a good photo", () => {
  it("writes the record, the clean derivative and the model's description", async () => {
    const deps = pipelineDeps([{ text: "A tabby cat asleep on a chair." }]);
    await uploaded(deps, fixture("cat-1.jpg"));

    const result = await finalizeUpload(deps, input());

    expect(result.warnings).toEqual([]);
    const { asset } = result;
    expect(asset).toMatchObject({
      schemaVersion: 1,
      id: MID,
      kind: "photo",
      fileName: "charlotte-1.jpg",
      mimeType: "image/jpeg",
      bytes: fixture("cat-1.jpg").byteLength,
      width: 1600,
      height: 1205,
      focal: { x: 50, y: 50 },
      status: "ready",
      alt: { text: "A tabby cat asleep on a chair.", source: "model" },
      descriptionStatus: "ready",
      createdAt: NOW,
    });
    expect(MediaAssetSchema.safeParse(asset).success).toBe(true);
    expect(loadAsset(await deps.mediaStore.readAsset(PID, MID))).toEqual(asset);

    const rev = asset.revisions.clean ?? "";
    const clean = await deps.mediaStore.readDerived(PID, MID, "clean", rev);
    expect(clean).not.toBeNull();
    const meta = await sharp(clean as Uint8Array).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 1600, height: 1205 });
    expect(meta.exif).toBeUndefined();
  });

  it("hands the describer a downscale of the clean photo, never the original", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("cat-1.jpg"));
    await finalizeUpload(deps, input());

    const [seen] = deps.describer.photoCalls;
    expect(deps.describer.photoCalls).toHaveLength(1);
    expect(await sharp(seen as Uint8Array).metadata()).toMatchObject({ width: 768, height: 578 });
  });

  it("strips GPS data: present in the upload, absent in the clean derivative", async () => {
    const deps = pipelineDeps();
    const photo = await gpsPhoto();
    expect(ifd0Tags((await sharp(photo).metadata()).exif as Buffer)).toContain(GPS_IFD_TAG);
    await uploaded(deps, photo);

    const { asset } = await finalizeUpload(deps, input({ fileName: "phone.jpg" }));
    const clean = await deps.mediaStore.readDerived(PID, MID, "clean", asset.revisions.clean ?? "");
    const meta = await sharp(clean as Uint8Array).metadata();
    expect(meta.exif).toBeUndefined();
    expect(asset).toMatchObject({ width: 60, height: 100 });
  });

  it("warns about a small photo but keeps it (FR-008)", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("small.jpg"));
    const result = await finalizeUpload(deps, input({ fileName: "small.jpg" }));
    expect(result.warnings).toEqual(["That photo is 850px wide — too small for the hero."]);
    expect(result.asset.status).toBe("ready");
  });

  it("accepts a photo whose declared type is unknown — the sniff decides", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("cat-1.jpg"));
    const { asset } = await finalizeUpload(deps, input({ declaredType: "" }));
    expect(asset.mimeType).toBe("image/jpeg");
  });
});

describe("finalizeUpload — the describer fails (FR-073)", () => {
  it("leaves the asset ready with no description, logs a warning, and publish asks for one", async () => {
    const deps = pipelineDeps([{ failed: "timeout" }]);
    await uploaded(deps, fixture("dim.jpg"));

    const { asset } = await finalizeUpload(deps, input({ fileName: "dim.jpg" }));
    expect(asset).toMatchObject({ status: "ready", alt: null, descriptionStatus: "failed" });
    expect(loadAsset(await deps.mediaStore.readAsset(PID, MID))).toEqual(asset);
    const warning = deps.logger.entries.find((entry) => entry.level === "warn");
    expect(warning).toMatchObject({ fields: { pid: PID, mid: MID, reason: "timeout" } });

    const doc: ProfileDocument = {
      schemaVersion: 1,
      id: PID,
      name: "Charlotte",
      age: "3 years",
      sex: "female",
      blocks: [{ id: "blockaaaaaaa", type: "hero", mediaId: MID }],
      theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
      updatedAt: NOW,
    };
    expect(checkReadiness(doc, [asset]).problems).toEqual(["Write a description for dim.jpg."]);
  });
});

describe("finalizeUpload — refusals delete the object", () => {
  it("refuses a PNG renamed .mp4 as unsupported and deletes it", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("not-a-video.mp4"));
    const failure = finalizeUpload(
      deps,
      input({ fileName: "not-a-video.mp4", declaredType: "video/mp4" }),
    );
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    await expect(failure).rejects.toMatchObject({
      code: "unsupported",
      message:
        "We can't read that file. Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.",
    });
    expect(await remains(deps)).toEqual({ asset: null, original: null, listed: [] });
    expect(deps.describer.photoCalls).toEqual([]);
  });

  it("refuses bytes no sniffer recognises and deletes them", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, new TextEncoder().encode("this is a text file"));
    await expect(finalizeUpload(deps, input({ fileName: "notes.txt" }))).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(await remains(deps)).toEqual({ asset: null, original: null, listed: [] });
  });

  it("refuses a photo over 25 MB by its real size and deletes it", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("cat-1.jpg"));
    deps.mediaStore.originalSize = async () => 25 * 1024 * 1024 + 1;
    await expect(finalizeUpload(deps, input({ declaredType: "" }))).rejects.toMatchObject({
      code: "too_large",
      message: "That photo is over 25MB.",
    });
    expect(await deps.mediaStore.readAsset(PID, MID)).toBeNull();
    expect(await deps.mediaStore.readRange(PID, MID, { start: 0, end: 1 })).toBeNull();
  });

  it("refuses a truncated JPEG as unsupported and deletes it, writing no derivative", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("cat-1.jpg").slice(0, 4000));
    await expect(finalizeUpload(deps, input())).rejects.toMatchObject({ code: "unsupported" });
    expect(await remains(deps)).toEqual({ asset: null, original: null, listed: [] });
  });

  it("answers not_found when nothing was uploaded under the id", async () => {
    const deps = pipelineDeps();
    const failure = finalizeUpload(deps, input());
    await expect(failure).rejects.toBeInstanceOf(NotFoundError);
    await expect(failure).rejects.toMatchObject({ message: "Nothing was uploaded." });
  });

  it("answers not_found when the object vanishes between one read and the next", async () => {
    const gone = pipelineDeps();
    await uploaded(gone, fixture("cat-1.jpg"));
    gone.mediaStore.readRange = async () => null;
    await expect(finalizeUpload(gone, input())).rejects.toBeInstanceOf(NotFoundError);

    const goneLater = pipelineDeps();
    await uploaded(goneLater, fixture("cat-1.jpg"));
    goneLater.mediaStore.readOriginal = async () => null;
    await expect(finalizeUpload(goneLater, input())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("finalizeUpload — an id that already has a record (FR-075, FR-076)", () => {
  /** The reviewer's sequence: finalize, publish a page using it, then finalize again. */
  async function publishedPhoto(deps: PipelineDeps) {
    await uploaded(deps, fixture("cat-1.jpg"));
    const { asset } = await finalizeUpload(deps, input());
    const rev = asset.revisions.clean ?? "";
    const published: PublishedDocument = {
      schemaVersion: 1,
      id: PID,
      name: "Charlotte",
      blocks: [{ id: "blockaaaaaaa", type: "hero", mediaId: MID }],
      theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
      updatedAt: NOW,
      publishedAt: NOW,
      slug: "charlotte",
      media: {
        [MID]: {
          kind: "photo",
          src: deps.mediaStore.publicUrl(PID, MID, "clean", rev),
          alt: "A tabby cat asleep.",
          focal: { x: 50, y: 50 },
          width: asset.width,
          height: asset.height,
        },
      },
    };
    await deps.profileStore.writePublished(PID, published);
    return { asset, rev };
  }

  it("refuses a second finalize as refused and leaves the record, the original and the clean file", async () => {
    const deps = pipelineDeps();
    const { asset, rev } = await publishedPhoto(deps);
    const originalSize = await deps.mediaStore.originalSize(PID, MID);

    const failure = finalizeUpload(deps, input({ declaredType: "video/mp4" }));
    await expect(failure).rejects.toBeInstanceOf(RefusedError);
    await expect(failure).rejects.toMatchObject({
      code: "refused",
      message: "This file was already added.",
    });
    expect(loadAsset(await deps.mediaStore.readAsset(PID, MID))).toEqual(asset);
    expect(await deps.mediaStore.originalSize(PID, MID)).toBe(originalSize);
    expect(await deps.mediaStore.readDerived(PID, MID, "clean", rev)).not.toBeNull();
    expect(deps.describer.photoCalls).toHaveLength(1);
  });

  it("refuses before touching the original, so a volunteer's description is never replaced", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("cat-1.jpg"));
    let reads = 0;
    deps.mediaStore.readRange = async () => {
      reads += 1;
      return null;
    };
    const written = photoAsset({
      id: MID,
      alt: { text: "Charlotte in her own words.", source: "volunteer" },
    });
    await deps.mediaStore.writeAsset(PID, MID, written);

    await expect(finalizeUpload(deps, input())).rejects.toMatchObject({ code: "refused" });
    expect(await deps.mediaStore.readAsset(PID, MID)).toEqual(written);
    expect(reads).toBe(0);
    expect(await deps.mediaStore.originalSize(PID, MID)).toBe(fixture("cat-1.jpg").byteLength);
  });
});

describe("finalizeUpload — when the cleanup itself fails", () => {
  it("logs the cleanup failure and still answers the refusal, never a 502 in its place", async () => {
    const deps = pipelineDeps();
    await uploaded(deps, fixture("not-a-video.mp4"));
    const outage = new UpstreamError("The storage service didn't respond.");
    deps.mediaStore.deleteMedia = async () => {
      throw outage;
    };
    const failure = finalizeUpload(deps, input({ declaredType: "video/mp4" }));
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    const entry = deps.logger.entries.find((e) => e.level === "error");
    expect(entry).toMatchObject({ fields: { pid: PID, mid: MID, err: outage } });
  });
});

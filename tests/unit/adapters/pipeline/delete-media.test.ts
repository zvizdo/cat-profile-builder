import { describe, expect, it } from "vitest";
import { deleteMedia } from "@/adapters/pipeline/delete-media";
import { NotFoundError, RefusedError } from "@/core/errors";
import type { ProfileDocument, PublishedDocument } from "@/core/profile/schema";
import { photoAsset, PHOTO_ID, videoAsset, VIDEO_ID } from "../../core/media/builders";
import { NOW, PID, pipelineDeps, seedProfile, type PipelineDeps } from "./helpers";

// `deleteMedia` (ADR-015 → Media-in-use guard; FR-076, FR-087): refused, naming the cat,
// while the live or archived page references the id; otherwise the media folder goes and
// the draft is left alone — a block still pointing at the id is readiness's business.

const OTHER = "nnnnnnn3";

function draftUsing(mid: string): ProfileDocument {
  return {
    schemaVersion: 1,
    id: PID,
    name: "Charlotte",
    blocks: [{ id: "blockaaaaaaa", type: "hero", mediaId: mid }],
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt: NOW,
  };
}

function publishedUsing(mid: string): PublishedDocument {
  return {
    ...draftUsing(mid),
    publishedAt: NOW,
    slug: "charlotte",
    media: {
      [mid]: {
        kind: "photo",
        src: `https://cdn.test/profiles/${PID}/media/${mid}/clean.a1b2c3d4e5.jpg`,
        alt: "Charlotte.",
        focal: { x: 50, y: 50 },
        width: 2560,
        height: 1920,
      },
    },
  };
}

async function withAsset(deps: PipelineDeps, mid = PHOTO_ID) {
  await deps.mediaStore.writeAsset(PID, mid, photoAsset({ id: mid }));
  await deps.mediaStore.putOriginal(PID, mid, new TextEncoder().encode("orig"));
  await deps.mediaStore.writeDerived(PID, mid, "clean", new TextEncoder().encode("jpeg"));
}

describe("deleteMedia", () => {
  it("removes the record, the original and the derived files of a draft cat's photo", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    await withAsset(deps);
    await withAsset(deps, OTHER);

    expect(await deleteMedia(deps, { profileId: PID, mediaId: PHOTO_ID })).toEqual({});
    expect(await deps.mediaStore.readAsset(PID, PHOTO_ID)).toBeNull();
    expect(await deps.mediaStore.originalSize(PID, PHOTO_ID)).toBeNull();
    expect(await deps.mediaStore.listMedia(PID)).toEqual([OTHER]);
  });

  it("never edits the draft: a block still referencing the id is left as it is", async () => {
    const deps = pipelineDeps();
    const doc = draftUsing(PHOTO_ID);
    await deps.profileStore.writeDraft(PID, doc, {
      name: "Charlotte",
      line: "",
      thumbnail: null,
      updatedAt: NOW,
    });
    await withAsset(deps);
    await deleteMedia(deps, { profileId: PID, mediaId: PHOTO_ID });
    expect(await deps.profileStore.readDraft(PID)).toEqual(doc);
  });

  it("refuses, naming the cat, while the live page uses the photo", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    await withAsset(deps);
    await deps.profileStore.writePublished(PID, publishedUsing(PHOTO_ID));

    const failure = deleteMedia(deps, { profileId: PID, mediaId: PHOTO_ID });
    await expect(failure).rejects.toBeInstanceOf(RefusedError);
    await expect(failure).rejects.toMatchObject({
      code: "refused",
      message: "Charlotte's live page uses this photo. Unpublish first.",
    });
    expect(await deps.mediaStore.readAsset(PID, PHOTO_ID)).not.toBeNull();
  });

  it("refuses, naming the cat, while the archived page uses the photo", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    await withAsset(deps);
    await deps.profileStore.writePublished(PID, publishedUsing(PHOTO_ID));
    await deps.profileStore.archive(PID);

    await expect(deleteMedia(deps, { profileId: PID, mediaId: PHOTO_ID })).rejects.toMatchObject({
      code: "refused",
      message: "Charlotte's archived page uses this photo. Restore and unpublish first.",
    });
    expect(await deps.mediaStore.readAsset(PID, PHOTO_ID)).not.toBeNull();
  });

  it("calls a video a clip when refusing", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    await deps.mediaStore.writeAsset(PID, VIDEO_ID, videoAsset());
    const published: PublishedDocument = {
      ...draftUsing(VIDEO_ID),
      blocks: [
        { id: "blockaaaaaaa", type: "hero", mediaId: null },
        { id: "blockaaaaaab", type: "video", mediaId: VIDEO_ID },
      ],
      publishedAt: NOW,
      slug: "charlotte",
      media: {
        [VIDEO_ID]: {
          kind: "video",
          src: `https://cdn.test/profiles/${PID}/media/${VIDEO_ID}/web.e5f6a7b8c9.mp4`,
          alt: "Charlotte.",
          focal: { x: 50, y: 50 },
          width: 1080,
          height: 1920,
          durationSeconds: 9,
        },
      },
    };
    await deps.profileStore.writePublished(PID, published);
    await expect(deleteMedia(deps, { profileId: PID, mediaId: VIDEO_ID })).rejects.toMatchObject({
      message: "Charlotte's live page uses this clip. Unpublish first.",
    });
  });

  it("lets a photo go when the live page uses a different one", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    await withAsset(deps);
    await withAsset(deps, OTHER);
    await deps.profileStore.writePublished(PID, publishedUsing(OTHER));

    await deleteMedia(deps, { profileId: PID, mediaId: PHOTO_ID });
    expect(await deps.mediaStore.listMedia(PID)).toEqual([OTHER]);
  });

  it("answers not_found for a media id with no record", async () => {
    const deps = pipelineDeps();
    await seedProfile(deps);
    await expect(deleteMedia(deps, { profileId: PID, mediaId: PHOTO_ID })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

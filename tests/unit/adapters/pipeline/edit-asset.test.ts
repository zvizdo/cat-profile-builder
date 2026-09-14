import { describe, expect, it } from "vitest";
import { setAltText, setFocalPoint } from "@/adapters/pipeline/edit-asset";
import { NotFoundError, ProfileInvalidError } from "@/core/errors";
import { photoAsset, PHOTO_ID } from "../../core/media/builders";
import { PID, pipelineDeps } from "./helpers";

// The two record edits a volunteer makes on a tile (FR-011; data-model.md → state
// transitions): the focal point, and the description in their own words.

describe("setFocalPoint", () => {
  it("moves the focal point and writes the record back", async () => {
    const deps = pipelineDeps();
    await deps.mediaStore.writeAsset(PID, PHOTO_ID, photoAsset());

    const { asset } = await setFocalPoint(deps, {
      profileId: PID,
      mediaId: PHOTO_ID,
      focal: { x: 62, y: 40 },
    });
    expect(asset).toEqual(photoAsset({ focal: { x: 62, y: 40 } }));
    expect(await deps.mediaStore.readAsset(PID, PHOTO_ID)).toEqual(asset);
  });

  it("answers not_found for a media id with no record", async () => {
    await expect(
      setFocalPoint(pipelineDeps(), { profileId: PID, mediaId: PHOTO_ID, focal: { x: 1, y: 1 } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to touch a stored record that fails its schema", async () => {
    const deps = pipelineDeps();
    await deps.mediaStore.writeAsset(PID, PHOTO_ID, { schemaVersion: 1, id: PHOTO_ID });
    await expect(
      setFocalPoint(deps, { profileId: PID, mediaId: PHOTO_ID, focal: { x: 1, y: 1 } }),
    ).rejects.toBeInstanceOf(ProfileInvalidError);
    expect(await deps.mediaStore.readAsset(PID, PHOTO_ID)).toEqual({
      schemaVersion: 1,
      id: PHOTO_ID,
    });
  });
});

describe("setAltText", () => {
  it("sets the volunteer's words as the description and marks it ready", async () => {
    const deps = pipelineDeps();
    await deps.mediaStore.writeAsset(
      PID,
      PHOTO_ID,
      photoAsset({ alt: null, descriptionStatus: "failed" }),
    );

    const { asset } = await setAltText(deps, {
      profileId: PID,
      mediaId: PHOTO_ID,
      text: "Charlotte asleep in the sun.",
    });
    expect(asset).toEqual(
      photoAsset({
        alt: { text: "Charlotte asleep in the sun.", source: "volunteer" },
        descriptionStatus: "ready",
      }),
    );
    expect(await deps.mediaStore.readAsset(PID, PHOTO_ID)).toEqual(asset);
  });

  it("replaces a model description too — editing is allowed any time (FR-011)", async () => {
    const deps = pipelineDeps();
    await deps.mediaStore.writeAsset(PID, PHOTO_ID, photoAsset());
    const { asset } = await setAltText(deps, { profileId: PID, mediaId: PHOTO_ID, text: "Hers." });
    expect(asset.alt).toEqual({ text: "Hers.", source: "volunteer" });
  });

  it("answers not_found for a media id with no record", async () => {
    await expect(
      setAltText(pipelineDeps(), { profileId: PID, mediaId: PHOTO_ID, text: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

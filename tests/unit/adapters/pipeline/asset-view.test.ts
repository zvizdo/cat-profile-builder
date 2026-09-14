import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assetView } from "@/adapters/pipeline/asset-view";
import type { MediaAsset } from "@/core/media/schema";
import { pipelineDeps, PID } from "./helpers";

// The record as the builder receives it: every field of the stored `MediaAsset` plus the
// ready-made public URL of each derived revision it has. The browser is never handed a
// rev or a bucket name to join itself, so it cannot build a URL outside the media folder.

function fixture(name: string): MediaAsset {
  return JSON.parse(
    readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8"),
  ) as MediaAsset;
}

describe("assetView", () => {
  it("adds cleanUrl for a photo and nothing else", () => {
    const { mediaStore } = pipelineDeps();
    const photo = fixture("maximal-asset-photo.json");
    const view = assetView(mediaStore, PID, photo);
    expect(view).toEqual({
      ...photo,
      cleanUrl: mediaStore.publicUrl(PID, photo.id, "clean", photo.revisions.clean ?? ""),
    });
    expect("posterUrl" in view).toBe(false);
    expect("webUrl" in view).toBe(false);
  });

  it("adds webUrl and posterUrl for a finished video", () => {
    const { mediaStore } = pipelineDeps();
    const video = fixture("maximal-asset-video.json");
    expect(assetView(mediaStore, PID, video)).toEqual({
      ...video,
      webUrl: mediaStore.publicUrl(PID, video.id, "web", video.revisions.web ?? ""),
      posterUrl: mediaStore.publicUrl(PID, video.id, "poster", video.revisions.poster ?? ""),
    });
  });

  it("adds no URL to a video that still needs a trim", () => {
    const { mediaStore } = pipelineDeps();
    const video = fixture("maximal-asset-video.json");
    const untrimmed: MediaAsset = {
      ...video,
      status: "needs-trim",
      trim: undefined,
      durationSeconds: undefined,
      revisions: {},
    };
    expect(assetView(mediaStore, PID, untrimmed)).toEqual(untrimmed);
  });
});

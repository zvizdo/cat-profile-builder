import type { AssetView } from "@/adapters/pipeline/asset-view";

// The records the MediaLibrary tests render: a described photo, a finished clip, a long
// clip that still needs a trim, and a photo whose description failed (FR-073).

export const PID = "abcdefgh";

export function photo(id: string, fileName: string, extra: Partial<AssetView> = {}): AssetView {
  return {
    schemaVersion: 1,
    id,
    kind: "photo",
    fileName,
    mimeType: "image/jpeg",
    bytes: 1000,
    width: 3072,
    height: 4080,
    focal: { x: 50, y: 50 },
    status: "ready",
    alt: { text: "A tabby cat on a windowsill.", source: "model" },
    descriptionStatus: "ready",
    revisions: { clean: "a1b2c3d4e5" },
    createdAt: "2026-09-10T12:00:00.000Z",
    cleanUrl: `/media/profiles/${PID}/media/${id}/clean.a1b2c3d4e5.jpg`,
    ...extra,
  };
}

export const CAT = photo("maaaaaaa", "cat-1.jpg");
export const CLIP: AssetView = {
  ...photo("maaaaaab", "rain-day.mov"),
  kind: "video",
  mimeType: "video/quicktime",
  width: 1080,
  height: 1920,
  durationSeconds: 10.5,
  originalDurationSeconds: 10.5,
  revisions: { web: "b2c3d4e5f6", poster: "c3d4e5f6a7" },
  cleanUrl: undefined,
  webUrl: `/media/profiles/${PID}/media/maaaaaab/web.b2c3d4e5f6.mp4`,
  posterUrl: `/media/profiles/${PID}/media/maaaaaab/poster.c3d4e5f6a7.jpg`,
};
export const LONG: AssetView = {
  ...CLIP,
  id: "maaaaaac",
  fileName: "long.mp4",
  status: "needs-trim",
  alt: null,
  descriptionStatus: "pending",
  durationSeconds: undefined,
  originalDurationSeconds: 89,
  revisions: {},
  webUrl: undefined,
  posterUrl: undefined,
};
export const FAILED = photo("maaaaaad", "blurry.jpg", { alt: null, descriptionStatus: "failed" });

// A tile is named by its description first, then the file, then its state.
export const CAT_NAME = "A tabby cat on a windowsill., cat-1.jpg";
export const CLIP_NAME = "A tabby cat on a windowsill., rain-day.mov, 0:10";

/** The hidden picker behind the add tile. */
export function fileInput(): HTMLInputElement {
  const input = document.querySelector("input[type=file]");
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  return input;
}

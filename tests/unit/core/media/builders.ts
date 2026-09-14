import { type MediaAsset } from "@/core/media/schema";

// Small valid media records for the media unit tests to break one field at a time.

export const PHOTO_ID = "media2ax";
export const VIDEO_ID = "media2ay";

/** A ready, described photo with a clean revision; tests override one field at a time. */
export function photoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    schemaVersion: 1,
    id: PHOTO_ID,
    kind: "photo",
    fileName: "charlotte-window.jpg",
    mimeType: "image/jpeg",
    bytes: 2_105_344,
    width: 2560,
    height: 1920,
    focal: { x: 50, y: 50 },
    status: "ready",
    alt: { text: "Charlotte on a windowsill.", source: "model" },
    descriptionStatus: "ready",
    revisions: { clean: "a1b2c3d4e5" },
    createdAt: "2026-09-01T08:15:00.000Z",
    ...overrides,
  };
}

/** A ready, trimmed video with web and poster revisions. */
export function videoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    schemaVersion: 1,
    id: VIDEO_ID,
    kind: "video",
    fileName: "rain-day.mov",
    mimeType: "video/quicktime",
    bytes: 29_425_176,
    width: 1080,
    height: 1920,
    durationSeconds: 9,
    focal: { x: 50, y: 50 },
    status: "ready",
    alt: { text: "Charlotte batting at a raindrop.", source: "volunteer" },
    descriptionStatus: "ready",
    originalDurationSeconds: 22.4,
    trim: { start: 2.5, end: 11.5 },
    revisions: { web: "e5f6a7b8c9", poster: "0123456789" },
    createdAt: "2026-09-01T08:15:00.000Z",
    ...overrides,
  };
}

/** `value` with top-level keys removed, the way a broken stored record would arrive. */
export function without(value: object, ...keys: string[]): unknown {
  return Object.fromEntries(Object.entries(value).filter(([name]) => !keys.includes(name)));
}

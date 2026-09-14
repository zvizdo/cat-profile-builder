import { type Block, type ProfileDocument } from "@/core/profile/schema";

// Small valid documents for the profile unit tests to break one field at a time.

export const HERO_ID = "blockaaaaaaa";
export const BIO_ID = "blockaaaaaab";
export const PHOTO_ID = "blockaaaaaac";
export const GALLERY_ID = "blockaaaaaad";
export const VIDEO_ID = "blockaaaaaae";
export const DAY_ID = "blockaaaaaaf";
export const NEEDS_ID = "blockaaaaaag";
export const QUOTE_ID = "blockaaaaaah";

export function hero(mediaId: string | null = "media2aa"): Block {
  return { id: HERO_ID, type: "hero", mediaId };
}

export function bio(text = ""): Block {
  const paragraphs = text === "" ? [] : [{ runs: [{ text }] }];
  return { id: BIO_ID, type: "bio", content: { paragraphs } };
}

export function photo(mediaId: string | null = "media2ab", caption?: string): Block {
  return caption === undefined
    ? { id: PHOTO_ID, type: "photo", mediaId }
    : { id: PHOTO_ID, type: "photo", mediaId, caption };
}

export function gallery(mediaIds: string[] = ["media2aa", "media2ab", "media2ac"]): Block {
  return { id: GALLERY_ID, type: "gallery", mediaIds };
}

export function video(mediaId: string | null = "video2aa"): Block {
  return { id: VIDEO_ID, type: "video", mediaId };
}

export function day(
  scenes: Array<{ mediaId: string | null; caption: string }> = [
    { mediaId: "media2aa", caption: "Morning sunbeam." },
    { mediaId: "media2ab", caption: "" },
    { mediaId: null, caption: "" },
  ],
): Block {
  return { id: DAY_ID, type: "day", scenes };
}

export function needs(
  cards: Array<{ title: string; text: string }> = [{ title: "Quiet", text: "No dogs." }],
): Block {
  return { id: NEEDS_ID, type: "needs", cards };
}

export function quote(
  mediaId: string | null = "media2ac",
  text = "She purrs at the kettle.",
  attribution?: string,
): Block {
  return attribution === undefined
    ? { id: QUOTE_ID, type: "quote", mediaId, text }
    : { id: QUOTE_ID, type: "quote", mediaId, text, attribution };
}

/** A small valid document; tests override one field at a time. */
export function document(overrides: Partial<ProfileDocument> = {}): ProfileDocument {
  return {
    schemaVersion: 1,
    id: "kx3f7q2m",
    name: "Charlotte",
    blocks: [hero(), bio()],
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt: "2026-09-10T18:30:00.000Z",
    ...overrides,
  };
}

/** `value` with one top-level key removed, the way a broken stored document would arrive. */
export function without(value: object, key: string): unknown {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

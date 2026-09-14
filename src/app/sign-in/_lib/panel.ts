import type { PublishedRow } from "@/core/ports";
import type { ResolvedMedia } from "@/core/profile/schema";
import { indexEntries } from "@/ui/profile/index-entries";

// The sign-in page's photo panel (hi-fi 4b; CONTENT.md → Sign in → Photo panel): a live
// cat's photo under the scrim and the live count, `Seven cats are waiting on a page.`,
// both read from `listPublished()` — the live cats are exactly the published copies. With
// nothing live the panel shows the design's own photo and says so.

/**
 * The design's photo (design/media/charlotte-2.jpg, downscaled under `public/`), on the
 * point the hi-fi frames it on, for a shelter with nothing published yet.
 */
export const FALLBACK_PHOTO: ResolvedMedia = {
  kind: "photo",
  src: "/sign-in-fallback.jpg",
  alt: "A tabby cat lying in a window hammock, looking at the camera.",
  focal: { x: 48, y: 45 },
  width: 1205,
  height: 1600,
};

/** What the panel shows. */
export interface SignInPanelData {
  /** The live cats. */
  count: number;
  /** The headline: the live count, in the shelter's voice. */
  sentence: string;
  /** The most recently published cat's photo, else {@link FALLBACK_PHOTO}. */
  photo: ResolvedMedia;
}

/**
 * The headline for `count` live cats. CONTENT.md gives the plural with a live number;
 * the singular follows it, and with nothing live the sentence says that plainly rather
 * than counting to zero.
 */
export function signInSentence(count: number): string {
  if (count === 0) return "No cats are on a page yet.";
  if (count === 1) return "1 cat is waiting on a page.";
  return `${count} cats are waiting on a page.`;
}

/**
 * The panel's data from the published rows: the count is their number, the photo is the
 * first one the public index would show — the hero's, else the first photo — walking
 * from the most recently published cat, else the design's own.
 */
export function signInPanelData(rows: readonly PublishedRow[]): SignInPanelData {
  const photo = indexEntries(rows).find((entry) => entry.photo !== null)?.photo ?? FALLBACK_PHOTO;
  return { count: rows.length, sentence: signInSentence(rows.length), photo };
}

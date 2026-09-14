import { vi } from "vitest";
import maximal from "../../fixtures/maximal-document.json";
import { parseOrThrow } from "@/core/errors";
import {
  ProfileDocumentSchema,
  referencedMediaIds,
  type ProfileDocument,
  type ResolvedMedia,
} from "@/core/profile/schema";

// What every profile renderer test starts from: the maximal document and a manifest that
// resolves each id it references — a video entry for the ids video sections use, a photo
// for the rest — plus the two browser stubs jsdom lacks: `matchMedia` and media playback.

/** The maximal fixture, parsed, so a test cannot start from an invalid document. */
export const MAXIMAL: ProfileDocument = parseOrThrow(ProfileDocumentSchema, maximal);

const BASE = "https://storage.googleapis.com/public/profiles/kx3f7q2m/media";

/** A photo entry for `id`, on a distinct focal point so a crop can be told apart. */
export function photoEntry(id: string, focal = { x: 64, y: 44 }): ResolvedMedia {
  return {
    kind: "photo",
    src: `${BASE}/${id}/clean.0123456789.jpg`,
    alt: `Photo ${id}`,
    focal,
    width: 2560,
    height: 1920,
  };
}

/** A video entry for `id`, with a poster unless `poster` is false. */
export function videoEntry(id: string, poster = true): ResolvedMedia {
  return {
    kind: "video",
    src: `${BASE}/${id}/web.0123456789.mp4`,
    ...(poster ? { poster: `${BASE}/${id}/poster.0123456789.jpg` } : {}),
    alt: `Clip ${id}`,
    focal: { x: 50, y: 50 },
    width: 1080,
    height: 1920,
    durationSeconds: 9,
  };
}

/** A manifest covering every id `doc` references, video where a video section uses it. */
export function manifestFor(doc: ProfileDocument): Record<string, ResolvedMedia> {
  const videoIds = new Set(
    doc.blocks.flatMap((block) =>
      block.type === "video" && block.mediaId !== null ? [block.mediaId] : [],
    ),
  );
  return Object.fromEntries(
    referencedMediaIds(doc).map((id) => [id, videoIds.has(id) ? videoEntry(id) : photoEntry(id)]),
  );
}

/** The first block of `type` in the maximal document. */
export function blockOf<T extends ProfileDocument["blocks"][number]["type"]>(
  type: T,
): Extract<ProfileDocument["blocks"][number], { type: T }> {
  const block = MAXIMAL.blocks.find((candidate) => candidate.type === type);
  if (block === undefined || block.type !== type) throw new Error(`no ${type} block`);
  return block as Extract<ProfileDocument["blocks"][number], { type: T }>;
}

/** Installs `window.matchMedia` answering `reduce` for the reduced-motion query. */
export function stubMatchMedia(reduce: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

/**
 * jsdom has no media playback: these make `play`/`pause` move `paused` and fire the
 * element's `play`/`pause` events, as a browser would, and record the calls.
 */
export function stubPlayback(): {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
} {
  let isPaused = false;
  const play = vi.fn(function (this: HTMLMediaElement) {
    isPaused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  const pause = vi.fn(function (this: HTMLMediaElement) {
    const wasPlaying = !isPaused;
    isPaused = true;
    if (wasPlaying) this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(() => isPaused);
  // jsdom has no `load()` either (F62's preload release calls it); stub it quiet rather
  // than let every run print "Not implemented: HTMLMediaElement's load() method".
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  return { play, pause };
}

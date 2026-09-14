import { z } from "zod";
import { displayLine } from "../profile/display-line";
import { referencedMediaIds, type PublishedDocument } from "../profile/schema";
import { publicAddress } from "../profile/slug";

// The carousel's roster (FR-061, FR-084; contracts/server-boundary.md → `GET
// /api/carousel`): what `GET /api/carousel` serialises, built from the live documents
// `listPublished()` returns. Nothing here is framework code — it is exactly the shape a
// visitor's browser receives, so the route only calls this and answers `{ cats }`.

/** The most photos a cat's carousel sequence carries; FR-084 never needs more. */
const MAX_PHOTOS = 5;

/** One photo a cat's turn may show, resolved exactly as the published page shows it. */
const CarouselPhotoSchema = z.object({
  src: z.string(),
  alt: z.string(),
  focal: z.object({ x: z.number(), y: z.number() }),
});

/**
 * The cat's trimmed clip, resolved exactly as the published page shows it. `poster` is
 * absent exactly when the manifest has none — a poster extraction can fail (ADR-006) and a
 * video still publishes without one, so this is not a state the carousel refuses either.
 */
const CarouselVideoSchema = z.object({
  src: z.string(),
  poster: z.string().optional(),
  alt: z.string(),
  durationSeconds: z.number(),
});

/**
 * One live cat's carousel entry (FR-059, FR-061, FR-084): the address a selection or QR
 * scan leads to, the name and one display line, its facts when the volunteer recorded them,
 * and the media a turn can show. `age`/`sex` are omitted rather than sent empty — `sex` is
 * only ever "female" or "male" here, since a live document's sex is never "unknown"
 * (FR-060's publish gate refuses that). No id beyond `url`, no draft content (FR-059).
 */
const CarouselCatSchema = z.object({
  url: z.string(),
  name: z.string(),
  line: z.string(),
  age: z.string().optional(),
  sex: z.enum(["female", "male"]).optional(),
  /** Stack order, hero first, at most {@link MAX_PHOTOS}. */
  photos: z.array(CarouselPhotoSchema),
  video: CarouselVideoSchema.optional(),
});

/**
 * What `GET /api/carousel` answers, as the kiosk's five-minute poll validates it before a
 * word of it reaches the beat (FR-066; Principle IV: an answer from the network is
 * `unknown` until a schema says otherwise). The route builds its answer from
 * {@link buildRoster}, so the two can only disagree if one of them changes.
 */
export const RosterResponseSchema = z.object({ cats: z.array(CarouselCatSchema) });

export type CarouselPhoto = z.infer<typeof CarouselPhotoSchema>;
export type CarouselVideo = z.infer<typeof CarouselVideoSchema>;
export type CarouselCat = z.infer<typeof CarouselCatSchema>;

/** `doc.age`, omitted when the volunteer never recorded one. */
function ageOf(doc: PublishedDocument): Pick<CarouselCat, "age"> {
  const age = doc.age?.trim();
  return age === undefined || age === "" ? {} : { age };
}

/** `doc.sex`, narrowed to the two definite values a published document ever carries. */
function sexOf(doc: PublishedDocument): Pick<CarouselCat, "sex"> {
  return doc.sex === "female" || doc.sex === "male" ? { sex: doc.sex } : {};
}

/** The cat's media split into photos (stack order, hero first, capped) and its clip, if any. */
function mediaOf(doc: PublishedDocument): Pick<CarouselCat, "photos" | "video"> {
  const photos: CarouselPhoto[] = [];
  let video: CarouselVideo | undefined;
  for (const id of referencedMediaIds(doc)) {
    const entry = doc.media[id];
    if (entry === undefined) continue;
    if (entry.kind === "photo" && photos.length < MAX_PHOTOS) {
      photos.push({ src: entry.src, alt: entry.alt, focal: entry.focal });
    } else if (
      entry.kind === "video" &&
      video === undefined &&
      entry.durationSeconds !== undefined
    ) {
      video = {
        src: entry.src,
        alt: entry.alt,
        durationSeconds: entry.durationSeconds,
        ...(entry.poster === undefined ? {} : { poster: entry.poster }),
      };
    }
  }
  return video === undefined ? { photos } : { photos, video };
}

/** One document as its carousel entry, `url` built from `baseUrl` the way `publish` does. */
function catFrom(doc: PublishedDocument, baseUrl: string): CarouselCat {
  return {
    url: publicAddress(baseUrl, doc.slug, doc.id),
    name: doc.name,
    line: displayLine(doc),
    ...ageOf(doc),
    ...sexOf(doc),
    ...mediaOf(doc),
  };
}

/**
 * Every live cat as a carousel entry, most recently published first (FR-061) — no cap: the
 * spec's scale is ~50 cats, and Principle VII forbids guarding a state that cannot occur.
 * `baseUrl` is `PUBLIC_BASE_URL`, the same value `publish` builds a cat's own address from,
 * so a carousel selection and the QR code (FR-088) lead to exactly the page that is live.
 */
export function buildRoster(
  published: readonly PublishedDocument[],
  baseUrl: string,
): CarouselCat[] {
  return [...published]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((doc) => catFrom(doc, baseUrl));
}

/** What a beat shows: one of the cat's photos, or its clip. */
export type MediaPick =
  { kind: "photo"; photo: CarouselPhoto } | { kind: "video"; video: CarouselVideo };

/**
 * The photo or clip `cat` shows on loop `loopIndex` (FR-084): its photos in stack order,
 * then its clip if it has one, indexed by `loopIndex % candidates.length` — so loop 0 shows
 * the first candidate, loop 1 the next, and so on, wrapping back to the first once every
 * candidate has had a turn. A cat with a single photo and no clip has one candidate, which
 * this returns on every loop. A published cat always has at least its hero photo (FR-060's
 * publish gate refuses an empty hero), so `candidates` is never empty.
 */
export function pickMedia(cat: CarouselCat, loopIndex: number): MediaPick {
  const candidates: MediaPick[] = [
    ...cat.photos.map((photo): MediaPick => ({ kind: "photo", photo })),
    ...(cat.video === undefined ? [] : [{ kind: "video", video: cat.video } as const]),
  ];
  // Never empty — see the doc comment above.
  return candidates[loopIndex % candidates.length]!;
}

/** The window of a clip's seconds the carousel plays: the first `hold` seconds, capped at its length. */
export interface ClipWindow {
  start: number;
  end: number;
}

/**
 * The seconds of a clip a turn plays (FR-084): always the start, cut at `hold` or the
 * clip's own length, whichever is shorter — an eight-second turn shows a fifteen-second
 * clip's first eight seconds; a shorter clip plays to its end and holds its last frame.
 */
export function clipWindow(durationSeconds: number, hold: number): ClipWindow {
  return { start: 0, end: Math.min(durationSeconds, hold) };
}

import { expect, type Page } from "@playwright/test";

// F62: the carousel's/kiosk's two media layers are fixed nodes that swap `data-role` each
// beat; `carousel.module.css` orders their paint by role (z-index), not DOM order. These
// helpers read what a viewer's eye actually sees — the element under the frame's centre,
// and whether it is the cat named in the `<h1>` — the same technique the investigation's
// scratch `capture.mjs` used, kept small enough to live in the suite.

/** One cat's media, as `GET /api/carousel` shapes it — enough to say a URL is hers. */
interface CatMedia {
  photos: string[];
  video?: string;
}

/** `GET /api/carousel`, indexed by name, for matching a layer's painted file to a cat. */
export async function carouselMedia(page: Page): Promise<Map<string, CatMedia>> {
  const body = await page.evaluate(async () => {
    const response = await fetch("/api/carousel");
    return (await response.json()) as {
      cats: { name: string; photos: { src: string }[]; video?: { src: string } }[];
    };
  });
  return new Map(
    body.cats.map((cat) => [
      cat.name,
      {
        photos: cat.photos.map((photo) => photo.src),
        ...(cat.video === undefined ? {} : { video: cat.video.src }),
      },
    ]),
  );
}

/** Whether `src` (an absolute URL) is one of `media`'s files (relative `src`, `video`). */
export function ownsFile(media: CatMedia | undefined, src: string | null): boolean {
  if (media === undefined || src === null) return false;
  return [...media.photos, media.video].some((file) => file !== undefined && src.endsWith(file));
}

/** What painted on top of the stage's centre, and the incoming layer's own file. */
export interface Painted {
  /** `document.elementFromPoint` at the centre resolved inside `[data-role="incoming"]`. */
  incomingOnTop: boolean;
  /** The incoming layer's file: a photo's `background-image` URL, or a clip's `currentSrc`. */
  src: string | null;
  kind: "photo" | "video" | null;
  /**
   * Whether that file had already arrived: a photo's completed (`responseEnd > 0`)
   * Resource Timing entry (F62's preload target), or a video buffered past its first beat
   * of playback (`readyState >= HAVE_FUTURE_DATA`) — `<video preload="auto">` already
   * warms a clip once it is in the DOM, so Resource Timing's ranged requests are not a
   * reliable single "done" signal for it the way they are for a background-image fetch.
   */
  loaded: boolean;
  /**
   * A photo's count of completed Resource Timing entries for its own URL — exactly one
   * means the preload's own fetch was reused rather than fetched a second time when the
   * wipe needed it; always 0 for a video, where Resource Timing's ranged requests are not
   * counted (`loaded` is the video signal instead).
   */
  arrivals: number;
}

/**
 * Reads what is actually painted at the frame's centre (F62). The overlays (whichever
 * positioned siblings of the two `[data-layer]` nodes carry the scrim, bloom and text
 * column) get `pointer-events: none` only for this one read, restored before returning,
 * so `elementFromPoint` can reach the media layer underneath them — exactly as a viewer's
 * eye does, since paint order and hit-testing order are the same stacking order.
 */
export async function paintedAtCentre(page: Page): Promise<Painted> {
  return page.evaluate(() => {
    /** Mutes the overlays (every positioned sibling of the two `[data-layer]` nodes that
     * is not itself a layer — the scrim, the bloom, the text column) for one read, and
     * hands back the function that puts each one's `pointer-events` back. */
    function suspendOverlays(): () => void {
      const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-layer]"));
      const frameRoot = layers[0]?.parentElement;
      const overlays = Array.from(frameRoot?.children ?? []).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && !child.hasAttribute("data-layer"),
      );
      const saved = overlays.map((el) => el.style.pointerEvents);
      overlays.forEach((el) => {
        el.style.pointerEvents = "none";
      });
      return () => overlays.forEach((el, i) => (el.style.pointerEvents = saved[i] ?? ""));
    }

    /** How many completed Resource Timing entries `src` already has. */
    function arrivalsOf(src: string): number {
      return performance
        .getEntriesByType("resource")
        .filter((e) => e.name.endsWith(src) && (e as PerformanceResourceTiming).responseEnd > 0)
        .length;
    }

    /** The clip's own file and how far it has buffered, when the incoming layer holds one. */
    function videoFile(video: HTMLVideoElement): Omit<Painted, "incomingOnTop"> {
      return {
        src: video.currentSrc || video.getAttribute("src"),
        kind: "video",
        loaded: video.readyState >= 3, // HAVE_FUTURE_DATA
        arrivals: 0, // not a Resource Timing signal for video — see the field's own doc
      };
    }

    /** The photo's own URL, from the first slat's `background-image`, and its arrivals. */
    function photoFile(incoming: Element): Omit<Painted, "incomingOnTop"> {
      const slatFill = incoming.querySelector("[data-slat] > div");
      const match =
        slatFill === null
          ? null
          : /url\("?(.*?)"?\)/.exec(getComputedStyle(slatFill).backgroundImage);
      const src = match?.[1] ?? null;
      const arrivals = src === null ? 0 : arrivalsOf(src);
      return { src, kind: src === null ? null : "photo", loaded: arrivals > 0, arrivals };
    }

    /** The incoming layer's own file, from whichever of a clip or a photo it holds. */
    function incomingFile(incoming: Element | null): Omit<Painted, "incomingOnTop"> {
      if (incoming === null) return { src: null, kind: null, loaded: false, arrivals: 0 };
      const video = incoming.querySelector("video");
      return video === null ? photoFile(incoming) : videoFile(video);
    }

    const restore = suspendOverlays();
    const stageEl = document.querySelector("[data-beat]");
    const rect = stageEl?.getBoundingClientRect();
    const top =
      rect === undefined
        ? null
        : document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const incoming = document.querySelector('[data-role="incoming"]');
    const incomingOnTop = incoming !== null && top !== null && incoming.contains(top);
    const file = incomingFile(incoming);
    restore();
    return { incomingOnTop, ...file };
  });
}

export interface BoundaryCheckOptions {
  /**
   * Also assert a *photo* beat's incoming file had already fully arrived by +1.2s: exactly
   * one completed Resource Timing entry for its URL, proving the preload's own fetch was
   * reused rather than a second one starting at the boundary. Off by default — the plain
   * (untimed) case only cares that the right file is on top, not how it got there.
   *
   * Not checked for a *clip* beat, even when this is on: diagnosed directly against a
   * throttled `/kiosk` (Resource Timing entries and `request`/`response` events logged),
   * a detached preload `<video>`'s own fetch completes, but the later *visible* `<video>`
   * — a separate element, even at the same `src` — issues its own fresh byte-range request
   * at the boundary rather than reusing it; that request alone needs the full 1.5s, so
   * `readyState` is still 0 at +1.2s regardless of the preload. This held for
   * `<link rel="preload" as="video">` too before the detached-element swap (same failure
   * beat, same error). Real Cache-Control (`immutable`, checked in `derived.ts`) says this
   * is likely particular to how Chromium serves a media byte-range request under
   * Playwright's `page.route` interception, not a property of the preload code — but nothing
   * here can prove that either way, so the clip side of the promise is asserted only where
   * it can be shown true: `incomingOnTop` and `ownsFile`, both still required for every
   * beat, clip or photo, throttled or not.
   */
  requireLoaded?: boolean;
}

export interface BoundaryCheckResult {
  /** How many of the `count` beats held a clip as the incoming layer. */
  videoBeats: number;
}

/**
 * Checks `count` consecutive automatic boundaries (F62): waits for the `<h1>` to change,
 * then +1.2s later asserts the incoming layer is on top and its file belongs to the cat
 * just named (via `GET /api/carousel`) — optionally that the file had already arrived.
 * Shared by `/carousel` and `/kiosk`, plain and throttled: the four call sites differ only
 * in `requireLoaded`.
 */
export async function checkBoundaries(
  page: Page,
  count: number,
  options: BoundaryCheckOptions = {},
): Promise<BoundaryCheckResult> {
  const { requireLoaded = false } = options;
  const media = await carouselMedia(page);
  let name = await page.getByRole("heading", { level: 1 }).innerText();
  let videoBeats = 0;
  for (let i = 0; i < count; i++) {
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(name, {
      timeout: 5000,
    });
    name = await page.getByRole("heading", { level: 1 }).innerText();
    await page.waitForTimeout(1200);
    const painted = await paintedAtCentre(page);
    expect(painted.incomingOnTop, `beat ${i + 1} (${name}): incoming layer on top`).toBe(true);
    const cat = media.get(name);
    expect(cat, `beat ${i + 1}: "${name}" is in GET /api/carousel`).toBeDefined();
    expect(
      ownsFile(cat, painted.src),
      `beat ${i + 1} (${name}): incoming file ${String(painted.src)} is not ${name}'s`,
    ).toBe(true);
    if (painted.kind === "video") videoBeats++;
    if (requireLoaded && painted.kind === "photo") {
      expect(
        painted.loaded,
        `beat ${i + 1} (${name}): the incoming photo had not arrived by +1.2s`,
      ).toBe(true);
      expect(
        painted.arrivals,
        `beat ${i + 1} (${name}): expected exactly one completed fetch for the incoming photo, saw ${painted.arrivals}`,
      ).toBe(1);
    }
  }
  return { videoBeats };
}

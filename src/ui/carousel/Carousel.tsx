"use client";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { advance, type BeatState } from "@/core/carousel/beat";
import { pickMedia, type CarouselCat } from "@/core/carousel/roster";
import { useReducedMotion } from "@/ui/profile/use-reduced-motion";
import { Beat } from "./Beat";
import "./carousel-keyframes.css";
import styles from "./carousel.module.css";
import { CarouselControls } from "./CarouselControls";
import { EmptyRotation } from "./EmptyRotation";
import { counterLabel, upNext } from "./labels";
import { MediaLayer, type LayerContent } from "./Slats";
import { useBeat, type Beat as BeatClock } from "./use-beat";
import { useStageFit } from "./use-stage-fit";

// The carousel (ADR-009; FR-062–FR-064, FR-069, FR-084, FR-088): one 1920×1080 stage
// whose parity, pause and reduced-motion flags the stylesheet keys every animation on,
// the whole frame a link to the cat, and the controls beside it. The beat's every
// decision is beat.ts's through `useBeat`; what a beat shows is `pickMedia`'s. `/kiosk`
// shows the same stage with its own controls, a boundary callback for its poll, and its
// offline note — the three seams below; nothing else differs between the two pages.

/** What a page's controls are given: the beat, the cat on show, and whether anything moves. */
export interface ControlsContext {
  beat: BeatClock;
  cat: CarouselCat;
  reducedMotion: boolean;
}

export interface CarouselProps {
  /** Every live cat, as `GET /api/carousel` shapes them; empty means the empty rotation. */
  roster: CarouselCat[];
  /** The hold in seconds, already clamped by `parseHold` (FR-089). */
  hold: number;
  /**
   * Called at every beat boundary, automatic or manual, while the old beat still stands;
   * may hand back a fresh roster for the step to be taken from (the kiosk's poll).
   */
  onBoundary?: () => CarouselCat[] | undefined;
  /** The whole frame is the link to the cat (`/carousel`, FR-064); `false` on the kiosk. */
  linkFrame?: boolean;
  /** The controls beside the frame; `/carousel`'s visible four unless a page says otherwise. */
  controls?: (context: ControlsContext) => ReactNode;
  /** Anything else the stage — or the empty rotation — carries: the kiosk's offline note. */
  children?: ReactNode;
}

/** The visible four (server-boundary.md → `/carousel`). */
function visibleControls(context: ControlsContext): ReactNode {
  return <CarouselControls {...context} />;
}

interface Shown {
  key: string;
  current: LayerContent;
  previous: LayerContent | undefined;
}

// What the two media layers show: the current pick, and what the beat before it showed.
// Kept as render state (React's "information from previous renders" pattern) so the
// outgoing layer is right in the same commit the new beat lands in.
function useShown(current: LayerContent, key: string): Shown {
  const [shown, setShown] = useState<Shown>({ key, current, previous: undefined });
  if (shown.key !== key) {
    const next = { key, current, previous: shown.current };
    setShown(next);
    return next;
  }
  return shown;
}

/** The layer that is incoming for a parity; the other one is outgoing. */
function incomingFor(parity: BeatState["parity"]): 0 | 1 {
  return parity === "a" ? 0 : 1;
}

/**
 * Warms a photo one beat ahead: a `<link rel="preload">`, appended to `<head>` and removed
 * on cleanup.
 */
function preloadPhoto(href: string): () => void {
  const link = document.createElement("link");
  // Set as attributes, not IDL properties: jsdom does not reflect `.as` to the attribute,
  // and the attribute is what the browser (and the tests) read.
  link.setAttribute("rel", "preload");
  link.setAttribute("as", "image");
  link.setAttribute("href", href);
  document.head.appendChild(link);
  return () => {
    document.head.removeChild(link);
  };
}

/**
 * Warms a clip one beat ahead: a detached `<video preload="auto">`, never attached to the
 * page, whose only job is to start fetching `href` before the real, visible `<video>` needs
 * it. `<link rel="preload" as="video">` was tried first and dropped for the same reason
 * this is best-effort rather than guaranteed: under a throttled connection the following
 * beat's real `<video>` (a separate element, even at the same `src`) was still seen issuing
 * its own fresh byte-range request at the boundary — `readyState` still 0 at +1.2s either
 * way, on both techniques, in a Chromium diagnosed directly against `page.route`
 * interception (see `tests/e2e/_lib/paint.ts`'s `BoundaryCheckOptions` doc). This still
 * starts the fetch a full beat sooner than doing nothing, which a real browser's own cache
 * heuristics outside that one harness may make more of; nothing here can promise it does,
 * so no test does either — only that it never delays the beat clock (ADR-009, FR-066).
 */
function preloadClip(href: string): () => void {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = href;
  return () => {
    video.removeAttribute("src");
    video.load();
  };
}

/**
 * Warms the *next* beat's photo or clip one beat ahead (F62; ADR-009, FR-066): found by
 * running `advance` (its parity is ignored; only the index and loop it lands on matter), so
 * a cold `/media/` fetch is already in flight, or done, by the time the wipe needs it.
 * Never touches the beat clock: a slow file stays a late picture, never a late beat.
 */
function usePreloadNext(roster: CarouselCat[], index: number, loopIndex: number): void {
  useEffect(() => {
    const next = advance({ index, loopIndex, parity: "a", paused: false }, roster);
    const cat = roster[next.index]!;
    const pick = pickMedia(cat, next.loopIndex);
    return pick.kind === "photo" ? preloadPhoto(pick.photo.src) : preloadClip(pick.video.src);
  }, [roster, index, loopIndex]);
}

interface FrameProps {
  roster: CarouselCat[];
  linked: boolean;
  beat: BeatClock;
  /** The cat on show: the beat's index, kept inside the roster. */
  index: number;
  /** The transform the incoming layer had the instant this beat began. */
  held: string | undefined;
  layers: RefObject<(HTMLDivElement | null)[]>;
  reducedMotion: boolean;
}

/**
 * The whole picture — both media layers, the scrim, the bloom, the column — as the link
 * to the cat, or on the kiosk (where a tap must not leave the loop) as a plain frame.
 */
function Frame({ roster, linked, beat, index, held, layers, reducedMotion }: FrameProps) {
  const nameId = useId();
  const lineId = useId();
  const { loopIndex, parity } = beat.state;
  const cat = roster[index]!;
  const pick = pickMedia(cat, loopIndex);
  const shown = useShown({ cat, pick }, `${cat.url}|${loopIndex}|${parity}`);
  const incoming = incomingFor(parity);
  usePreloadNext(roster, index, loopIndex);
  const Root = linked ? "a" : "div";
  const link = linked ? { href: cat.url, "aria-labelledby": `${nameId} ${lineId}` } : {};
  return (
    <Root className={styles.frame} {...link}>
      {([0, 1] as const).map((layer) => (
        <MediaLayer
          key={layer}
          ref={(node) => {
            layers.current[layer] = node;
          }}
          role={layer === incoming ? "incoming" : "outgoing"}
          content={layer === incoming ? shown.current : shown.previous}
          held={held}
          frozen={beat.frozen}
          reducedMotion={reducedMotion}
        />
      ))}
      <div className={styles.scrim} />
      <div className={styles.bloom} />
      <Beat
        cat={cat}
        counter={counterLabel(index, roster.length)}
        upNext={upNext(roster, index)}
        nameId={nameId}
        lineId={lineId}
      />
    </Root>
  );
}

/**
 * The transform the outgoing layer holds, read while the old beat still stands — mid-drift
 * on a manual move, the drift's end on an automatic one — and the page's boundary callback
 * run in the same breath, so a fresh roster reaches the step.
 */
function useHeldTransform(onBoundary: CarouselProps["onBoundary"]) {
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const parityRef = useRef<BeatState["parity"]>("a");
  const [held, setHeld] = useState<string | undefined>(undefined);
  const boundary = useRef(onBoundary);
  useEffect(() => {
    boundary.current = onBoundary;
  }, [onBoundary]);
  const onBeforeStep = useCallback(() => {
    const node = layers.current[incomingFor(parityRef.current)];
    if (node !== null && node !== undefined) setHeld(getComputedStyle(node).transform);
    return boundary.current?.();
  }, []);
  return { layers, parityRef, held, onBeforeStep };
}

function Stage(props: CarouselProps) {
  const { roster, hold, controls = visibleControls, linkFrame = true, children } = props;
  const reducedMotion = useReducedMotion();
  const { layers, parityRef, held, onBeforeStep } = useHeldTransform(props.onBoundary);
  const beat = useBeat({ roster, hold, reducedMotion, onBeforeStep });
  useEffect(() => {
    parityRef.current = beat.state.parity;
  }, [beat.state.parity, parityRef]);
  // The roster is never empty here; a roster that just changed is clamped for this render,
  // the beat's own index follows through applyRoster in the hook's effect.
  const index = Math.min(beat.state.index, roster.length - 1);
  const cat = roster[index]!;
  // F64: the CSS-only fit is the fallback until this has measured `.page` and computed a
  // device-pixel-exact one (stage-fit.ts, use-stage-fit.ts).
  const { pageRef, style: fitStyle, snapped } = useStageFit();
  const style = { "--hold": `${hold}s`, ...fitStyle } as CSSProperties;
  return (
    <main className={styles.page} ref={pageRef}>
      <div
        className={styles.stage}
        style={style}
        data-fit={snapped ? "snapped" : undefined}
        data-beat={beat.state.parity}
        data-paused={beat.paused}
        data-frozen={beat.frozen}
        data-reduced={reducedMotion}
        onPointerMove={beat.pointerMove}
        onPointerDown={beat.pointerMove}
        onPointerLeave={beat.pointerLeave}
      >
        <Frame
          roster={roster}
          linked={linkFrame}
          beat={beat}
          index={index}
          held={held}
          layers={layers}
          reducedMotion={reducedMotion}
        />
        {controls({ beat, cat, reducedMotion })}
        {children}
      </div>
    </main>
  );
}

/** The carousel for a roster, or the empty rotation when nothing is live (FR-067). */
export function Carousel({ roster, children, ...rest }: CarouselProps) {
  return roster.length === 0 ? (
    <EmptyRotation>{children}</EmptyRotation>
  ) : (
    <Stage roster={roster} {...rest}>
      {children}
    </Stage>
  );
}

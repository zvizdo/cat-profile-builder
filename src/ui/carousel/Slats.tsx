"use client";
import { useEffect, useRef, type CSSProperties, type Ref } from "react";
import type { CarouselCat, CarouselPhoto, CarouselVideo, MediaPick } from "@/core/carousel/roster";
import styles from "./carousel.module.css";

// The frame's two media layers (comp 6a; DESIGN.md §5 moves 1 and 2; FR-084). The two
// nodes are fixed and swap roles every beat: the incoming one drifts for the whole beat
// while six slats of the new photo — or one wipe over the clip — reveal it; the outgoing
// one keeps exactly what it showed (the photo fully open, or the clip paused on its last
// frame) held at the transform it had when the beat changed. The DOM never grows.

/** How many slats the wipe has (comp: six, 55ms apart). */
const SLATS = 6;

/** A layer's part in the current beat. */
export type LayerRole = "incoming" | "outgoing";

/** The photo a layer paints: its URL and its focal point, as data, not styling (FR-072). */
function photoStyle(photo: CarouselPhoto): CSSProperties {
  return {
    backgroundImage: `url("${photo.src}")`,
    backgroundPosition: `${photo.focal.x}% ${photo.focal.y}%`,
  };
}

/** Six slats of one photo, each clipping its sixth of a full-width cover copy. */
function Slats({ photo }: { photo: CarouselPhoto }) {
  const style = photoStyle(photo);
  return (
    <div className={styles.slats} role="img" aria-label={photo.alt}>
      {Array.from({ length: SLATS }, (_, i) => (
        <div key={i} className={styles.slat} data-slat={i}>
          <div className={styles.slatFill} style={style} />
        </div>
      ))}
    </div>
  );
}

interface ClipProps {
  video: CarouselVideo;
  /** Runs only while its layer is incoming and nothing is frozen (FR-069, FR-084). */
  playing: boolean;
}

// The clip starts from the effect, never from an `autoplay` attribute, so a reduced-motion
// visitor never sees a frame move and the served markup carries no autoplay. A `play()`
// the browser refuses (its autoplay policy) leaves the poster — the beat still holds. The
// cut at the hold is the beat clock's: the layer turns outgoing and the clip pauses where
// it is, so the next wipe lands over its last frame rather than the poster.
function Clip({ video, playing }: ClipProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (playing) element.play().catch(() => undefined);
    else element.pause();
  }, [playing, video.src]);
  return (
    <div className={styles.clipWrap}>
      <video
        ref={ref}
        className={styles.clip}
        src={video.src}
        poster={video.poster}
        aria-label={video.alt}
        muted
        loop
        playsInline
        preload="auto"
      />
    </div>
  );
}

/** What one layer shows: a cat's pick for one beat. */
export interface LayerContent {
  cat: CarouselCat;
  pick: MediaPick;
}

export interface MediaLayerProps {
  role: LayerRole;
  /** Nothing before the first beat's outgoing layer has anything to hold. */
  content: LayerContent | undefined;
  /** The transform the layer had as it turned outgoing; the CSS end transform otherwise. */
  held: string | undefined;
  frozen: boolean;
  reducedMotion: boolean;
  ref: Ref<HTMLDivElement>;
}

/** One of the two layers, in whichever role this beat gives it. */
export function MediaLayer({ role, content, held, frozen, reducedMotion, ref }: MediaLayerProps) {
  const outgoing = role === "outgoing";
  return (
    <div
      ref={ref}
      className={styles.layer}
      data-layer=""
      data-role={role}
      aria-hidden={outgoing ? "true" : undefined}
      style={outgoing && held !== undefined ? { transform: held } : undefined}
    >
      {content === undefined ? null : content.pick.kind === "photo" ? (
        <Slats photo={content.pick.photo} />
      ) : (
        <Clip video={content.pick.video} playing={!outgoing && !frozen && !reducedMotion} />
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatClock } from "@/core/format/clock";
import type { ResolvedMedia } from "@/core/profile/schema";
import { Pause, Play } from "@/ui/shared/icons";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import styles from "../profile.module.css";
import { useReducedMotion } from "../use-reduced-motion";

// The clip (hi-fi `Moving picture`; FR-085, FR-069, ADR-006): starts by itself, muted,
// looping, inline, at its own aspect ratio, opening as it enters. One visible control pauses and
// resumes it; there is no `controls` bar and nothing about sound, because the clip has
// none. Under reduced motion it waits for the person to press Play. A clip with no
// poster stands on the striped placeholder, never a blank frame.

/**
 * The manifest entry and the anchor only: this is a client component, so every prop is
 * serialised into the response, and the block itself carries an id (FR-059).
 */
export interface VideoProps {
  media: ResolvedMedia | undefined;
  id?: string;
}

/** The kicker (CONTENT.md → Public profile → Sections). */
const KICKER = "Moving picture";

/** `0:14 · no sound`, or `no sound` when the length is not known. */
function metaLine(media: ResolvedMedia): string {
  return media.durationSeconds === undefined
    ? "no sound"
    : `${formatClock(media.durationSeconds)} · no sound`;
}

// Starts the clip from the effect unless motion is reduced, so the served markup never
// carries `autoplay` and a reduced-motion visitor never sees a frame move. The control's
// word follows the element's own play and pause events; a `play()` the browser refuses
// (its autoplay policy) leaves the clip paused and the word at `Play`, and the first press
// starts it.
function usePlayback(reduced: boolean) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (video === null) return;
    if (reduced) video.pause();
    else video.play().catch(() => setPaused(true));
  }, [reduced]);
  const toggle = (): void => {
    const video = ref.current;
    if (video === null) return;
    if (video.paused) video.play().catch(() => setPaused(true));
    else video.pause();
  };
  const onPlay = (): void => setPaused(false);
  const onPause = (): void => setPaused(true);
  return { ref, paused: paused ?? reduced, toggle, onPlay, onPause };
}

function Frame({ media }: { media: ResolvedMedia }) {
  const reduced = useReducedMotion();
  const { ref, paused, toggle, onPlay, onPause } = usePlayback(reduced);
  const Glyph = paused ? Play : Pause;
  // The clip's own ratio is data: a phone clip stands upright, a landscape one lies flat.
  const ratio = { "--ratio": (media.width / media.height).toFixed(4) } as CSSProperties;
  return (
    <div className={styles.frame} style={ratio} data-scene="enter">
      {media.poster === undefined ? (
        <StripedPlaceholder label="clip" className={styles.frameStripes} />
      ) : null}
      <video
        ref={ref}
        className={styles.clip}
        src={media.src}
        poster={media.poster}
        aria-label={media.alt}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={onPlay}
        onPause={onPause}
      />
      <button type="button" className={styles.videoControl} onClick={toggle}>
        <Glyph aria-hidden="true" />
        {paused ? "Play" : "Pause"}
      </button>
    </div>
  );
}

/** The video section: kicker, the length and `no sound`, then the clip with its control. */
export function Video({ media, id }: VideoProps) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.container}>
        <div className={`${styles.videoHead} ${styles.riseSoft}`} data-scene="enter">
          <h2 className={styles.kicker}>{KICKER}</h2>
          {media === undefined ? null : <span className={styles.videoMeta}>{metaLine(media)}</span>}
        </div>
        {media === undefined ? (
          <StripedPlaceholder label="clip" aspect="video" />
        ) : (
          <Frame media={media} />
        )}
      </div>
    </section>
  );
}

import type { CarouselCat } from "@/core/carousel/roster";
import { Next, Open, Pause, Play, Prev } from "@/ui/shared/icons";
import styles from "./carousel.module.css";
import { CONTROLS } from "./strings";
import type { Beat } from "./use-beat";

// The visible controls `/carousel` carries (server-boundary.md → Pages; FR-063, FR-064):
// previous, pause/resume, next, and a link to the cat — outside the frame's own link, so
// nothing interactive nests, centred on the safe inset in the footer's voice. Each is a
// 44px target named for assistive technology; the arrows and Space do the same from
// anywhere on the page.

export interface CarouselControlsProps {
  /** The beat: its pause flag and its three moves. */
  beat: Pick<Beat, "state" | "prev" | "next" | "togglePause">;
  /** The current cat, for the link. */
  cat: Pick<CarouselCat, "name" | "url">;
  /** Nothing moves by itself, so there is nothing to pause: the toggle is not offered. */
  reducedMotion: boolean;
}

/** The four controls as a named group. */
export function CarouselControls({ beat, cat, reducedMotion }: CarouselControlsProps) {
  const { paused } = beat.state;
  const { name, url } = cat;
  const { prev: onPrev, next: onNext, togglePause: onTogglePause } = beat;
  const Toggle = paused ? Play : Pause;
  return (
    <div className={styles.controls} role="group" aria-label={CONTROLS.group}>
      <button type="button" className={styles.control} aria-label={CONTROLS.prev} onClick={onPrev}>
        <Prev />
      </button>
      {reducedMotion ? null : (
        <button
          type="button"
          className={styles.control}
          aria-label={paused ? CONTROLS.resume : CONTROLS.pause}
          onClick={onTogglePause}
        >
          <Toggle />
        </button>
      )}
      <button type="button" className={styles.control} aria-label={CONTROLS.next} onClick={onNext}>
        <Next />
      </button>
      <a className={styles.control} href={url} aria-label={CONTROLS.open(name)}>
        <Open />
      </a>
    </div>
  );
}

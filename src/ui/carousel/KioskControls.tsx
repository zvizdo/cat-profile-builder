"use client";
import { useState, type FocusEvent } from "react";
import type { ControlsContext } from "./Carousel";
import styles from "./carousel.module.css";
import { CarouselControls } from "./CarouselControls";
import { useIdleResume } from "./use-idle-resume";

// The kiosk's controls (server-boundary.md → `/kiosk`; FR-063, FR-064): `/carousel`'s
// four, unchanged, on a strip that is shown while the pointer moves over the frame — or
// presses it, so a tap counts — and fades three still seconds later: the beat hook's own
// pointer-idle signal, the one that also pauses the loop, so there is one clock for both.
// Faded is only `opacity` (ADR-009): the buttons stay in the DOM and in the tab order, and
// one taking keyboard focus shows the strip again — keyboard focus only, since a clicked
// button keeps focus for good and would pin the strip lit on an unattended screen. On the
// kiosk "Open this cat" is the one way to a profile; the frame is not a link. Under reduced
// motion nothing fades and the strip simply stays. A pause here gives up after a minute
// without input (`useIdleResume`), so a passer-by cannot stop the loop for the event.

/** The four controls on a strip that fades. */
export function KioskControls({ beat, cat, reducedMotion }: ControlsContext) {
  const [focused, setFocused] = useState(false);
  useIdleResume(beat);
  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.target.matches(":focus-visible")) setFocused(true);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    // Focus moving between the strip's own buttons is not focus leaving it.
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };
  return (
    <div
      className={styles.strip}
      data-shown={reducedMotion || beat.hovered || focused}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <CarouselControls beat={beat} cat={cat} reducedMotion={reducedMotion} />
    </div>
  );
}

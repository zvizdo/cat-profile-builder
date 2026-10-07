"use client";
import { useEffect } from "react";
import type { CarouselCat } from "@/core/carousel/roster";
import { formatTimeOfDay } from "@/core/format/time-of-day";
import { useReducedMotion } from "@/ui/profile/use-reduced-motion";
import { useWakeLock } from "@/ui/shared/use-wake-lock";
import { Carousel, type ControlsContext } from "./Carousel";
import styles from "./carousel.module.css";
import { KioskControls } from "./KioskControls";
import { OFFLINE } from "./strings";
import { useKioskPoll } from "./use-kiosk-poll";

// The kiosk (server-boundary.md → `/kiosk`; FR-064, FR-065, FR-066): `/carousel`'s stage
// and nothing around it — the frame not a link, so a tap never leaves the loop (the
// strip's "Open this cat" is the way to a profile) — fullscreen from the first press, the
// screen kept awake, the roster refreshed every five minutes at a beat boundary, and,
// while the feed is quiet, the offline sentence with the time the roster was last known
// good. Every beat decision is still the carousel's; this only wires the room around it.

export interface KioskShellProps {
  /** Every live cat as the server page read them; the poll takes over from here. */
  roster: CarouselCat[];
  /** The hold in seconds, already clamped by `parseHold` (FR-089). */
  hold: number;
}

/**
 * Asks for fullscreen on the first pointer or key press — the browser grants it only
 * inside such a gesture — and never again: a volunteer who leaves fullscreen on purpose
 * is not fought. The request is refused (its promise rejects) where a permissions policy
 * forbids it or the press did not count as a gesture; either way the page carries on.
 * Not every browser offers it on a document (iOS Safari does not), hence the check.
 */
function useFullscreenOnFirstPress(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (typeof root.requestFullscreen !== "function") return;
    const request = (): void => {
      window.removeEventListener("pointerdown", request);
      window.removeEventListener("keydown", request);
      root.requestFullscreen().catch(() => undefined);
    };
    window.addEventListener("pointerdown", request);
    window.addEventListener("keydown", request);
    return () => {
      window.removeEventListener("pointerdown", request);
      window.removeEventListener("keydown", request);
    };
  }, []);
}

interface OfflineNoteProps {
  /** The last good moment, or `undefined` while the feed answers. */
  lastGoodAt: number | undefined;
  /** Nothing is looping (the empty rotation), so the sentence about the loop is not said. */
  looping: boolean;
}

/** The offline note: a live region that is empty while the feed answers. */
function OfflineNote({ lastGoodAt, looping }: OfflineNoteProps) {
  return (
    <div className={styles.offline} role="status">
      {lastGoodAt === undefined ? null : (
        <>
          {looping ? <span className={styles.offlineSentence}>{OFFLINE.sentence}</span> : null}
          <span className={`${styles.mono} ${styles.offlineLine}`}>
            {OFFLINE.updated(formatTimeOfDay(new Date(lastGoodAt)))}
          </span>
        </>
      )}
    </div>
  );
}

function kioskControls(context: ControlsContext) {
  return <KioskControls {...context} />;
}

/** The carousel as an unattended event display. */
export function KioskShell({ roster, hold }: KioskShellProps) {
  const reducedMotion = useReducedMotion();
  const poll = useKioskPoll({ initial: roster, immediate: reducedMotion });
  useFullscreenOnFirstPress();
  useWakeLock();
  return (
    <Carousel
      roster={poll.roster}
      hold={hold}
      onBoundary={poll.drain}
      controls={kioskControls}
      linkFrame={false}
    >
      <OfflineNote
        lastGoodAt={poll.failedSince === undefined ? undefined : poll.lastGoodAt}
        looping={poll.roster.length > 0}
      />
    </Carousel>
  );
}

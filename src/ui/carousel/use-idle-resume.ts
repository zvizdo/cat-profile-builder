"use client";
import { useEffect } from "react";
import type { Beat } from "./use-beat";

// The kiosk's unattended resume (server-boundary.md → `/kiosk`; FR-062, FR-066): a pause
// — Space, an arrow, a control — is right for the person who pressed it, and wrong for
// the event once they walk away. On the kiosk only, a pause outlives the last pointer or
// key input by `KIOSK_IDLE_RESUME_MS` and no longer; `/carousel` keeps a pause for good.

/** How long a paused kiosk waits without input before the loop goes on by itself. */
export const KIOSK_IDLE_RESUME_MS = 60_000;

/**
 * While the beat is paused, resumes it after {@link KIOSK_IDLE_RESUME_MS} without a
 * pointer move, a press or a key; every input starts the wait over. Nothing is armed
 * while the beat plays.
 */
export function useIdleResume(beat: Beat): void {
  const { paused } = beat.state;
  const { togglePause } = beat;
  useEffect(() => {
    if (!paused) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => {
      clearTimeout(timer);
      timer = setTimeout(togglePause, KIOSK_IDLE_RESUME_MS);
    };
    arm();
    const inputs = ["pointermove", "pointerdown", "keydown"] as const;
    for (const input of inputs) window.addEventListener(input, arm);
    return () => {
      clearTimeout(timer);
      for (const input of inputs) window.removeEventListener(input, arm);
    };
  }, [paused, togglePause]);
}

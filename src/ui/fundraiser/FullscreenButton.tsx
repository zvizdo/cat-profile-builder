"use client";
import { useEffect, useRef, useState } from "react";
import { Expand } from "@/ui/shared/icons";
import styles from "@/ui/fundraiser/fundraiser.module.css";
import { FULLSCREEN } from "@/ui/fundraiser/strings";
import type { EnterResult } from "@/ui/fundraiser/use-fullscreen";

/** How long the refusal sentence stays beside the button before it clears. */
export const REFUSED_STATUS_MS = 6000;

export interface FullscreenButtonProps {
  /** The browser has a full screen API; where it does not, a sentence replaces the button. */
  supported: boolean;
  /** Asks the browser for full screen. It runs inside the press, as browsers require. */
  enter(): Promise<EnterResult>;
}

/**
 * The Full screen control in the top right corner of the stage, outlined in the display's own
 * voice. A press asks the browser for full screen; if the browser says no, the same sentence
 * the unsupported case uses appears in a status line beside the button for six seconds. Where
 * there is no full screen to ask for, the sentence stands alone and there is no button.
 */
export function FullscreenButton({ supported, enter }: FullscreenButtonProps) {
  const [refused, setRefused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!supported) {
    return (
      <div className={styles.fullscreen}>
        <p className={styles.fullscreenNote}>{FULLSCREEN.unavailable}</p>
      </div>
    );
  }

  const press = (): void => {
    void enter().then((result) => {
      if (result !== "refused") return;
      clearTimeout(timer.current);
      setRefused(true);
      timer.current = setTimeout(() => setRefused(false), REFUSED_STATUS_MS);
    });
  };

  return (
    <div className={styles.fullscreen}>
      <p role="status" className={styles.fullscreenNote}>
        {refused ? FULLSCREEN.unavailable : null}
      </p>
      <button type="button" className={styles.fullscreenButton} onClick={press}>
        <Expand />
        <span className={styles.fullscreenLabel}>{FULLSCREEN.button}</span>
      </button>
    </div>
  );
}

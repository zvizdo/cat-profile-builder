"use client";
import { useEffect } from "react";

/**
 * Keeps the screen awake for as long as the page is visible: a screen wake lock is
 * released by the browser when the page hides, so it is asked for again each time the
 * page is visible. The request is refused (its promise rejects) when the page is hidden
 * or the device is saving power; the loop runs regardless. Browsers without the API
 * (Firefox before 126) have nothing to hold.
 */
export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock: WakeLock | undefined = navigator.wakeLock;
    if (wakeLock === undefined) return;
    let sentinel: WakeLockSentinel | undefined;
    const request = (): void => {
      wakeLock.request("screen").then(
        (granted) => {
          sentinel = granted;
        },
        () => undefined,
      );
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, []);
}

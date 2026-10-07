"use client";
import { useCallback, useSyncExternalStore } from "react";
import { useMediaQuery } from "@/ui/shared/use-media-query";

/**
 * The media query a browser may answer for a window put in full screen by F11 or a kiosk
 * flag, where `document.fullscreenElement` stays null. Whether any browser does is recorded
 * in research.md R8; the page only listens, it never depends on it.
 */
const DISPLAY_MODE_FULLSCREEN = "(display-mode: fullscreen)";

/** What the full screen button learns when it asks. */
export type EnterResult = "entered" | "refused";

/** What `useFullscreen` returns. */
export interface FullscreenState {
  /** The browser has a full screen API to ask. False on iPhone Safari. */
  supported: boolean;
  /** The page is in display state: an element is full screen, or the window says it is. */
  active: boolean;
  /** Ask for full screen. Call it straight from a press: browsers demand a user gesture. */
  enter(): Promise<EnterResult>;
}

function subscribeToFullscreenChange(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

function elementIsFullscreen(): boolean {
  return Boolean(document.fullscreenElement);
}

function serverNotFullscreen(): boolean {
  return false;
}

// `supported` never changes while the page is open, so nothing subscribes to it.
function subscribeNever(): () => void {
  return () => {};
}

function canRequest(): boolean {
  return typeof document.documentElement.requestFullscreen === "function";
}

// The server cannot ask, so it renders for a browser that can: a normal browser keeps the
// button, and only one without the API swaps it for the sentence once it hydrates.
function serverCanRequest(): boolean {
  return true;
}

/**
 * Whether the page is in display state and a way into full screen. `active` is true while
 * `document.fullscreenElement` is set or `(display-mode: fullscreen)` matches, and it is
 * re-read on `fullscreenchange` and on the query's `change`, so Escape and the browser's own
 * exit are only ever followed, never handled. On the server `active` is false and `supported`
 * is true, so the first client render matches the server's markup.
 */
export function useFullscreen(): FullscreenState {
  const element = useSyncExternalStore(
    subscribeToFullscreenChange,
    elementIsFullscreen,
    serverNotFullscreen,
  );
  const displayMode = useMediaQuery(DISPLAY_MODE_FULLSCREEN);
  const supported = useSyncExternalStore(subscribeNever, canRequest, serverCanRequest);
  const enter = useCallback(async (): Promise<EnterResult> => {
    try {
      await document.documentElement.requestFullscreen();
      return "entered";
    } catch {
      return "refused";
    }
  }, []);
  return { supported, active: element || displayMode, enter };
}

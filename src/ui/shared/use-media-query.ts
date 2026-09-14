"use client";
import { useCallback, useSyncExternalStore } from "react";

// One media query as React state (F46): `true` while the window matches it, re-read the
// moment the window crosses it, and `false` where there is no window to ask — the
// server, and jsdom without a stub — so the server's markup is the wide layout and a
// narrower window switches on mount, the way `use-surface.ts` already treats the phone.

/** The query list, or `undefined` where there is no window to ask. */
function queryList(query: string): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(query);
}

function never(): boolean {
  return false;
}

/** Whether the window matches `query` now; `false` on the server. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = queryList(query);
      if (list === undefined) return () => {};
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const read = useCallback(() => queryList(query)?.matches === true, [query]);
  return useSyncExternalStore(subscribe, read, never);
}

function subscribeNever(): () => void {
  return () => {};
}

function hydrated(): boolean {
  return true;
}

/**
 * `false` in the server's markup and in the render that hydrates it, `true` from the
 * first client render after: what a component reads to keep a CSS-only shape (a
 * `max-wide:` guard) exactly as long as the window is unknown, so nothing jumps once
 * a media query answers (F45 review round 1, finding 4).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, hydrated, never);
}

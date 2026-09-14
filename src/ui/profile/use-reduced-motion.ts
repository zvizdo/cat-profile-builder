"use client";
import { useSyncExternalStore } from "react";

// Whether the visitor asked for less motion (ADR-009's behaviour hook; FR-069). The
// stylesheet answers the same query for layout; this is for what CSS cannot decide, such
// as whether a clip starts by itself. The server snapshot is `false`, so markup is the
// moving version and the browser settles it on hydration.

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** True when `prefers-reduced-motion: reduce` matches; false on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

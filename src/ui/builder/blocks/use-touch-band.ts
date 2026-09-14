"use client";
import { useSyncExternalStore } from "react";
import { useSurface } from "../use-surface";

// The touch band (TOKENS.json `breakpoints.tablet`; F28 review #6; comp 7c "iPad
// 1024×768 · touch-first"): 768–1179, the width between the phone floor
// (`use-surface.ts`'s 768px, where the phone builder takes over entirely) and where the
// docked CATalyst column starts at 1180 (`--breakpoint-wide`, globals.css). A finger in
// this band has no hover to summon a row with, so `BlockShell`'s label row draws its
// actions as always-visible pills instead of the pointer-only hover reveal; at `wide`
// and up the hover reveal is unchanged. One media query is the source, read the same
// way `useSurface` reads its own — a `matchMedia` list kept in sync through
// `useSyncExternalStore`, `false` wherever there is no window to ask (the server, and a
// pointer width once it hydrates).

/** 768–1179: within the full builder's floor, short of the docked `wide` column. */
export const TOUCH_QUERY = "(min-width: 768px) and (max-width: 1179px)";

/** The query list, or `undefined` where there is no window to ask. */
function queryList(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(TOUCH_QUERY);
}

/** Whether the window sits in the touch band right now; `false` where there is no window. */
export function readTouchBand(): boolean {
  return queryList()?.matches === true;
}

/** Calls `onChange` when the window crosses into or out of the band; answers the way to stop. */
export function subscribeTouchBand(onChange: () => void): () => void {
  const list = queryList();
  if (list === undefined) return () => {};
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function serverTouchBand(): boolean {
  return false;
}

/** `true` while the window is 768–1179px wide, `false` otherwise and on the server. */
export function useTouchBand(): boolean {
  return useSyncExternalStore(subscribeTouchBand, readTouchBand, serverTouchBand);
}

/**
 * F55: `true` wherever a finger is the pointer — the phone under 768px (`useSurface`)
 * and the touch band above it, so everything under 1180px — for a control that must
 * not wait for a hover, or a word that must not say "drop". `false` from 1180px and on
 * the server.
 */
export function useTouch(): boolean {
  const phone = useSurface() === "phone";
  const band = useTouchBand();
  return phone || band;
}

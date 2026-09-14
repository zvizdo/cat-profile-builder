"use client";
import { useSyncExternalStore } from "react";

// Which builder a window gets (data-model.md → Builder session `surface`; FR-091;
// contracts/server-boundary.md → Pages): `phone` under 768px, `full` from it — the same
// floor as Tailwind's `md`, so the stylesheet and the tree agree — and `phone` again on
// a window under 480px tall, whatever its width (design 2026-09-13, out of scope:
// "landscape phone layouts get the same one-column layout" — a phone turned sideways
// is 844 wide and 390 tall, and the three-column builder has no room in 390px; F45).
// One media query is the source; the helper request carries the answer from T036. The
// server has no window and answers `full`, so the markup hydrates as the full builder
// and a phone switches on mount — its full tree is hidden under `md` by the
// stylesheet, so nothing shows twice.

/** The two builders a window can get. */
export type Surface = "full" | "phone";

/** Everything under the tablet floor is a phone — and so is a window under 480px tall
 * (TOKENS.json `breakpoints.phoneLandscape`): a phone held sideways. */
export const PHONE_QUERY = "(max-width: 767px), (max-height: 479px)";

/** The query list, or `undefined` where there is no window to ask. */
function queryList(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(PHONE_QUERY);
}

/** The surface the window is at now; `full` where there is no window. */
export function readSurface(): Surface {
  return queryList()?.matches === true ? "phone" : "full";
}

/** Calls `onChange` when the window crosses the floor; answers the way to stop. */
export function subscribeSurface(onChange: () => void): () => void {
  const list = queryList();
  if (list === undefined) return () => {};
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function serverSurface(): Surface {
  return "full";
}

/** `"phone"` while the window is under 768px, `"full"` otherwise and on the server. */
export function useSurface(): Surface {
  return useSyncExternalStore(subscribeSurface, readSurface, serverSurface);
}

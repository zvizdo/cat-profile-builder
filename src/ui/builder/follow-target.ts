import { blockElementId } from "./readiness-scroll";

// Where a block the helper touched is on the page, and how the view gets there (F34,
// "follow, then overview"). The phone column's frames carry `blockElementId` the same
// way the desktop's do (`BlockFrame` / `FixedHeroFrame` — `useSurface` only drops the
// handle column, not the id), so one lookup covers both. Before F44 the phone canvas was
// a separate public renderer (`PhoneCanvas`) with no block ids of its own, needing a
// section-by-position fallback here; that renderer is gone (F60: `[data-phone-canvas]`
// matches nothing in `src/` any more) and the fallback went with it.

/** How long the ring blinks — two slow pulses (DESIGN.md §5) — and how long a static
 * ring stands under reduced motion. `globals.css`'s `pulse-ring` runs for the same time. */
export const PULSE_MS = 1600;

/**
 * The element on the page that shows `blockId` — its frame — or `null` when it isn't
 * there (the block was removed again, or the page is mid-render).
 */
export function locateBlock(blockId: string): HTMLElement | null {
  return document.getElementById(blockElementId(blockId));
}

/**
 * Brings `element` to the middle of the view: a glide, or at once under reduced motion —
 * the same place either way, so following the helper never depends on the animation.
 */
export function scrollToBlock(element: HTMLElement): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

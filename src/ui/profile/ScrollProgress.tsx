"use client";
import { useEffect } from "react";
import { useReducedMotion } from "./use-reduced-motion";

// The fallback for browsers without scroll-driven animations (ADR-009): every
// `[data-scene]` gets a `--progress` from 0 to 1 that the stylesheet's paused keyframes
// read through a negative `animation-delay`. An IntersectionObserver keeps the set of
// scenes in view small; one scroll listener, coalesced to a frame, updates them.

/** How a scene's progress is measured, from its `data-scene` value. */
type SceneKind = "enter" | "cover" | "pin";

/** The share of the viewport an entering section crosses before it has fully risen. */
const ENTRY_SHARE = 0.85;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Progress for one scene: `enter` runs from the element's top crossing the bottom edge to
 * it reaching the upper 15%; `cover` from the top entering at the bottom to the bottom
 * leaving at the top; `pin` from the element's top reaching the top edge to its bottom
 * reaching the bottom edge, which is exactly the stretch its sticky child holds.
 */
export function sceneProgress(kind: SceneKind, rect: DOMRect, viewport: number): number {
  switch (kind) {
    case "enter":
      return clamp01((viewport - rect.top) / (viewport * ENTRY_SHARE));
    case "cover":
      return clamp01((viewport - rect.top) / (viewport + rect.height));
    case "pin":
      return clamp01(-rect.top / Math.max(1, rect.height - viewport));
  }
}

function kindOf(element: Element): SceneKind {
  const value = element.getAttribute("data-scene");
  return value === "cover" || value === "pin" ? value : "enter";
}

function supportsScrollTimelines(): boolean {
  return CSS.supports("animation-timeline: view()");
}

/** Attaches the observer and the scroll listener; returns their teardown. */
function drive(): () => void {
  const visible = new Set<HTMLElement>();
  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const viewport = window.innerHeight;
    for (const element of visible) {
      const progress = sceneProgress(kindOf(element), element.getBoundingClientRect(), viewport);
      element.style.setProperty("--progress", String(progress));
    }
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(paint);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
      else visible.delete(entry.target as HTMLElement);
    }
    paint();
  });
  for (const element of document.querySelectorAll("[data-scene]")) observer.observe(element);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    if (frame !== 0) cancelAnimationFrame(frame);
  };
}

/**
 * Renders nothing. Where `animation-timeline` is supported, or motion is reduced, it does
 * nothing at all; otherwise it writes `--progress` on every `[data-scene]` as the page
 * scrolls, so the same keyframes play from it.
 */
export function ScrollProgress() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || supportsScrollTimelines()) return undefined;
    return drive();
  }, [reduced]);
  return null;
}

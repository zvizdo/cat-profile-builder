"use client";
import { useCallback, useState } from "react";
import { fitStage, type StageFit } from "@/core/carousel/stage-fit";

// F64: measures `.page` — not `window.innerWidth`/`innerHeight`, which iOS's toolbar
// changes while `.page` stays `100svh` — and hands the device-pixel-snapped fit
// (stage-fit.ts) to the stage as CSS variables. `fit` is `undefined` until the first
// measurement lands, so the caller keeps the CSS-only fit as the fallback for the
// server-rendered first paint.

/** The CSS variables `.stage[data-fit="snapped"]` reads, or `{}` before the first measurement. */
export interface StageFitStyle {
  "--stage-scale"?: number;
  "--stage-left"?: string;
  "--stage-top"?: string;
}

export interface UseStageFitResult {
  /** Attach to `.page`, the box the fit is measured against. */
  pageRef: (node: HTMLElement | null) => (() => void) | undefined;
  /** The measured fit's variables, ready to spread into the stage's inline style. */
  style: StageFitStyle;
  /** Whether `style` carries a measured fit — the caller should switch the stage to it. */
  snapped: boolean;
}

function toStyle(fit: StageFit | undefined): StageFitStyle {
  return fit === undefined
    ? {}
    : {
        "--stage-scale": fit.scale,
        "--stage-left": `${fit.left}px`,
        "--stage-top": `${fit.top}px`,
      };
}

/** `next` if it differs from `prev`, or `prev` itself — so an identical re-measurement
 * (the `ResizeObserver`'s own initial callback, right after `measure()` already ran once
 * synchronously on attach; an iOS toolbar show/hide that doesn't change `.page`'s box)
 * skips the state update instead of re-rendering the stage tree for nothing. */
function sameFitOrNext(prev: StageFit | undefined, next: StageFit): StageFit {
  if (
    prev !== undefined &&
    prev.scale === next.scale &&
    prev.left === next.left &&
    prev.top === next.top
  ) {
    return prev;
  }
  return next;
}

/**
 * Fits the stage to `.page`'s box (a `ResizeObserver`) and the current device pixel
 * ratio, re-measuring whenever either changes. A `devicePixelRatio` change (moving the
 * window to a different-DPI display, browser zoom) fires no resize of its own, so a
 * `matchMedia` query tuned to the current ratio is used to catch it — it fires once when
 * the ratio stops matching, and is replaced by one tuned to the new ratio so it can fire
 * again next time. `pageRef` returns its own cleanup (React 19): React calls it when the
 * ref detaches, instead of calling this callback again with `null`.
 */
export function useStageFit(): UseStageFitResult {
  const [fit, setFit] = useState<StageFit | undefined>(undefined);

  const pageRef = useCallback((node: HTMLElement | null) => {
    if (node === null) return undefined;

    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      const next = fitStage({
        width: rect.width,
        height: rect.height,
        dpr: window.devicePixelRatio,
      });
      setFit((prev) => sameFitOrNext(prev, next));
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(node);

    let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDprChange = (): void => {
      measure();
      dprQuery.removeEventListener("change", onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDprChange);
    };
    dprQuery.addEventListener("change", onDprChange);

    return () => {
      resizeObserver.disconnect();
      dprQuery.removeEventListener("change", onDprChange);
    };
  }, []);

  return { pageRef, style: toStyle(fit), snapped: fit !== undefined };
}

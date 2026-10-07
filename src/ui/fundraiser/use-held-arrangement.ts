"use client";
import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { arrangementOf, heldRatio } from "@/core/fundraiser/arrangement";

/**
 * Holds the display's arrangement for as long as `open` is true (display-layout.md → Known
 * risk). When it turns true the shape's own box is measured once and the answer is written to
 * the element as `data-arrangement="stack" | "side"`, with the ratio limit the stylesheet needs
 * (`--held-ratio`); the stylesheet then keeps the query on that answer however the stage is
 * resized (the soft keyboard shrinks it), and does nothing at all while the stage is unchanged. When it turns false,
 * or the page goes, the attribute is removed and the container query decides again. The
 * attribute is set on the element directly, not through state: it is only a styling hold, and
 * a state change would cost a second render for nothing. Returns the ref for the shape element.
 */
export function useHeldArrangement(open: boolean): RefObject<HTMLDivElement | null> {
  const shape = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = shape.current;
    if (!open || !element) return;
    const { width, height } = element.getBoundingClientRect();
    const held = arrangementOf(width, height);
    if (held === undefined) return;
    element.dataset["arrangement"] = held;
    element.style.setProperty("--held-ratio", String(heldRatio(held, width, height)));
    return () => {
      delete element.dataset["arrangement"];
      element.style.removeProperty("--held-ratio");
    };
  }, [open]);
  return shape;
}

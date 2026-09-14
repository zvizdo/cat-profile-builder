import { createElement, type HTMLAttributes } from "react";

// The label voice (DESIGN.md §2): IBM Plex Mono 11px, uppercase, .2em tracking. Field
// labels, status words, block names and section captions all speak it. Colour is the
// caller's: `meta` on paper, `blue-light` on night, clay when something is wrong.

/** A `label` is uppercase and tracked; a `reading` (`x 53%, y 41%`, `0:04 – 0:12`) stays as written. */
export type MonoLabelVariant = "label" | "reading";

const VARIANT: Record<MonoLabelVariant, string> = {
  label: "font-label text-mono-label uppercase",
  // `text-mono-label` carries the .2em tracking; a reading in sentence case drops it (DESIGN.md §2).
  reading: "font-label text-mono-label tracking-normal",
};

/** The element to render plus the attributes any of them accepts; `htmlFor` is for `label`. */
export interface MonoLabelProps extends HTMLAttributes<HTMLElement> {
  as?: "span" | "label" | "div" | "p";
  htmlFor?: string;
  variant?: MonoLabelVariant;
}

/**
 * The mono voice: by default the uppercase tracked label (`font-label`, `text-mono-label`,
 * uppercase); as a `reading`, the same face in sentence case with no tracking, for numbers
 * a person reads back. Renders whichever element `as` names — `span` by default — and passes
 * every other attribute through. It sets no colour, so it inherits its ground.
 */
export function MonoLabel({ as = "span", variant = "label", className, ...rest }: MonoLabelProps) {
  const classes = [VARIANT[variant], className].filter(Boolean).join(" ");
  return createElement(as, { ...rest, className: classes });
}

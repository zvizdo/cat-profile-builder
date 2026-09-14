import type { ReadinessTarget } from "@/core/profile/readiness";

// Where a readiness problem points on the canvas (CONTENT.md → Publish validation: "lists
// what's missing, then scrolls to the first gap"). The elements carry these ids; nothing
// here knows what a block is, only where it stands.

/** The element id of the name field, the target of `Give the cat a name.`. */
export const NAME_FIELD_ID = "facts-name";

/** The element id of the age field, the target of the "Add her/his/their age." sentences. */
export const AGE_FIELD_ID = "facts-age";

/** The element id of the sex field, the target of "Say whether the cat is female or male." */
export const SEX_FIELD_ID = "facts-sex";

/** The element id of the add tile — where focus lands after a removal. */
export const ADD_TILE_ID = "canvas-add-section";

/** The element id of a block's frame on the canvas. */
export function blockElementId(blockId: string): string {
  return `block-${blockId}`;
}

/** The element id a target names: the name field, a facts field, or the block's frame. */
export function targetElementId(target: ReadinessTarget): string {
  switch (target.kind) {
    case "name":
      return NAME_FIELD_ID;
    case "facts":
      return target.field === "age" ? AGE_FIELD_ID : SEX_FIELD_ID;
    case "block":
      return blockElementId(target.blockId);
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]';

/** The room left between the panel that stays at the top and the gap scrolled under it. */
const REVEAL_GAP_PX = 12;

/** The editor inside a frame — what a problem is about, past the handle column. */
const BLOCK_BODY = "[data-block-body]";

/**
 * Scrolls the target's element to the top of the view, clear of `topInset` (the height
 * of the panel that stays at the top) — at once under reduced motion, smoothly
 * otherwise — and moves focus to it: the field itself, or the first control of a frame's
 * editor (`Pick a photo`, a caption field), never its drag handle. Where nothing on the
 * page carries the target's id, `fallbackId` names the place to show instead (phone mode
 * has no frames: a block's gap shows the library, a missing section the helper). `false`
 * when neither is on the page.
 */
export function revealTarget(target: ReadinessTarget, topInset = 0, fallbackId?: string): boolean {
  const element =
    document.getElementById(targetElementId(target)) ??
    (fallbackId === undefined ? null : document.getElementById(fallbackId));
  if (element === null) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.style.scrollMarginTop = `${topInset + REVEAL_GAP_PX}px`;
  element.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  const body = element.querySelector(BLOCK_BODY) ?? element;
  const control = element.matches(FOCUSABLE) ? element : body.querySelector<HTMLElement>(FOCUSABLE);
  control?.focus({ preventScroll: true });
  return true;
}

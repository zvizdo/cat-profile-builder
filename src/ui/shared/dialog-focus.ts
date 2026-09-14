"use client";
import { useEffect, useRef, type RefObject } from "react";

// The keyboard and focus contract a modal surface owes (design sheet §07; design
// 2026-09-13 §3): Tab never leaves the panel, Escape is the safe way out wherever focus
// has wandered, focus lands on the first control as the surface opens and goes back to
// whatever had it when it closes. Extracted from `Modal.tsx` so the centred modal and the
// phone's Full sheet share one implementation rather than two that drift. Built on plain
// document listeners rather than `<dialog>`: jsdom, where the keyboard tests run,
// implements neither `showModal()` nor the top layer, and the trap is small enough to own.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab from the last focusable wraps to the first and Shift+Tab from the first wraps to
 * the last; anything in between is the browser's own order. Focus that has left the
 * panel altogether (a scrim click, a programmatic blur) is pulled back in the same way.
 */
export function trapTab(event: KeyboardEvent, panel: HTMLElement): void {
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && panel.contains(active);
  if (event.shiftKey ? active === first || !inside : active === last || !inside) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

// The surfaces open right now, in the order they opened (F45): a question over the
// phone's Media sheet, the focal picker over it, the compare over the drawer — and, with
// no trap, a selected media card or the tablet's overlay column (review round 1). One
// document listener walks the stack from the top: Escape goes to the topmost entry, and
// on down while an entry answers `false` ("not mine" — its focus is elsewhere); Tab is
// trapped by the topmost entry that traps. Stacked surfaces need no knowledge of each
// other, and the app's own root listener (Next mounts React on `document`, so a React
// `stopPropagation` never reaches a sibling listener there) is not relied on.
interface Entry {
  escape: () => boolean | void;
  panel: RefObject<HTMLElement | null>;
  trap: boolean;
}

const OPEN: Entry[] = [];

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    for (let i = OPEN.length - 1; i >= 0; i -= 1) {
      if (OPEN[i]?.escape() !== false) {
        event.preventDefault();
        return;
      }
    }
  } else if (event.key === "Tab") {
    const top = OPEN.findLast((entry) => entry.trap);
    if (top?.panel.current) trapTab(event, top.panel.current);
  }
}

function register(entry: Entry): () => void {
  if (OPEN.length === 0) document.addEventListener("keydown", onKeyDown);
  OPEN.push(entry);
  return () => {
    OPEN.splice(OPEN.indexOf(entry), 1);
    if (OPEN.length === 0) document.removeEventListener("keydown", onKeyDown);
  };
}

export interface DialogKeysOptions {
  /** False for a surface that is not a dialog (a selected card, the overlay column):
   * it answers Escape but Tab walks through it. */
  trap?: boolean;
}

/**
 * While `open`: Escape runs `onEscape` and Tab is trapped inside `panelRef` — for the
 * surface on top of the stack. Keys are read on the document, not the panel, so they
 * still arrive when focus has wandered off it (sheet §07: Escape always equals the safe
 * button). An `onEscape` that answers `false` hands the key to the surface under it.
 */
export function useDialogKeys(
  open: boolean,
  onEscape: () => boolean | void,
  panelRef: RefObject<HTMLElement | null>,
  options: DialogKeysOptions = {},
): void {
  // The latest `onEscape`, so a caller passing a fresh closure each render does not
  // re-register — and so re-order — its place in the stack.
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  }, [onEscape]);
  const { trap = true } = options;
  useEffect(() => {
    if (!open) return;
    return register({ escape: () => escape.current(), panel: panelRef, trap });
  }, [open, panelRef, trap]);
}

/** Where a closing surface hands focus back: the recorded opener, and a stand-in for when
 * the opener cannot take it (gone, or disabled while the helper works). */
export interface ReturnFocus {
  /** The opener, recorded by the caller before the surface mounted. */
  to?: RefObject<HTMLElement | null>;
  /** Found on close: focused when the opener did not take focus. */
  fallback?: () => HTMLElement | null;
}

/**
 * Focus lands on `firstRef` (the safe button, a sheet's Close) as the surface opens and
 * goes back to whatever had it when the surface closes — `returnFocus.to`, when the
 * caller recorded the opener itself (the phone's drawer, whose opener may be a chip that
 * the helper's lock has already moved focus off by the time this effect runs), else
 * whatever is focused as the surface opens; `returnFocus.fallback` when that opener
 * cannot take focus back (a chip disabled for the turn it started). Without
 * `preventScroll` a panel taller than the window opens scrolled to that control.
 */
export function useDialogFocus(
  open: boolean,
  firstRef: RefObject<HTMLElement | null>,
  returnFocus?: ReturnFocus,
): void {
  useEffect(() => {
    if (!open) return;
    const opener = returnFocus?.to?.current ?? document.activeElement;
    firstRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      if (document.activeElement !== opener) returnFocus?.fallback?.()?.focus();
    };
  }, [open, firstRef, returnFocus]);
}

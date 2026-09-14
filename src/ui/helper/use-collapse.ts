"use client";
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { Turn } from "@/core/helper/reducer";

// The docked helper's collapsed state (F27): whether the column is the panel or the 52px
// tab, what the tab has to show, and where focus goes when a toggle is pressed. Split
// from `HelperPanel.tsx` so the shell file stays about the shell. F46: below 1180px the
// column starts as the tab (the open panel would cover the canvas), so the default
// follows the window until the volunteer's first press decides for themselves.

export interface Collapse {
  collapsed: boolean;
  /** True once the toggle has been pressed at all: the body's fade-in and the focus
   * hand-off answer that press — never something the page does on its own at load. */
  toggled: boolean;
  /** A turn ended behind the closed tab with something to show: the disc lights. */
  unread: boolean;
  toggle: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Escape on the overlay (F46): folds the column and hands focus to the tab, as a
   * keyboard press of the toggle would. */
  dismiss: () => void;
}

/**
 * The collapsed state: `useState`, per panel, so it resets when the surface swaps.
 * Until the toggle has been pressed the column follows `startCollapsed` (the window's
 * width, F46); a press decides for good. `unread` is adjusted during render from the
 * status edge (working → ready), the way `CardSlot` remembers its card; a press clears
 * it — what the tab lit for is on screen, or the tab is gone.
 *
 * The toggle that was pressed unmounts with its state, so focus is handed on. Pressed
 * from the keyboard — Enter or Space fire a click whose `detail` is 0, where a pointer's
 * carries its click count — focus follows to the toggle that took its place: a keyboard
 * must never fall to `body`. Pressed with a pointer, focus goes to the `aside` itself
 * (`tabIndex={-1}`): a later Tab still starts inside the landmark, and no ring is drawn
 * around a control nobody keyed to (a script `.focus()` after the pressed button is gone
 * reads as keyboard focus to the browser, so it would ring). Only after a press — never
 * at mount.
 */
export function useCollapse(
  status: "locked" | "ready" | "working",
  turn: Turn,
  root: RefObject<HTMLElement | null>,
  startCollapsed = false,
): Collapse {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [unread, setUnread] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);
  const [pressed, setPressed] = useState(0);
  const byKeyboard = useRef(false);
  const collapsed = chosen ?? startCollapsed;
  if (status !== prevStatus) {
    setPrevStatus(status);
    const ended = prevStatus === "working" && status === "ready";
    const toShow = turn.applied.length > 0 || turn.outcome?.kind === "error";
    if (collapsed && ended && toShow) setUnread(true);
  }
  const fold = (to: boolean, keyboard: boolean) => {
    byKeyboard.current = keyboard;
    setPressed((n) => n + 1);
    setUnread(false);
    setChosen(to);
  };
  const toggle = (event: MouseEvent<HTMLButtonElement>) => fold(!collapsed, event.detail === 0);
  useEffect(() => {
    if (pressed === 0) return;
    const aside = root.current;
    if (byKeyboard.current) aside?.querySelector<HTMLElement>("button[aria-expanded]")?.focus();
    else aside?.focus();
  }, [pressed, root]);
  return { collapsed, toggled: pressed > 0, unread, toggle, dismiss: () => fold(true, true) };
}

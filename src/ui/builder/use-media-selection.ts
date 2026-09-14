"use client";
import { useEffect, type RefObject } from "react";
import { useDialogKeys } from "@/ui/shared/dialog-focus";
import { tileButtonId } from "./MediaTile";

// The ways out of a media selection (F38, media-sidebar-audit §3.1), besides clicking
// the tile again: Escape with focus anywhere in the section, the card's Close, and a
// pointer-down outside the section. The first two hand focus back to the tile that was
// selected, so a keyboard user is where they were before they opened it. Escape is read
// through the dialog stack (F45 review round 1, finding 1): the open card is a surface
// above the sheet around it, so the key closes the card and never the sheet — and a
// question or an editor opened over the card takes it first.

/**
 * Whether `target` is inside a dialog laid over the section, or the toast stack —
 * neither counts as "elsewhere". A dialog the section itself sits inside (the phone's
 * Media sheet, F45) is not over it: a key or a tap there is the section's own. The
 * stack is matched by its own mark, not by `role="status"`: the topbar's save line, the
 * theme's contrast note and the helper's working bar carry that role too, and a click
 * on any of them is a click elsewhere (F38 review, minor 5).
 */
function insideOverlay(target: EventTarget | null, section: HTMLElement | null): boolean {
  if (!(target instanceof Element)) return false;
  const overlay = target.closest('[role="dialog"], [data-toasts]');
  return overlay !== null && !(section !== null && overlay.contains(section));
}

/** A dialog laid over the section is open — a question, an editor — so nothing here moves. */
function underDialog(section: HTMLElement | null): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (dialog) => !(section !== null && dialog.contains(section)),
  );
}

/** Everything the rail wires up: the close for the card's button (Escape is wired here). */
export interface WaysOut {
  /** Clears the selection and puts focus back on its tile. */
  closeSelected: () => void;
}

/**
 * Escape: with focus on a tile, the card or its buttons it closes the selection and puts
 * focus back on the tile; in the description field it first hands focus back to the
 * tile (which saves a changed draft, as leaving the field always does), so a second
 * Escape closes. Inside a dialog it is the dialog's own. A pointer-down outside the
 * section closes it too — never one inside a dialog or a toast, and never while a
 * question is open: a dialog closing must leave the selection alone (the enhance flow
 * returns to the open tile). After a click elsewhere focus stays wherever the click put
 * it: the tile does not steal it back from the field or the block that was clicked.
 */
export function useWaysOut(
  section: RefObject<HTMLElement | null>,
  selected: string | null,
  close: () => void,
): WaysOut {
  const focusTile = (mediaId: string) => document.getElementById(tileButtonId(mediaId))?.focus();
  const closeSelected = () => {
    if (selected === null) return;
    close();
    focusTile(selected);
  };
  // On the stack while a card is open, without a trap. "Not mine" — focus outside the
  // section — hands the key down to whatever is under the card.
  const onEscape = (): boolean => {
    const active = document.activeElement;
    if (selected === null || !section.current?.contains(active)) return false;
    if (active instanceof HTMLTextAreaElement) {
      focusTile(selected);
      return true;
    }
    closeSelected();
    return true;
  };
  useDialogKeys(selected !== null, onEscape, section, { trap: false });

  useEffect(() => {
    if (selected === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const { target } = event;
      if (!(target instanceof Node) || section.current?.contains(target)) return;
      if (insideOverlay(target, section.current) || underDialog(section.current)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [section, selected, close]);

  return { closeSelected };
}

import { useCallback, useMemo, useRef, useState } from "react";
import type { HelperState } from "@/core/helper/reducer";
import type { ReturnFocus } from "@/ui/shared/dialog-focus";
import { HELPER_PANEL_ID } from "../working-lock";
import type { Drawer, DrawerSignal } from "./BottomBar";

// Which drawer is up (design 2026-09-13 §3) and what the CATalyst tab signals (§1). One
// drawer at a time: opening the other swaps — close then open, in one render. Escape and
// the sheet's Close both `close`; the browser's back does nothing to a sheet (YAGNI).
// What is inside a drawer survives its closing: the conversation and the library live in
// the session and the library state above, not in the sheet.

/** The element ids the bar's tabs point at while their sheet is up. */
export const SHEET_IDS: Record<Drawer, string> = {
  media: "phone-sheet-media",
  catalyst: "phone-sheet-catalyst",
};

/** The bar's tabs' own ids: where focus lands after a close whose opener cannot take it. */
export const TAB_IDS: Record<Drawer, string> = {
  media: "phone-tab-media",
  catalyst: "phone-tab-catalyst",
};

export interface SheetController {
  open: Drawer | null;
  show: (drawer: Drawer) => void;
  close: () => void;
  /** Where a sheet hands focus back on close: the element that had focus when `show`
   * was called — the tab, a bio chip, the peek bar — whatever the lock did to focus in
   * the meantime (`useLockFocus` moves it into the panel as a turn starts); and, when
   * that element cannot take it (a chip disabled for the turn it started; the peek bar
   * the Full sheet replaced, now a fresh element), the CATalyst peek if one is up (F45,
   * it carries `HELPER_PANEL_ID`), else the open drawer's tab. */
  returnFocus: ReturnFocus;
}

/** The open drawer, and the two ways to change it. */
export function useSheet(): SheetController {
  const [open, setOpen] = useState<Drawer | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Stable, so an effect may depend on it (`use-catalyst-drawer.ts` raises Full for a
  // card in one): the ref and the setter never change.
  const show = useCallback((drawer: Drawer) => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    setOpen(drawer);
  }, []);
  const returnFocus = useMemo<ReturnFocus>(
    () => ({
      to: opener,
      fallback: () => {
        if (open === null) return null;
        const peek = open === "catalyst" ? document.getElementById(HELPER_PANEL_ID) : null;
        return peek ?? document.getElementById(TAB_IDS[open]);
      },
    }),
    [open],
  );
  return { open, show, close: () => setOpen(null), returnFocus };
}

/** The slice of the helper's state the signal reads. */
type HelperTurn = Pick<HelperState, "status" | "turn">;

/** A turn that ended with something to show: an edit applied, or a failure. */
function endedWithNews(turn: HelperTurn["turn"]): boolean {
  return turn.applied.length > 0 || turn.outcome?.kind === "error";
}

/**
 * Whether a turn ended behind the closed drawer with something to show — the docked
 * tab's own rule (F27, `use-collapse.ts`). Adjusted during render from the status edge
 * (working → ready) and cleared when the drawer opens: what it lit for is on screen.
 */
function useUnread(helper: HelperTurn, open: boolean): boolean {
  const { status, turn } = helper;
  const [unread, setUnread] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);
  const [prevOpen, setPrevOpen] = useState(open);
  if (status !== prevStatus) {
    setPrevStatus(status);
    const ended = prevStatus === "working" && status === "ready";
    if (!open && ended && endedWithNews(turn)) setUnread(true);
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setUnread(false);
  }
  return unread;
}

/**
 * The disc on the CATalyst tab: still while a card waits — checked first, since the
 * reducer keeps `status: "working"` for as long as a card is pending, and "your turn"
 * must look different from "wait" — breathing while the helper streams, still again
 * while a turn ended unseen behind the closed drawer.
 */
export function useDrawerSignal(helper: HelperTurn, open: boolean): DrawerSignal {
  const unread = useUnread(helper, open);
  if (helper.turn.card !== null) return "waiting";
  if (helper.status === "working") return "working";
  return unread ? "waiting" : "none";
}

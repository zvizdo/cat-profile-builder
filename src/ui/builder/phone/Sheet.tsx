"use client";
import {
  useId,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useDialogFocus, useDialogKeys, type ReturnFocus } from "@/ui/shared/dialog-focus";
import { IconButton } from "@/ui/shared/IconButton";
import { Close } from "@/ui/shared/icons";

// The phone's drawer (design 2026-09-13 §3): a panel slid up from the bottom, under the
// topbar, in one of two modes. `modal` is the Full height — a dialog with `aria-modal`,
// the Tab trap, Escape and the focus hand-back every modal owes (the same `dialog-focus`
// helpers `Modal` uses), over a scrim that covers the canvas and the bar; the sheet's
// header holds the title and Close, since the bottom bar is gone while it is up. `plain`
// is the Half height (F45): not a dialog at all — a `region` named by its title, no
// scrim, no trap, no Escape (the canvas may be using the key), the canvas still
// reachable by Tab and by pointer. It stands in the column's flow between the canvas
// and the bottom bar at half the window, so the canvas keeps a real band above it —
// F34's centring lands there with no scroll padding to keep in step — and its own Close
// or a drag down on its header puts it away. The questions stay the centred `Modal`; the
// section picker and the slot picker are `Modal` at `placement="bottom"` (F45, F55).

/** Full is modal; Half is plain. */
export type SheetMode = "modal" | "plain";

export interface SheetProps {
  /** The element id the bottom bar's tab points at with `aria-controls`. */
  id: string;
  mode: SheetMode;
  open: boolean;
  /** Names the sheet; drawn as its heading unless `titleVisible` is false. */
  title: string;
  /** False when the content draws its own header: the title stays for the screen reader
   * and Close sits over the content's top-right corner. */
  titleVisible?: boolean;
  /** Whether the body keeps the 16px panel padding (a panel that fills the sheet does not). */
  padded?: boolean;
  /** Where focus goes back to on close: the opener recorded before the sheet mounted
   * (`useSheet().opener`), with a stand-in for when it cannot take focus; else whatever
   * had focus as it opened. */
  returnFocus?: ReturnFocus;
  onClose: () => void;
  children: ReactNode;
}

// A scrim click must not move focus to `body`: with it there, Escape would have no
// listener in the way and Tab would walk the page behind the scrim.
function keepFocus(event: MouseEvent<HTMLDivElement>) {
  if (event.target === event.currentTarget) event.preventDefault();
}

// The panel: from the topbar's foot to the bottom of the window (`top-topbar`, so the
// name and the working announcer stay in view — dimmed under the scrim like everything
// outside a modal, `Modal`'s own contract, so nothing behind the sheet takes a tap),
// the card ground, the panel radius on its top corners, the screen shadow; it slides up
// over `panel` (320ms) and simply appears under reduced motion, where the global rule
// zeroes the duration. Its foot clears the home indicator (`viewport-fit=cover` lets the
// page run under it; F44 review round 1), so the composer and the grid's last row are
// never under the bar. The Half sheet is half the window (`50dvh`, so the soft keyboard
// shrinks it with the page) and shrinks no further.
const PANEL: Record<SheetMode, string> = {
  modal:
    "enter-sheet absolute inset-x-0 bottom-0 top-topbar flex flex-col rounded-t-panel bg-card pb-[env(safe-area-inset-bottom)] shadow-screen",
  plain:
    "enter-sheet relative flex h-[50dvh] shrink-0 flex-col rounded-t-panel border-t border-line-panel bg-card shadow-screen",
};

/** How far a finger drags the header down before the Half sheet goes (a deliberate pull, not a tap). */
const PULL_DOWN = 40;

/** The header's pull-down (design §4: "drag the header down … → Peek"): pointer only. */
function usePullDown(active: boolean, onClose: () => void) {
  const start = useRef<number | null>(null);
  if (!active) return {};
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      start.current = event.clientY;
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (start.current === null || event.clientY - start.current < PULL_DOWN) return;
      start.current = null;
      onClose();
    },
    onPointerUp: () => {
      start.current = null;
    },
  };
}

interface HeaderProps extends Pick<SheetProps, "title" | "onClose"> {
  titleId: string;
  visible: boolean;
  pull: boolean;
  closeRef: RefObject<HTMLButtonElement | null>;
}

// The title and Close: a row under a hairline, or — when the content draws its own
// header — the title for the screen reader alone and Close over the top-right corner.
// On the Half sheet the row is also the handle a finger pulls down.
function SheetHeader({ title, titleId, visible, pull, closeRef, onClose }: HeaderProps) {
  const pullDown = usePullDown(pull && visible, onClose);
  return (
    <div
      {...pullDown}
      className={
        visible
          ? `flex shrink-0 items-center gap-12 border-b border-line-panel py-8 pr-8 pl-16 ${pull ? "touch-none select-none" : ""}`
          : "absolute top-8 right-8 z-10"
      }
    >
      <h2
        id={titleId}
        className={visible ? "min-w-0 flex-1 truncate font-text text-ui text-ink" : "sr-only"}
      >
        {title}
      </h2>
      <IconButton ref={closeRef} icon={Close} aria-label="Close" onClick={onClose} />
    </div>
  );
}

/**
 * Renders nothing while closed. Open in `modal` mode: `role="dialog"`, `aria-modal`,
 * labelled by the title; focus lands on Close and cannot Tab out; Escape closes;
 * when it closes, focus goes back to the tab that opened it. Open in `plain` mode: a
 * `region` in the column's flow, nothing trapped and nothing focused on open.
 */
export function Sheet(props: SheetProps) {
  const { id, mode, open, title, titleVisible = true, padded = true, onClose, children } = props;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modal = mode === "modal";
  useDialogFocus(open && modal, closeRef, props.returnFocus);
  useDialogKeys(open && modal, onClose, panelRef);

  if (!open) return null;

  const panel = (
    <div
      ref={panelRef}
      id={id}
      role={modal ? "dialog" : "region"}
      aria-modal={modal ? true : undefined}
      aria-labelledby={titleId}
      className={PANEL[mode]}
    >
      <SheetHeader
        title={title}
        titleId={titleId}
        visible={titleVisible}
        pull={!modal}
        closeRef={closeRef}
        onClose={onClose}
      />
      {/* A flex column, so a panel that fills the sheet (`flex-1 min-h-0`) pins its
          composer to the foot and scrolls its own list; the library just stacks. */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${padded ? "p-16" : ""}`}>
        {children}
      </div>
    </div>
  );

  if (!modal) return panel;
  return (
    // The scrim is not a control: clicking it neither closes the sheet nor takes focus.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="fixed inset-0 z-20 bg-night/60" onMouseDown={keepFocus}>
      {panel}
    </div>
  );
}

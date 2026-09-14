"use client";

import { useId, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Button } from "./Button";
import { useDialogFocus, useDialogKeys } from "./dialog-focus";

// Modals ask (design sheet §07): a serif question, one plain paragraph, two buttons on the
// right — the safe one on the left as an outline, the other primary or clay. Escape always
// equals the safe button. The Tab trap, the Escape key and the focus hand-back are the
// shared `dialog-focus` helpers (F44: the phone's Full sheet owes the same contract).

/** One of the two buttons: its CONTENT.md label and what it does. */
export interface ModalAction {
  label: string;
  onClick: () => void;
}

/** A question is the 360px card (sheet §07); a sheet is the wide editor panel (hi-fi 7a). */
export type ModalSize = "question" | "sheet";

/** Centred in the window, or — the phone's slot picker (design 2026-09-13 §5, F45) —
 * slid up from its bottom edge as a bottom sheet. */
export type ModalPlacement = "center" | "bottom";

// The scrim lays the panel out: centred with the window's own gutter, or on the bottom
// edge with no gutter under it, where the panel takes the whole width and keeps its
// round corners on top alone.
const SCRIM: Record<ModalPlacement, string> = {
  center: "place-items-center p-16 md:p-28",
  bottom: "items-end px-0 pt-topbar pb-0",
};

const PANEL: Record<ModalPlacement, string> = {
  center: "enter-panel rounded-panel",
  bottom: "enter-sheet rounded-t-panel pb-[env(safe-area-inset-bottom)]",
};

const SIZE: Record<ModalSize, string> = {
  question: "max-w-helper",
  sheet: "max-w-profile-max",
};

/** What a modal asks; `children` is an optional extra between the body and the buttons. */
export interface ModalProps {
  open: boolean;
  title: string;
  body: string;
  /** Rendered as the outline button, receives initial focus, and is what Escape presses. */
  safeAction: ModalAction;
  /**
   * The other button: primary blue, or clay when `destructive`; `disabled` while it cannot
   * apply. Omitted entirely for a modal that is a picker rather than a question — a list
   * of choices in `children`, each its own action, with only `safeAction` (`Cancel`) in
   * the footer.
   */
  dangerAction?: ModalAction & { destructive?: boolean; disabled?: boolean };
  /** A third answer, drawn as an outline between the safe button and the other (the contrast question's `Publish anyway`). */
  alternateAction?: ModalAction;
  /** A question by default; a sheet is the wide editor, whose footer stays in reach while it scrolls (F39). */
  size?: ModalSize;
  /** Centred by default; `bottom` slides up from the window's foot (the phone's picker). */
  placement?: ModalPlacement;
  /**
   * A CSS width for the panel when its content sets the size (the trim editor's clip);
   * the panel never exceeds the window. Overrides `size`'s width, not its footer.
   */
  width?: string;
  children?: ReactNode;
}

// A scrim click must not move focus to `body`: with it there, Escape would have no
// listener in the way and Tab would walk the page behind the scrim.
function keepFocus(event: MouseEvent<HTMLDivElement>) {
  if (event.target === event.currentTarget) event.preventDefault();
}

/**
 * A sheet's footer stays at the bottom of the panel's own scroll (F39): on a phone, and
 * on a 768-tall laptop, the sheet is taller than the window, and its `Save` must not
 * wait below the fold — when the panel does not scroll, sticky changes nothing. The card
 * ground keeps the content scrolling under it opaque. F55: a bottom sheet's footer is
 * pinned the same way whatever its `size` — the phone's section picker and slot picker
 * scroll their lists inside the sheet, `Cancel` always in reach.
 */
const PINNED_FOOTER = "sticky bottom-0 bg-card";

function footerClasses(size: ModalSize, placement: ModalPlacement): string {
  return size === "sheet" || placement === "bottom" ? PINNED_FOOTER : "";
}

// The buttons, right-aligned: the safe one left as an outline, an alternate (when given)
// as another outline, the other primary or clay. The safe button carries the ref so the
// modal can land focus on it.
function ModalButtons({
  safeAction,
  dangerAction,
  alternateAction,
  safeRef,
  footer,
}: Pick<ModalProps, "safeAction" | "dangerAction" | "alternateAction"> & {
  safeRef: RefObject<HTMLButtonElement | null>;
  /** `footerClasses`'s answer: pinned, or in the flow. */
  footer: string;
}) {
  return (
    <div
      className={`flex flex-wrap justify-end gap-12 border-t border-line-panel px-16 py-16 md:px-28 ${footer}`}
    >
      <Button ref={safeRef} variant="secondary" onClick={safeAction.onClick}>
        {safeAction.label}
      </Button>
      {alternateAction === undefined ? null : (
        <Button variant="secondary" onClick={alternateAction.onClick}>
          {alternateAction.label}
        </Button>
      )}
      {dangerAction === undefined ? null : (
        <Button
          variant={dangerAction.destructive === true ? "destructive" : "primary"}
          disabled={dangerAction.disabled}
          onClick={dangerAction.onClick}
        >
          {dangerAction.label}
        </Button>
      )}
    </div>
  );
}

/**
 * A modal question. While `open`: `role="dialog"` with `aria-modal`, named by the title and
 * described by the body; focus starts on the safe button and cannot Tab out; Escape runs
 * the safe action wherever focus is; a scrim click changes nothing; the panel enters on
 * opacity/transform (none under reduced motion). When it closes, focus goes back to
 * whatever had it before it opened. An `alternateAction` is a third, outline answer in the
 * row; `dangerAction` is optional (a picker's `children` hold its own actions, so its
 * footer is `safeAction` alone). Renders nothing when closed. `size="sheet"` is the
 * wide editor panel and `width` a panel sized by its content; either scrolls inside the
 * scrim when taller than the window, and a panel wider than the window (the trim editor
 * on a phone) is held to it — the scrim's one column is the window's width, so the
 * panel's `max-width: 100%` binds. A sheet's footer sticks to the bottom of the panel's
 * scroll at every width, so its buttons are always in reach (F39). Under the tablet
 * floor the scrim and the panel keep 16px instead of 28px, so a sheet's photo gets the
 * width a thumb needs at 390px. `placement="bottom"` is the phone's bottom sheet: the
 * panel stands on the window's foot, the window's width, under the topbar's height,
 * and slides up the way the drawers do (`enter-sheet`), its footer pinned whatever its
 * `size` (F55).
 */
export function Modal(props: ModalProps) {
  const { open, title, body, safeAction, dangerAction, alternateAction, children } = props;
  const { size = "question", width, placement = "center" } = props;
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);

  useDialogFocus(open, safeRef);
  useDialogKeys(open, safeAction.onClick, panelRef);

  if (!open) return null;

  return (
    // The scrim is not a control: clicking it neither answers the question nor takes focus.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={`fixed inset-0 z-20 grid grid-cols-[minmax(0,1fr)] bg-night/60 ${SCRIM[placement]}`}
      onMouseDown={keepFocus}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={`${PANEL[placement]} max-h-full w-full ${width === undefined && placement === "center" ? SIZE[size] : "max-w-full"} overflow-y-auto bg-card shadow-screen`}
        style={width === undefined ? undefined : { width }}
      >
        <div className="flex flex-col gap-12 p-16 md:p-28">
          <h2 id={titleId} className="font-display text-fact-value text-ink">
            {title}
          </h2>
          <p id={bodyId} className="text-ui leading-relaxed font-normal text-body">
            {body}
          </p>
          {children}
        </div>
        <ModalButtons
          safeAction={safeAction}
          dangerAction={dangerAction}
          alternateAction={alternateAction}
          safeRef={safeRef}
          footer={footerClasses(size, placement)}
        />
      </div>
    </div>
  );
}

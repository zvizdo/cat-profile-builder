"use client";
import { useRef, type PointerEvent } from "react";
import { OPEN_HELPER } from "@/ui/helper/PanelHeader";
import { IconButton } from "@/ui/shared/IconButton";
import { MoveDown } from "@/ui/shared/icons";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { HELPER_PANEL_ID } from "../working-lock";
import { WORKING_LINE } from "./peek-line";

// The CATalyst drawer at its Peek height (design 2026-09-13 §4): a 48px bar
// (`--spacing-peek`) standing on the bottom bar, in the column's flow, so the canvas
// above it is whole and follows the helper's changes. One line, truncated — the working
// sentence with the breathing disc, then the receipt, the proposal question or the
// failure sentence — and a chevron up; a tap is Full. The words are `aria-hidden`: the
// topbar's `WorkingBar` is the one `role="status"` announcer (F25), and the panel says
// the rest once opened; the bar's own name is the docked tab's `open CATalyst`. It
// carries `HELPER_PANEL_ID`, so the read-only lock has a mounted target while the
// panel is folded (F44 review, concern 2): focus parks here, on the way in. The bar can
// be put away (the F45 addendum): a chevron-down control at its end, `Hide CATalyst`,
// or a swipe down on the bar — the drawer comes back on its own with the next turn.

export interface PeekBarProps {
  /** The one line (`peek-line.ts`). */
  line: string;
  /** A turn streams: the disc breathes beside the line (still under reduced motion). */
  working: boolean;
  onOpen: () => void;
  /** The chevron down, or a swipe down: the drawer closes until the next turn. */
  onHide: () => void;
}

/** The chevron: the comp's own glyph for "there is more above" (the `⌄` of the toggle, turned). */
const CHEVRON = "⌃";

/** How far a finger drags the bar down before it goes (a deliberate pull, not a tap). */
const SWIPE_DOWN = 40;

/** CONTENT.md → Phone peek line: the put-away control's name. */
const HIDE = "Hide CATalyst";

/** A swipe down on the bar (touch or pointer): `onHide` once the drag passes the threshold. */
function useSwipeDown(onHide: () => void) {
  const start = useRef<number | null>(null);
  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      start.current = event.clientY;
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (start.current === null || event.clientY - start.current < SWIPE_DOWN) return;
      start.current = null;
      onHide();
    },
    onPointerUp: () => {
      start.current = null;
    },
  };
}

/** The bar: the line as a button named `open CATalyst` (its words for the eye alone), then `Hide CATalyst`. */
export function PeekBar({ line, working, onOpen, onHide }: PeekBarProps) {
  const swipe = useSwipeDown(onHide);
  return (
    // A swipe is read on the row itself; every control inside it is its own button.
    <div
      {...swipe}
      className="flex h-peek shrink-0 touch-pan-x items-stretch border-t border-line-chrome bg-card pr-4"
    >
      <button
        id={HELPER_PANEL_ID}
        type="button"
        aria-label={OPEN_HELPER}
        className="flex h-peek min-w-0 flex-1 items-center gap-8 pl-16 text-left transition-colors duration-hover ease-default hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue"
        onClick={onOpen}
      >
        {working && line === WORKING_LINE ? (
          <span aria-hidden="true" className="dot-breathe size-6 shrink-0 rounded-pill bg-blue" />
        ) : null}
        <MonoLabel
          as="span"
          variant="reading"
          aria-hidden="true"
          className="min-w-0 flex-1 truncate text-ink"
        >
          {line}
        </MonoLabel>
        <span
          aria-hidden="true"
          className="shrink-0 font-label text-ui-dense leading-none text-meta"
        >
          {CHEVRON}
        </span>
      </button>
      <IconButton
        icon={MoveDown}
        aria-label={HIDE}
        className="self-center text-meta"
        onClick={onHide}
      />
    </div>
  );
}

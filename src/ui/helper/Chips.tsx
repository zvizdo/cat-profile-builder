"use client";
import type { HelperLayout } from "./layout";

// CONTENT.md → Helper, Input: the composer's quick requests. The design's helper chips
// send exactly these requests (contracts/helper-protocol.md → "Skills"): the label is the
// text a click sends, verbatim — no rewording, no added punctuation. The hi-fi's chips
// read in sentence case (`Write a bio`, not `WRITE A BIO`), so the mono voice here is the
// "reading" one — sentence case, no tracking — not the uppercase, tracked label voice.

const CHIP_LABELS = ["Write a bio", "Pick a theme", "Tidy the order"] as const;

/** CONTENT.md → Rail: the fourth chip, shown only while the page has no blocks beyond the hero. */
export const BUILD_THE_PAGE = "Build the page";

export interface ChipsProps {
  /** Sends the chip's own label as the next request. */
  onSend: (text: string) => void;
  /** The page is still just the hero — `Build the page` joins the other three. */
  emptyPage: boolean;
  /** The docked column (`docked`, the hi-fi's ~30px pills) or the phone's sheet (`sheet`,
   * where every chip is a 44px tap target — DESIGN.md §4; design 2026-09-13 §4). */
  layout?: HelperLayout;
  /** While the helper is working a chip would land on a turn already running: it fades
   * and leaves the tab order, the same rule `Button.tsx` records for a disabled control. */
  disabled?: boolean;
}

// The pill's own 6px/12px padding is what gives the row its dense, chip-like rhythm (hi-fi
// 3a: ~30px tall, lighter than any button). Only the sheet lifts a chip to the 44px tap
// floor; a pointer on the docked column has no such floor.
const CHIP_BASE =
  "inline-flex items-center rounded-pill border border-line-tag text-body " +
  "transition-[border-color,color] duration-hover ease-default hover:border-blue hover:text-blue " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue " +
  "disabled:pointer-events-none disabled:opacity-50";

// The reading voice at two sizes. On the docked column the mono floor (10px, hi-fi 3a —
// the comp's own size): three chips at 11px are 6px too wide for the 328px the column has
// inside its padding, and a chip that wraps on its own reads as an orphan. The sheet's
// 44px pills have room for 11px.
const CHIP_SIZE: Record<HelperLayout, string> = {
  docked: "px-12 py-6 font-label text-mono-floor tracking-normal",
  sheet:
    "min-h-44 shrink-0 snap-start whitespace-nowrap px-16 py-6 font-label text-mono-label tracking-normal",
} as const;

// The row: the docked column's chips wrap; the sheet's run in one line that scrolls
// sideways (audit §3.11), bleeding to the card's edge (`-mx-16 px-16` undoes the panel's
// padding, so the last pill peeks in from the edge and says there is more) and settling
// on a pill with the panel's own 16px as the scroll padding. `overscroll-x-contain`
// keeps a flick at the end from turning into the browser's back gesture.
const ROW: Record<HelperLayout, string> = {
  docked: "flex flex-wrap gap-6",
  sheet:
    "-mx-16 flex flex-nowrap snap-x snap-proximity gap-6 overflow-x-auto overscroll-x-contain scroll-px-16 px-16",
} as const;

/** The four request chips: real buttons, each sending its own label as the next message. */
export function Chips({ onSend, emptyPage, layout = "docked", disabled = false }: ChipsProps) {
  const labels = emptyPage ? [...CHIP_LABELS, BUILD_THE_PAGE] : CHIP_LABELS;
  const classes = `${CHIP_BASE} ${CHIP_SIZE[layout]}`;
  return (
    <div className={ROW[layout]}>
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          className={classes}
          disabled={disabled}
          onClick={() => onSend(label)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

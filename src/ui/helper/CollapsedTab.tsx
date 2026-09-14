"use client";
import { useId, type MouseEvent } from "react";
import { OPEN_HELPER } from "./PanelHeader";

// The helper folded to a tab (hi-fi 7b; F27): the 52px column the docked panel becomes
// when collapsed, so the canvas actually gets the 308px back — CONTENT.md's "the canvas
// keeps the full width" was a sentence describing a state that did not exist while the
// collapsed column stayed 360px wide. The tab is the whole collapsed state: no header,
// no sentence, no link. Its one control is the disc; its one word is the name, run down
// the column in the mono label voice, with the count of what waits inside.

/** The tab's own reading of the name (CONTENT.md → Helper, Header: the tab shows it). */
const NAME = "CATalyst";
/** The comp's glyph inside the lit disc (hi-fi 7b). */
const GLYPH = "✳";

export interface CollapsedTabProps {
  /** How many suggestions (cards) wait unanswered inside — 0 or 1 today, the reducer
   * holds one card at a time; the label counts in words either way. */
  suggestions: number;
  /** A turn ended while the tab was closed: the disc lights so the change is not missed,
   * though there is nothing to count — the summary is the panel's to show. */
  unread: boolean;
  /** The press itself (see `PanelHeader`'s `onToggle`). */
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** `CATalyst`, or `CATalyst · 1 suggestion` while a card waits (audit §3.9). */
export function tabLabel(suggestions: number): string {
  if (suggestions === 0) return NAME;
  return `${NAME} · ${suggestions} suggestion${suggestions === 1 ? "" : "s"}`;
}

// The 26px disc (hi-fi 7b's own size — `layout.builder.helperDisc`, TOKENS.json; F28
// review #18) inside the 44px hit box: lit `blue` with the white glyph only while
// something waits (a card, or a turn that ended unseen); otherwise a bare 1px outline — a
// signal, never a logo. Hover tints the outline; the ring is the focus.
const DISC = {
  quiet: "border border-line-button text-transparent group-hover:border-blue",
  lit: "bg-blue text-card",
} as const;

/**
 * The 52px tab: the disc-shaped toggle at the top (44×44 to tap, `aria-expanded=false`,
 * named `open CATalyst` and described by the label under it), then the name running
 * down the column. It sits at the tab's own width inside the animating column, aligned
 * to its left edge, so the column can grow past it without the disc drifting.
 */
export function CollapsedTab({ suggestions, unread, onOpen }: CollapsedTabProps) {
  const labelId = useId();
  const lit = suggestions > 0 || unread;
  return (
    <div className="flex w-helper-tab shrink-0 flex-col items-center gap-12 py-16">
      <button
        type="button"
        aria-label={OPEN_HELPER}
        aria-expanded={false}
        aria-describedby={labelId}
        className="group flex size-44 shrink-0 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        onClick={onOpen}
      >
        <span
          aria-hidden="true"
          className={`flex size-helper-disc items-center justify-center rounded-pill font-label text-ui-dense leading-none transition-[border-color,background-color] duration-hover ease-default ${lit ? DISC.lit : DISC.quiet}`}
        >
          {lit ? GLYPH : null}
        </span>
      </button>
      {/* The label voice at the 10px floor (audit §3.9; comp 7b), written out as
          `Chips.tsx` and `SlotFaces.tsx` do: `MonoLabel` always sets `text-mono-label`
          (11px), which would win over the floor size passed beside it. */}
      <span id={labelId} className="font-label text-mono-floor text-vertical text-meta uppercase">
        {tabLabel(suggestions)}
      </span>
    </div>
  );
}

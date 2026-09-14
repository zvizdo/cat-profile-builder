"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import type { Follow, RevealBlock } from "./use-follow";

// F34: what the canvas's follow of the helper (`useFollowHelper`) hands to the parts of
// the page that draw it. The frames take `TouchProps`, cut per block from `FollowMarks`
// (`touchOf`). `RevealProvider` gives the helper panel the scroll-and-blink by block id,
// so the change list's lines can use it without the panel knowing how the canvas moves.
// `TouchedProvider` tells a frame's label row — drawn deep inside each block editor's
// `BlockShell` — that the helper just touched this frame, so the row can wear the tag
// without every editor passing it through.

/** CONTENT.md → Builder, Block labels: the tag a block the helper just touched wears. */
export const JUST_NOW = "CATalyst · just now";

/** How the helper's touch shows on one frame (F34, FR-042). */
export interface TouchProps {
  /** Blink the blue ring now: a count that changes for every new blink, so the ring
   * starts over when the same frame is touched again; `undefined` draws none. */
  pulse?: number;
  /** Wear the `CATalyst · just now` tag on the label row (until the volunteer's next edit). */
  touched?: boolean;
}

/** The follow's marks for the whole canvas: which frames blink, which wear the tag. */
export type FollowMarks = Pick<Follow, "pulsing" | "tagged">;

/** One frame's share of the marks; nothing at all outside the builder (`undefined`). */
export function touchOf(marks: FollowMarks | undefined, blockId: string): TouchProps {
  if (marks === undefined) return {};
  return { pulse: marks.pulsing.get(blockId), touched: marks.tagged.has(blockId) };
}

/** What the panel gets from the canvas: the scroll-and-blink, and which blocks are on
 * the page right now, so a change-list line for a block that has since gone (added and
 * removed in the same turn, say) is words rather than a button that does nothing
 * (F34 review, finding 4). */
export interface Reveal {
  reveal: RevealBlock;
  onPage: ReadonlySet<string>;
}

const RevealContext = createContext<Reveal | null>(null);

export interface RevealProviderProps extends Reveal {
  children: ReactNode;
}

/** Makes `reveal` and `onPage` available below — the builder wraps both its trees in one. */
export function RevealProvider({ reveal, onPage, children }: RevealProviderProps) {
  const value = useMemo(() => ({ reveal, onPage }), [reveal, onPage]);
  return <RevealContext.Provider value={value}>{children}</RevealContext.Provider>;
}

/** The canvas's scroll-and-blink and its blocks, or `null` where no canvas is there to move. */
export function useRevealBlock(): Reveal | null {
  return useContext(RevealContext);
}

const TouchedContext = createContext(false);

export interface TouchedProviderProps {
  touched: boolean;
  children: ReactNode;
}

/** A frame's own "the helper just touched me", for the label row inside its editor. */
export function TouchedProvider({ touched, children }: TouchedProviderProps) {
  return <TouchedContext.Provider value={touched}>{children}</TouchedContext.Provider>;
}

/** Whether the frame this sits in was touched by the helper's latest turn. */
export function useTouchedByHelper(): boolean {
  return useContext(TouchedContext);
}

/**
 * The tag: the 6px blue dot and a sentence-case mono line — the save state's own device
 * (DESIGN.md §4, Status), so "CATalyst · just now" reads as a status, not a second accent.
 * Plain words for a screen reader; the dot says nothing of its own.
 */
export function JustNowTag() {
  return (
    <MonoLabel
      as="span"
      variant="reading"
      data-just-now
      className="inline-flex items-center gap-6 whitespace-nowrap text-meta"
    >
      <span aria-hidden="true" className="size-6 shrink-0 rounded-pill bg-blue" />
      {JUST_NOW}
    </MonoLabel>
  );
}

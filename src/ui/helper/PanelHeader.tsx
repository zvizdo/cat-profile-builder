"use client";
import type { MouseEvent } from "react";
import { MonoLabel } from "@/ui/shared/MonoLabel";

// The helper column's header (hi-fi 3a; CONTENT.md → Helper, Header): the name, one
// line under it, and the collapse toggle. Split from `HelperPanel.tsx` (F25) so the shell
// file stays about the shell.

/** CONTENT.md → Helper, Header. */
const HELPER_SUB = "sees this page · cannot publish";
/** The line while a turn streams (DESIGN.md §4: sentence-case mono with a 6px blue dot —
 * the save-state device, reused). The topbar's `WorkingBar` is the one `role="status"`
 * announcer (helper-protocol.md → Client state); this copy is `aria-hidden`, so a screen
 * reader hears the sentence once. It is where a volunteer reading the panel sees why the
 * composer and chips are dim. */
const WORKING = "CATalyst is working…";
/** CONTENT.md → Helper, Collapsed — the tab's toggle (`CollapsedTab.tsx`) says it. */
export const OPEN_HELPER = "open CATalyst";
const COLLAPSE_HELPER = "collapse CATalyst";

export interface PanelHeaderProps {
  /** The toggle is drawn only on the docked column (`HelperPanel` decides), never while locked. */
  showToggle: boolean;
  /** `status === "working"`: the sub-line gives way to the dot and the working sentence. */
  working: boolean;
  /** The press itself: a keyboard-fired click carries `detail === 0`, a pointer's a count. */
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The name, and under it one line in the mono reading voice: what the helper can see and
 * cannot do — or, while a turn streams, the breathing dot and "CATalyst is working…"
 * (visible only — the topbar announces it). A sentence, so never the uppercase label voice: at
 * 11px with no tracking it holds one line beside the 44px toggle. The toggle keeps its
 * 44px hit box (the tap floor); only the glyph is small. The header is only ever drawn
 * open (F27: collapsed, the whole column is the tab), so its toggle always collapses.
 */
export function PanelHeader({ showToggle, working, onToggle }: PanelHeaderProps) {
  return (
    <div className="flex flex-none items-start justify-between gap-12 border-b border-line-panel px-16 py-16">
      <div className="flex min-w-0 flex-col gap-4">
        <span className="font-text text-ui text-ink">CATalyst AI Assistant</span>
        {working ? (
          <MonoLabel
            variant="reading"
            aria-hidden="true"
            className="flex items-center gap-6 whitespace-nowrap text-meta"
          >
            <span className="dot-breathe size-6 shrink-0 rounded-pill bg-blue" />
            {WORKING}
          </MonoLabel>
        ) : (
          <MonoLabel variant="reading" className="whitespace-nowrap text-meta">
            {HELPER_SUB}
          </MonoLabel>
        )}
      </div>
      {showToggle ? (
        <button
          type="button"
          aria-label={COLLAPSE_HELPER}
          aria-expanded
          className="flex size-44 shrink-0 items-center justify-center rounded-control text-meta transition-[border-color,color] duration-hover ease-default hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          onClick={onToggle}
        >
          <span aria-hidden="true" className="text-ui-dense leading-none">
            ⌄
          </span>
        </button>
      ) : null}
    </div>
  );
}

"use client";
import type { ReactNode } from "react";
import { Photo } from "@/ui/shared/icons";
import { MonoLabel } from "@/ui/shared/MonoLabel";

// The phone's bottom bar (design 2026-09-13 §1; CONTENT.md → Builder, Bottom bar): two
// equal tabs, Media and CATalyst, each an icon over its name in the mono reading voice.
// They are buttons that open sheets — `aria-expanded`, `aria-controls` — never a
// `tablist`, since nothing here switches panels in place. The one lit thing is the 6px
// blue disc on CATalyst: still while a card waits or a turn ended unseen (the docked
// tab's own rule, F27), breathing while the helper works (reduced motion: still). The
// bar is the topbar's height on the card ground with the chrome hairline above, plus
// the safe-area inset under it on a phone with a home bar.

/** The two drawers a tab can open. */
export type Drawer = "media" | "catalyst";

/** What the CATalyst tab signals: nothing, something waiting, or a turn in flight. */
export type DrawerSignal = "none" | "waiting" | "working";

export interface BottomBarProps {
  /** Which drawer is open, so its tab reads expanded. */
  open: Drawer | null;
  onOpen: (drawer: Drawer) => void;
  signal: DrawerSignal;
  /** The sheets' element ids, for `aria-controls` on the open tab. */
  sheetIds: Record<Drawer, string>;
  /** The tabs' own ids, so a closing sheet whose opener cannot take focus finds its tab. */
  tabIds?: Partial<Record<Drawer, string>>;
}

/** The comp's glyph inside the lit disc (hi-fi 7b), reused as the CATalyst tab's icon. */
const GLYPH = "✳";

const TAB =
  "flex min-h-44 flex-1 flex-col items-center justify-center gap-4 rounded-control py-4 text-ink " +
  "transition-colors duration-hover ease-default hover:bg-paper aria-expanded:text-blue " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue";

interface TabProps extends Pick<BottomBarProps, "onOpen"> {
  drawer: Drawer;
  id: string | undefined;
  label: string;
  expanded: boolean;
  controls: string | undefined;
  children: ReactNode;
}

function Tab({ drawer, id, label, expanded, controls, onOpen, children }: TabProps) {
  return (
    <button
      id={id}
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      className={TAB}
      onClick={() => onOpen(drawer)}
    >
      <span className="relative flex size-20 items-center justify-center">{children}</span>
      <MonoLabel variant="reading">{label}</MonoLabel>
    </button>
  );
}

/** The disc on the CATalyst tab, at the icon's top-right corner; decorative. */
function Disc({ signal }: Pick<BottomBarProps, "signal">) {
  if (signal === "none") return null;
  return (
    <span
      data-disc=""
      aria-hidden="true"
      className={`absolute -top-4 -right-4 size-6 rounded-pill bg-blue ${signal === "working" ? "dot-breathe" : ""}`}
    />
  );
}

/** The bar: a `navigation` named `Drawers`, holding the two tabs. */
export function BottomBar({ open, onOpen, signal, sheetIds, tabIds }: BottomBarProps) {
  return (
    <nav
      aria-label="Drawers"
      className="flex min-h-topbar shrink-0 items-stretch gap-8 border-t border-line-chrome bg-card px-16 pb-[env(safe-area-inset-bottom)]"
    >
      <Tab
        drawer="media"
        id={tabIds?.media}
        label="Media"
        expanded={open === "media"}
        controls={open === "media" ? sheetIds.media : undefined}
        onOpen={onOpen}
      >
        <Photo />
      </Tab>
      <Tab
        drawer="catalyst"
        id={tabIds?.catalyst}
        label="CATalyst"
        expanded={open === "catalyst"}
        controls={open === "catalyst" ? sheetIds.catalyst : undefined}
        onOpen={onOpen}
      >
        <span aria-hidden="true" className="font-label text-ui leading-none">
          {GLYPH}
        </span>
        <Disc signal={signal} />
      </Tab>
    </nav>
  );
}

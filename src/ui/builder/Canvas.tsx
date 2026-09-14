"use client";
import type { ReactNode } from "react";
import type { Theme } from "@/core/profile/schema";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { BlockList, type BlockListProps } from "./BlockList";
import { FactsFields } from "./FactsFields";
import { themeStyle } from "./theme-css";
import { useWorkingLock } from "./working-lock";

// The canvas (hi-fi 3a; FR-021, FR-022; ADR-010): the mono label, the facts at the top of
// the sheet, the sections as sortable frames under them, and the striped `+ add section`
// tile at the end. Every change leaves as an `EditOperation` through `onApply`; the
// canvas holds no rule about what a document may become. The sheet carries the theme's
// four variables (`themeStyle`) under `theme-scope`, so every frame and editor beneath it
// paints in the theme without knowing it. The frames themselves are `BlockList` (F44),
// which the phone's column draws too, under its collapsed Facts and Theme instead.

/** CONTENT.md → Canvas. */
export const CANVAS_LABEL = "CANVAS · vertical stack, full-width sections only";

/** CONTENT.md → Rail `Facts`: the heading over the profile's own fields. */
export const FACTS_LABEL = "FACTS · name, age, sex, tagline";

export interface CanvasProps extends BlockListProps {
  /** What the sheet paints in: the document's theme, or the one a held slider previews. */
  theme: Theme;
}

// The bar over the sheet: the canvas's mono label.
function CanvasBar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-12 border-b border-line-chrome bg-paper px-28 py-16">
      <span className="font-label text-mono-label tracking-normal text-meta">{CANVAS_LABEL}</span>
    </div>
  );
}

export interface FactsSectionProps extends Pick<CanvasProps, "doc" | "onApply"> {
  /** Controls on the label's row. */
  actions?: ReactNode;
}

/** The profile's own fields at the top of the sheet, on the card ground like a frame. */
export function FactsSection({ doc, onApply, actions }: FactsSectionProps) {
  return (
    <section aria-label="Facts" className="flex flex-col gap-16 bg-card p-16">
      <div className="flex flex-wrap items-center justify-between gap-12">
        <MonoLabel variant="reading" className="text-meta">
          {FACTS_LABEL}
        </MonoLabel>
        {actions}
      </div>
      <FactsFields facts={doc} onApply={onApply} />
    </section>
  );
}

/**
 * The facts, then the sortable stack. Under the tablet floor the shell renders the
 * phone's column instead of the canvas (`phone/PhoneColumn.tsx`).
 */
// F9: the canvas dimmed and marked busy while the helper works. TOKENS.json carries no
// dim/disabled value of its own; the nearest existing opacity utility this system already
// leans on for "present but not interactive" is `opacity-50` (every disabled control's
// own fade), but applying it to the *section* — an ancestor of the words on the page —
// would fade the text itself below its own floor (`meta`/`paper` sits at exactly 4.9:1,
// DESIGN.md §1; halving that fails AA outright, which axe caught in a real run). A veil
// painted over the sheet gets the same read without touching any control's own colour:
// `paper-deep` — the canvas's own ground — at 60% (Tailwind's alpha suffix, the same
// mechanism `bg-ink/70` already uses on a filled slot's chip), decorative and inert.
const LOCKED_CANVAS = "cursor-default";
export const LOCK_VEIL = "pointer-events-none absolute inset-0 bg-paper-deep/60";

/** The themed sheet every frame stands on (`themeStyle` supplies its variables); the phone's column stands its groups on the same one. */
export const SHEET_CLASSES =
  "theme-scope flex w-full max-w-profile-max flex-col gap-12 p-12 shadow-lifted";

export function Canvas(props: CanvasProps) {
  const { doc, theme, onApply } = props;
  const working = useWorkingLock();
  return (
    <section
      aria-label="Canvas"
      aria-busy={working}
      className={`relative flex min-h-full flex-col bg-paper-deep ${working ? LOCKED_CANVAS : ""}`}
    >
      <CanvasBar />
      <div className="flex flex-1 items-start justify-center px-16 py-28 md:px-28">
        <div style={themeStyle(theme)} className={SHEET_CLASSES}>
          <FactsSection doc={doc} onApply={onApply} />
          <BlockList {...props} />
        </div>
      </div>
      {working ? <div aria-hidden="true" className={LOCK_VEIL} /> : null}
    </section>
  );
}

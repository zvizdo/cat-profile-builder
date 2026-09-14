"use client";
import { useId, type ReactNode } from "react";
import { MoveDown } from "@/ui/shared/icons";
import { MonoLabel } from "@/ui/shared/MonoLabel";

// One of the two groups at the top of the phone's stack (design 2026-09-13 §2): Facts and
// Theme, each folded to one line the volunteer reads before deciding to open it. The
// head row is the whole control — the label in the mono label voice, the reading beside
// it in ink, a chevron at the end that turns when open — 44px tall, on the same card
// ground a frame stands on, so the two groups and the frames under them read as one
// column. The fields exist only while the group is open: a closed group leaves nothing
// for Tab to fall into and nothing for a screen reader to walk past.

export interface CollapsedGroupProps {
  /** The group's name — `Facts`, `Theme` — which names the region and leads the row. */
  label: string;
  /** The one-line reading of what is inside (`collapsed-lines.ts`). */
  line: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const HEAD =
  "flex min-h-44 w-full items-center gap-12 px-16 text-left " +
  "transition-colors duration-hover ease-default hover:bg-paper " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue";

/**
 * A region named by its label whose head is a button: `aria-expanded` says whether the
 * body is there, `aria-controls` points at it while it is. The chevron is decorative;
 * the line is text, so the button's own name is `Facts Vini · 2 years · male`.
 */
export function CollapsedGroup({ label, line, open, onToggle, children }: CollapsedGroupProps) {
  const labelId = useId();
  const bodyId = useId();
  return (
    <section aria-labelledby={labelId} className="flex flex-col bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        className={HEAD}
        onClick={onToggle}
      >
        <MonoLabel id={labelId} className="shrink-0 text-meta">
          {label}
        </MonoLabel>
        <MonoLabel variant="reading" className="min-w-0 flex-1 truncate text-ink">
          {line}
        </MonoLabel>
        <MoveDown
          className={`text-meta transition-transform duration-hover ease-default ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div id={bodyId} className="px-16 pb-16">
          {children}
        </div>
      ) : null}
    </section>
  );
}

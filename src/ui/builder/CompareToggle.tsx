"use client";
import { useRef } from "react";

// The compare view's two-option segmented control (T045; WAI-ARIA radio group), split
// out of `EnhanceCompare.tsx` for the lint line ceiling. The divider stands `split`%
// from the left with the original on its left and the enhanced result on its right, so
// `Original` is the divider at 100 and `Enhanced` at 0; one of the pair is in the Tab
// order — the checked one, or the
// first while the divider stands between the ends — and the arrows walk between them.
// Checked is the ink chip, the same mark the library's tiles wear; focus is the blue
// outline every control has.

/** One end of the divider, as the toggle names it. */
interface Side {
  value: 0 | 100;
  label: "Original" | "Enhanced";
}

const ORIGINAL: Side = { value: 100, label: "Original" };
const ENHANCED: Side = { value: 0, label: "Enhanced" };
const SIDES = [ORIGINAL, ENHANCED];

/** The divider's position from the left, 0 (all enhanced) to 100 (all original), and its setter. */
export interface SplitProps {
  split: number;
  onSplit: (split: number) => void;
}

/** Arrow keys move the check to the other option (Original sits left of Enhanced); Space and Enter check the one under focus. */
function keyedSide(key: string, side: Side): Side | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return ENHANCED;
    case "ArrowLeft":
    case "ArrowUp":
      return ORIGINAL;
    case " ":
    case "Enter":
      return side;
    default:
      return null;
  }
}

/** The `Original` / `Enhanced` toggle over the divider's position; neither is checked between the ends. */
export function CompareToggle({ split, onSplit }: SplitProps) {
  const buttons = useRef<Partial<Record<Side["label"], HTMLButtonElement | null>>>({});
  const checked = SIDES.find((side) => side.value === split) ?? null;
  const tabbable = checked ?? ORIGINAL;
  const choose = (side: Side) => {
    onSplit(side.value);
    buttons.current[side.label]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Show"
      className="flex gap-4 self-center rounded-control border border-line-button p-4"
    >
      {SIDES.map((side) => (
        <button
          key={side.label}
          ref={(el) => {
            buttons.current[side.label] = el;
          }}
          type="button"
          role="radio"
          aria-checked={side === checked}
          tabIndex={side === tabbable ? 0 : -1}
          className="min-h-44 rounded-control px-12 text-ui-dense text-meta transition-colors duration-hover ease-default hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue aria-checked:bg-ink aria-checked:text-card"
          onClick={() => onSplit(side.value)}
          onKeyDown={(event) => {
            const next = keyedSide(event.key, side);
            if (next === null) return;
            event.preventDefault();
            choose(next);
          }}
        >
          {side.label}
        </button>
      ))}
    </div>
  );
}

"use client";
import type { TextAction } from "../use-enhance";
import { useWorkingLock } from "../working-lock";

// The row under a gallery cell's or a day scene's slot for its one text action (T045):
// `enhance` / `revert to original`, in the label row's own voice — mono, blue, 44px —
// rather than a chip over the photo, where two chips wrapped and hid the picture. F12:
// like the cell's Remove, it keeps its own un-themed card chip (`theme-chrome bg-card`)
// so the blue holds 4.5:1 on Sand and Night. Nothing at all while the slot has no
// ready photo, so an empty cell adds no height.

const ACTION =
  "theme-chrome inline-flex min-h-44 items-center rounded-control bg-card px-8 font-label " +
  "text-mono-label tracking-normal text-blue transition-colors duration-hover ease-default " +
  "hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue " +
  "disabled:pointer-events-none disabled:opacity-50";

/** A slot's `enhance` / `revert to original` as its own row, or nothing when there is none. */
export function CellAction({ action }: { action: TextAction | null }) {
  const working = useWorkingLock();
  if (action === null) return null;
  return (
    <div className="flex justify-center">
      <button
        id={action.id}
        type="button"
        disabled={working || action.disabled === true}
        className={ACTION}
        onClick={action.onClick}
      >
        {action.label}
      </button>
    </div>
  );
}

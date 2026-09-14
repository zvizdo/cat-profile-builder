"use client";
import { createContext, useContext, type ReactNode } from "react";
import { IconButton } from "@/ui/shared/IconButton";
import { Duplicate, MoveDown, MoveUp, Remove } from "@/ui/shared/icons";
import { JustNowTag } from "../follow";
import { moveButtonId } from "../reorder";
import { useWorkingLock } from "../working-lock";

// The phone's label row (design 2026-09-13 §2; QA B2): below 768px one row stands in for
// both `BlockFrame`'s hidden handle column and `BlockShell`'s hover-gated action row.
// It holds the kicker (the frame's mono label, from `BlockShell`), then `↑` `↓` — what
// the handle column's Move up / Move down dispatch, with the same ids so the canvas's
// refocus after a move lands here — then `duplicate` and `remove`: four 44px icon
// buttons, always visible, never hover-gated, on the chrome's own paper ground like the
// desktop row. There is no drag handle on the phone at all: the handle is the sortable
// activator, and not rendering it is what keeps a touch from ever starting a drag
// (`CanvasStack.tsx`'s sensors stay armed and stay three).
//
// `↑` `↓` belong to the frame (`BlockFrame` knows the ends of the stack) while the row
// is drawn inside each editor's `BlockShell`; the frame hands them down through a
// context rather than a prop through every editor, the way `TouchedProvider` hands the
// helper's touch down. The hero's fixed frame provides none, so its row has no moves —
// and `fixed` already keeps `duplicate` and `remove` off it.

/** What a sortable frame gives its label row: where it stands and how to move it. */
export interface MoveControls {
  blockId: string;
  first: boolean;
  last: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const MoveContext = createContext<MoveControls | null>(null);

/** Marks the subtree beneath it as one sortable frame's, with its moves. */
export function MoveProvider({
  controls,
  children,
}: {
  controls: MoveControls;
  children: ReactNode;
}) {
  return <MoveContext.Provider value={controls}>{children}</MoveContext.Provider>;
}

/** The frame's moves, or `null` under the hero's fixed frame and outside any frame. */
export function useMoveControls(): MoveControls | null {
  return useContext(MoveContext);
}

// The ends of the stack use `aria-disabled` rather than `disabled`, so a Move button
// keeps focus after the block reaches the top or bottom (acceptance 1.3). F9: a real
// `disabled` while the helper works, on top of that.
function Moves({ controls, working }: { controls: MoveControls; working: boolean }) {
  const { blockId, first, last, onMoveUp, onMoveDown } = controls;
  return (
    <>
      <IconButton
        id={moveButtonId(blockId, "up")}
        icon={MoveUp}
        aria-label="Move up"
        aria-disabled={first}
        disabled={working}
        className="aria-disabled:opacity-50"
        onClick={first || working ? undefined : onMoveUp}
      />
      <IconButton
        id={moveButtonId(blockId, "down")}
        icon={MoveDown}
        aria-label="Move down"
        aria-disabled={last}
        disabled={working}
        className="aria-disabled:opacity-50"
        onClick={last || working ? undefined : onMoveDown}
      />
    </>
  );
}

export interface PhoneLabelRowProps {
  /** The id the frame's `region` is labelled by. */
  labelId: string;
  /** The frame's mono label (`frameLabel`). */
  label: string;
  /** F34: the helper just touched this frame — the row wears the tag. */
  touched: boolean;
  /** The hero: no `duplicate`, no `remove` (and no moves, since its frame provides none). */
  fixed: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
}

/**
 * The row under a frame's body on the phone: the label (and the `just now` tag) on the
 * left, the four icon buttons on the right. `remove` is the danger variant — clay on
 * the chrome's paper, the pairing the desktop row already measured to 4.5:1 under
 * every preset.
 */
export function PhoneLabelRow(props: PhoneLabelRowProps) {
  const { labelId, label, touched, fixed, onDuplicate, onRemove } = props;
  const working = useWorkingLock();
  const controls = useMoveControls();
  return (
    <div
      data-phone-row=""
      className="theme-chrome flex items-center justify-between gap-8 border-t border-line-chrome bg-paper py-4 pr-8 pl-12"
    >
      <div className="flex min-h-44 min-w-0 flex-wrap items-center gap-x-12 gap-y-4">
        {/* One line beside the four buttons: the kicker truncates (the region's name is
            still the whole label). */}
        <span
          id={labelId}
          className="max-w-full truncate font-label text-mono-label tracking-normal text-meta"
        >
          {label}
        </span>
        {touched ? <JustNowTag /> : null}
      </div>
      <div className="flex shrink-0 items-center text-meta">
        {controls === null ? null : <Moves controls={controls} working={working} />}
        {fixed ? null : (
          <>
            <IconButton
              icon={Duplicate}
              aria-label="duplicate"
              disabled={working}
              className="text-blue"
              onClick={onDuplicate}
            />
            <IconButton
              icon={Remove}
              variant="danger"
              aria-label="remove"
              disabled={working}
              onClick={onRemove}
            />
          </>
        )}
      </div>
    </div>
  );
}

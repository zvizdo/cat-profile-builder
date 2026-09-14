"use client";
import { IconButton } from "@/ui/shared/IconButton";
import { Next, Prev, Remove, type Icon } from "@/ui/shared/icons";
import { PhotoSlot } from "../PhotoSlot";
import type { TextAction } from "../use-enhance";
import { useWorkingLock } from "../working-lock";
import { CellAction } from "./CellAction";
import type { EditorFor } from "./editor-props";
import { moveId } from "./gallery-ids";
import { GalleryCellTouch } from "./GalleryCellTouch";
import { useTouch } from "./use-touch-band";

// One photo of the gallery (T025): its slot, then Move left, Remove and Move right under
// it, every one 44px. The order itself is the gallery editor's `set_field mediaIds`.
//
// F12: `IconButton`'s `danger` variant is clay text with no background of its own, so it
// read whatever the row sat on — the frame's `bg-card`, which the canvas's `.theme-scope`
// repoints at the *themed* card colour (`--profile-bg-a`). Same failure as NeedsEditor's
// `remove card` (4.34:1 on Sand, 3.26:1 on Night), just reached through the shared
// component's variant map instead of a literal `text-clay` in this file, which is why an
// earlier grep for that string missed it. `theme-chrome bg-card` gives just this button its
// own fixed, un-themed chip — Move left/right stay ghost (`currentColor`, themed on
// purpose) and untouched.
//
// F55: that row is the pointer's, from 1180px. On touch (`useTouch`: the phone and the
// touch band) the tile's controls are one row of pills instead (`GalleryCellTouch`).

export { moveId } from "./gallery-ids";

interface MoveButtonProps {
  id: string;
  icon: Icon;
  label: "Move left" | "Move right";
  /** The row's own end — an `aria-disabled` Move button keeps focus past it. */
  atEnd: boolean;
  /** F9: a real `disabled` while the helper works, on top of `atEnd`'s `aria-disabled`. */
  disabled: boolean;
  onMove: () => void;
}

function MoveButton({ id, icon, label, atEnd, disabled, onMove }: MoveButtonProps) {
  return (
    <IconButton
      id={id}
      icon={icon}
      aria-label={label}
      aria-disabled={atEnd}
      disabled={disabled}
      className="aria-disabled:opacity-50"
      onClick={atEnd || disabled ? undefined : onMove}
    />
  );
}

/** F12: its own fixed, un-themed chip (`theme-chrome bg-card`) — see the file comment. */
function RemoveButton({ disabled, onRemove }: { disabled: boolean; onRemove: () => void }) {
  return (
    <IconButton
      icon={Remove}
      variant="danger"
      aria-label="Remove photo"
      disabled={disabled}
      className="theme-chrome bg-card"
      onClick={onRemove}
    />
  );
}

interface CellProps extends Pick<EditorFor<"gallery">, "block" | "assets"> {
  mediaId: string;
  index: number;
  onPick: (mediaId: string) => void;
  onMove: (direction: "left" | "right") => void;
  onRemove: () => void;
  /** T045: this cell's `enhance` / `revert to original`, as its own row under the controls. */
  enhance: TextAction | null;
}

type ControlsProps = Omit<CellProps, "assets" | "onPick" | "block" | "index"> & {
  blockId: string;
  first: boolean;
  last: boolean;
  working: boolean;
};

// The pointer's controls: the two ghost chevrons at the tile's edges, Remove between
// them, and the enhance action as its own row beneath.
function PointerControls(props: ControlsProps) {
  const { blockId, mediaId, first, last, working, enhance, onMove, onRemove } = props;
  return (
    <>
      <div className="flex justify-between text-meta">
        <MoveButton
          id={moveId(blockId, mediaId, "left")}
          icon={Prev}
          label="Move left"
          atEnd={first}
          disabled={working}
          onMove={() => onMove("left")}
        />
        <RemoveButton disabled={working} onRemove={onRemove} />
        <MoveButton
          id={moveId(blockId, mediaId, "right")}
          icon={Next}
          label="Move right"
          atEnd={last}
          disabled={working}
          onMove={() => onMove("right")}
        />
      </div>
      <CellAction action={enhance} />
    </>
  );
}

// One photo: its slot, then the controls. F9: Move left/right and Remove are edits on
// the block's own `mediaIds`, so all of them lock while the helper works.
export function GalleryCell({
  block,
  assets,
  mediaId,
  index,
  onPick,
  onMove,
  onRemove,
  enhance,
}: CellProps) {
  const working = useWorkingLock();
  const touch = useTouch();
  const controls = {
    blockId: block.id,
    mediaId,
    first: index === 0,
    last: index === block.mediaIds.length - 1,
    working,
    enhance,
    onMove,
    onRemove,
  };
  return (
    <li className="flex flex-col gap-4">
      <PhotoSlot
        mediaId={mediaId}
        assets={assets}
        kind="photo"
        aspect="square"
        slotName={`photo ${index + 1}`}
        onPick={onPick}
      />
      {touch ? <GalleryCellTouch {...controls} /> : <PointerControls {...controls} />}
    </li>
  );
}

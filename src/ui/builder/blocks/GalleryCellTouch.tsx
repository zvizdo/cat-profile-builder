"use client";
import { Next, Prev, Remove } from "@/ui/shared/icons";
import { ENHANCE_LABEL, ENHANCE_LABEL_TOUCH_REVERT } from "../enhance-state";
import type { TextAction } from "../use-enhance";
import { moveId } from "./gallery-ids";
import { IconPill, Pill } from "./Pill";

// A gallery tile's controls on touch (F55 item 1; the controller's phone sweep, finding
// 1): the same pills the hero's own row draws under 768px and the label row draws in
// the touch band (F47) — `Move left`, `Move right`, `enhance`, `Remove photo`, every one
// 44px, fully rounded, on one hairline — in place of the desktop's cluster of unboxed
// chevrons, a white `Remove` square and a white `enhance` chip of another size, which
// read as unfinished at a thumb's distance. F12 still holds: `Remove` is clay, and clay
// on a themed ground can fall under 4.5:1 (Sand 4.34, Night 3.26), so that one pill
// stands on its own un-themed card chip (`theme-chrome bg-card`); the others are the
// theme's ink on the theme's ground, the same as the hero's pills.
//
// F61 (gallery-many-photos-investigation.md): the row used to be `flex flex-wrap`, and
// the one variable-width control in it — `enhance` (87.8px) vs `revert to original`
// (139.2px), the same action at a different width — let a tile with the longer word
// wrap to a third line while its row neighbour stayed at two, so the two columns'
// pill rows ended up 52px apart. A first pass tried an even `grid-cols-2` track for the
// bottom row, but an even split gives the pill only half the row (~73px of a 155px
// tile) — less than even `enhance` needs (87.8px) — so it truncated a word that used to
// fit whole (browser check at 390: `enh…`), trading one bug for another. The row is now
// two stacked `flex` rows instead: the moves (always exactly 96px, comfortably under
// every touch tile width) on top, and the pill plus `Remove photo` (`shrink-0`, its
// 44px never gives ground) on the bottom, the pill taking whatever is left
// (`min-w-0 flex-1`) rather than a fixed half. Neither row can ever wrap to a second
// line — flex without `flex-wrap` does not — so the tile is always exactly two rows,
// and at every measured width `enhance` now has more room than it needs. The
// controller's ruling 2026-09-13: on touch the pill's visible word for `revert` is the
// short `ENHANCE_LABEL_TOUCH_REVERT` ("revert"), never an ellipsis inside the verb; the
// button's accessible name stays the full `ENHANCE_LABEL.revert` phrase via
// `aria-label`. The pill's inner `truncate` span (`Pill`) stays as the general
// fallback — for `processing`, or any future longer word — so the row still never grows
// a third line even if a caller cannot shorten the label. `justify-between` on the
// moves and `justify-end` on the bottom row keep both rows' right edges — `Move right`
// and `Remove photo` — lined up, the same two-column rhythm the old row drew.

/** The word the touch pill shows: `revert to original` reads as `revert` (F61); every
 * other label — `enhance`, `processing` — is unchanged. */
function touchWord(label: string): string {
  return label === ENHANCE_LABEL.revert ? ENHANCE_LABEL_TOUCH_REVERT : label;
}

export interface GalleryCellTouchProps {
  blockId: string;
  mediaId: string;
  first: boolean;
  last: boolean;
  /** F9: everything here edits the block's `mediaIds`, so all of it locks while the helper works. */
  working: boolean;
  enhance: TextAction | null;
  onMove: (direction: "left" | "right") => void;
  onRemove: () => void;
}

/** Two fixed rows: Move left/Move right on top, the enhance-or-revert pill and Remove
 * photo below — never a third (F61). */
export function GalleryCellTouch(props: GalleryCellTouchProps) {
  const { blockId, mediaId, first, last, working, enhance, onMove, onRemove } = props;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between gap-8">
        <IconPill
          id={moveId(blockId, mediaId, "left")}
          icon={Prev}
          variant="secondary"
          aria-label="Move left"
          aria-disabled={first}
          disabled={working}
          onClick={first || working ? undefined : () => onMove("left")}
        />
        <IconPill
          id={moveId(blockId, mediaId, "right")}
          icon={Next}
          variant="secondary"
          aria-label="Move right"
          aria-disabled={last}
          disabled={working}
          onClick={last || working ? undefined : () => onMove("right")}
        />
      </div>
      <div className="flex justify-end gap-8">
        {enhance === null ? null : (
          <Pill
            id={enhance.id}
            variant="secondary"
            className="min-w-0 flex-1"
            aria-label={enhance.label}
            disabled={working || enhance.disabled === true}
            onClick={enhance.onClick}
          >
            {touchWord(enhance.label)}
          </Pill>
        )}
        <span className="theme-chrome inline-flex shrink-0 rounded-pill bg-card">
          <IconPill
            icon={Remove}
            variant="destructive"
            aria-label="Remove photo"
            disabled={working}
            onClick={onRemove}
          />
        </span>
      </div>
    </div>
  );
}

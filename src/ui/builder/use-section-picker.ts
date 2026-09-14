import { useEffect, useRef, useState } from "react";
import type { BlockInput } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import { emptyBlock } from "./block-content";
import { revealTarget } from "./readiness-scroll";

// The canvas's add tile opens this picker instead of doing nothing (F2). Choosing a type
// is one `add_block` appended at the end — the same input the rail's tiles send — so the
// core decides nothing differently for the two paths. `applyOperation` hands the new
// block a fresh id itself, so the only way to find it back is to watch the list grow by
// one: `expecting` holds the length the picker's own add should produce, and the reveal
// effect fires only when the blocks the caller passes in reach it (never for a length
// change some other add — the rail, a duplicate — produced).

export interface SectionPickerController {
  open: boolean;
  openPicker: () => void;
  close: () => void;
  choose: (type: Exclude<Block["type"], "hero">) => void;
}

/**
 * `blocks` is the full document order (hero included) — an `add_block` with no `index`
 * lands at the end of that same list, so the newest block is always its last entry once
 * the caller's next render carries it.
 */
export function useSectionPicker(
  blocks: readonly Block[],
  onAdd: (block: BlockInput) => void,
): SectionPickerController {
  const [open, setOpen] = useState(false);
  const expecting = useRef<number | null>(null);

  useEffect(() => {
    if (expecting.current !== blocks.length) return;
    expecting.current = null;
    const added = blocks[blocks.length - 1];
    if (added !== undefined) revealTarget({ kind: "block", blockId: added.id });
  }, [blocks]);

  return {
    open,
    openPicker: () => setOpen(true),
    close: () => setOpen(false),
    choose: (type) => {
      expecting.current = blocks.length + 1;
      onAdd(emptyBlock(type));
      setOpen(false);
    },
  };
}

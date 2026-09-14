import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { sectionLabel } from "@/core/profile/fields";
import type { Block, ProfileDocument } from "@/core/profile/schema";

// The order a move produces and the words the drag speaks (ADR-010: announcements are
// ours, in the shelter's voice). The order goes to core as one `reorder_blocks`; nothing
// here decides whether it is legal.

/** The element id of a frame's Move up / Move down button, stable across reorders — the
 * handle column's from 768px, the phone label row's under it — so the canvas refocuses
 * the button that moved a block wherever it is drawn. */
export function moveButtonId(blockId: string, direction: "up" | "down"): string {
  return `${blockId}-move-${direction}`;
}

/** The ids in `blocks`' order with the block at `from` moved to `to`; unchanged when out of range. */
export function movedOrder(blocks: readonly Block[], from: number, to: number): string[] {
  const ids = blocks.map((block) => block.id);
  if (to < 0 || to >= ids.length || from === to) return ids;
  return arrayMove(ids, from, to);
}

/** What a screen reader hears before a drag: how to pick up, move and drop a section. */
export const DRAG_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "To pick up a section, press space or enter. Use the arrow keys to move it up or down, " +
    "then press space or enter again to drop it, or escape to cancel.",
};

/**
 * The live-region sentences for a drag over `blocks`: what was picked up, where it is,
 * where it landed or that nothing changed. Each names the section the way the core does
 * (`the video section`) and positions count from one; a day or needs section's own name
 * carries the cat's recorded pronoun (F41), same as everywhere else it is named.
 */
export function dragAnnouncements(
  blocks: readonly Block[],
  sex: ProfileDocument["sex"],
): Announcements {
  const total = blocks.length;
  const label = (id: string | number) => {
    const block = blocks.find((candidate) => candidate.id === id);
    return block === undefined ? "the section" : `the ${sectionLabel(block.type, sex)}`;
  };
  const position = (id: string | number) => blocks.findIndex((block) => block.id === id) + 1;
  return {
    onDragStart: ({ active }) =>
      `Picked up ${label(active.id)}. Use the arrow keys to move it, space to drop, escape to cancel.`,
    // The pickup is followed at once by an "over itself"; saying nothing then keeps the
    // pickup sentence audible.
    onDragOver: ({ active, over }) => {
      if (over === null || over.id === active.id) return undefined;
      return `${capital(label(active.id))} is over position ${position(over.id)} of ${total}.`;
    },
    onDragEnd: ({ active, over }) => {
      if (over === null || over.id === active.id)
        return `Dropped ${label(active.id)} where it was.`;
      return `Dropped ${label(active.id)} at position ${position(over.id)} of ${total}.`;
    },
    onDragCancel: ({ active }) => `Cancelled. ${capital(label(active.id))} is back where it was.`,
  };
}

function capital(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

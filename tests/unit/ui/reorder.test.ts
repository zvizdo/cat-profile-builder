import type { Active, Over } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import type { Block, ProfileDocument } from "@/core/profile/schema";
import { dragAnnouncements, movedOrder } from "@/ui/builder/reorder";

// The drag-and-drop live-region sentences (ADR-010) over a small stack with a day and a
// needs section, so `dragAnnouncements`' own naming — which follows the core's
// `sectionLabel` — can be checked directly. F41: a day or needs section's own name in
// these sentences carries the cat's recorded pronoun.

const BIO: Block = { id: "bioaaaaaaaaa", type: "bio", content: { paragraphs: [] } };
const DAY: Block = {
  id: "dayaaaaaaaaa",
  type: "day",
  scenes: [
    { mediaId: null, caption: "" },
    { mediaId: null, caption: "" },
    { mediaId: null, caption: "" },
  ],
};
const NEEDS: Block = { id: "needsaaaaaaa", type: "needs", cards: [{ title: "", text: "" }] };

const BLOCKS = [BIO, DAY, NEEDS];

// `dragAnnouncements`' callbacks only ever read `.id` off `active`/`over`; the rest of
// dnd-kit's own shape is irrelevant to the sentence, so the fixtures fake just that field.
function draggable(id: string): Active {
  return { id } as unknown as Active;
}

function droppable(id: string): Over {
  return { id } as unknown as Over;
}

describe("movedOrder", () => {
  it("moves the id at `from` to `to`, unchanged out of range or a no-op move", () => {
    expect(movedOrder(BLOCKS, 0, 2)).toEqual([DAY.id, NEEDS.id, BIO.id]);
    expect(movedOrder(BLOCKS, 0, 0)).toEqual([BIO.id, DAY.id, NEEDS.id]);
    expect(movedOrder(BLOCKS, 0, 9)).toEqual([BIO.id, DAY.id, NEEDS.id]);
  });
});

describe("dragAnnouncements", () => {
  function pickedUp(sex: ProfileDocument["sex"], id: string): string | undefined {
    return dragAnnouncements(BLOCKS, sex).onDragStart({ active: draggable(id) });
  }

  it("names the day section by the cat's recorded sex — female, male, then unset as 'their'", () => {
    expect(pickedUp("female", DAY.id)).toBe(
      'Picked up the "A day in her life" section. Use the arrow keys to move it, space to drop, escape to cancel.',
    );
    expect(pickedUp("male", DAY.id)).toBe(
      'Picked up the "A day in his life" section. Use the arrow keys to move it, space to drop, escape to cancel.',
    );
    expect(pickedUp(undefined, DAY.id)).toBe(
      'Picked up the "A day in their life" section. Use the arrow keys to move it, space to drop, escape to cancel.',
    );
  });

  it("names the needs section by the cat's recorded sex on drop and cancel", () => {
    const male = dragAnnouncements(BLOCKS, "male");
    expect(male.onDragEnd({ active: draggable(NEEDS.id), over: droppable(NEEDS.id) })).toBe(
      'Dropped the "What he needs" section where it was.',
    );
    expect(male.onDragCancel({ active: draggable(NEEDS.id), over: null })).toBe(
      'Cancelled. The "What he needs" section is back where it was.',
    );

    const unset = dragAnnouncements(BLOCKS, undefined);
    expect(unset.onDragEnd({ active: draggable(NEEDS.id), over: droppable(NEEDS.id) })).toBe(
      'Dropped the "What they need" section where it was.',
    );
  });

  it("names an unmoved bio (ungendered) the same regardless of sex", () => {
    const female = dragAnnouncements(BLOCKS, "female");
    expect(female.onDragEnd({ active: draggable(BIO.id), over: droppable(BIO.id) })).toBe(
      "Dropped the bio where it was.",
    );
  });
});

"use client";
import { type DragEndEvent } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { describeOperation, type EditOperation } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { FixedHeroFrame } from "./BlockFrame";
import { CanvasStack } from "./CanvasStack";
import { displayName } from "./display-name";
import { touchOf, type FollowMarks } from "./follow";
import { RemoveQuestion } from "./RemoveQuestion";
import { ADD_TILE_ID } from "./readiness-scroll";
import { movedOrder, moveButtonId } from "./reorder";
import { SectionPicker } from "./SectionPicker";
import type { EnhanceFn } from "./use-enhance";
import { useRefocus } from "./use-refocus";
import { useSectionPicker } from "./use-section-picker";
import { useWorkingLock } from "./working-lock";

// The sections themselves (hi-fi 3a; FR-021, FR-022; ADR-010): the fixed hero, the
// sortable stack under it, the striped `+ add section` tile at the end, and the two
// things the list asks — the section picker (F2) and the remove question. Split out of
// `Canvas.tsx` (F44) so the desktop canvas and the phone's column draw the very same
// frames: the canvas adds its bar and the facts above; the phone its collapsed groups.
// Every change leaves as an `EditOperation` through `onApply`; nothing here holds a
// rule about what a document may become.

export interface BlockListProps {
  doc: ProfileDocument;
  /** The library's live records: the slots draw from them and the questions name them. */
  assets: readonly AssetView[];
  /** One manual edit; the list names reorders and removals itself. */
  onApply: (op: EditOperation, label?: string) => void;
  onDuplicate: (blockId: string) => void;
  /** `re-trim` on a video section: opens the library's trim editor for the clip. */
  onOpenTrim: (mediaId: string) => void;
  /** `enhance` on a placed photo (T045): the library's `enhance`. */
  onEnhance: EnhanceFn;
  /** The bio's `rewrite`/`shorten` chips (T038): sends a request to the helper panel. */
  onAskHelper: (text: string) => void;
  /** The helper's touch on the frames (F34): which blink now, which wear the tag. */
  follow?: FollowMarks;
}

// Pointer and keyboard drags, Move up and Move down all end in one `reorder_blocks` with
// the whole order; an order that is the current one is not an edit. The hero (F1: fixed at
// `blocks[0]`) never enters the sortable list — `sortable` is `doc.blocks.slice(1)`, and
// every order handed to `applyOperation` is the hero's id followed by the sortable order,
// so the hero can never itself be named as moving.
function useReorder(doc: ProfileDocument, onApply: BlockListProps["onApply"]) {
  const refocus = useRefocus();
  const heroId = doc.blocks[0]?.id;
  const sortable = useMemo(() => doc.blocks.slice(1), [doc.blocks]);
  const ids = useMemo(() => sortable.map((block) => block.id), [sortable]);
  const reorder = (from: number, to: number) => {
    if (heroId === undefined) return;
    const order = [heroId, ...movedOrder(sortable, from, to)];
    if (order.every((id, index) => id === doc.blocks[index]?.id)) return;
    onApply({ op: "reorder_blocks", order });
  };
  const move = (index: number, direction: "up" | "down") => {
    const id = ids[index];
    if (id === undefined) return;
    refocus(moveButtonId(id, direction));
    reorder(index, direction === "up" ? index - 1 : index + 1);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over === null || over.id === active.id) return;
    reorder(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };
  return { sortable, ids, move, onDragEnd, refocus };
}

type HeroSlotProps = Omit<BlockListProps, "onDuplicate">;

/** The fixed hero above the sortable stack — `blocks[0]` is always the hero (F1). */
function HeroSlot(props: HeroSlotProps) {
  const { doc, assets, onApply, onOpenTrim, onEnhance, onAskHelper, follow } = props;
  const hero = doc.blocks[0];
  if (hero?.type !== "hero") return null;
  return (
    <FixedHeroFrame
      block={hero}
      assets={assets}
      catName={displayName(doc.name)}
      onApply={onApply}
      describe={(op) => describeOperation(doc, op, assets)}
      onOpenTrim={onOpenTrim}
      onEnhance={onEnhance}
      onAskHelper={onAskHelper}
      {...touchOf(follow, hero.id)}
    />
  );
}

/**
 * The hero, the sortable stack, the add tile, and the two questions. `remove` asks
 * first, in the words `describeOperation` gives for the removal, and Escape keeps the
 * section; after a removal focus lands on the add tile. The add tile opens the section
 * picker; choosing appends that type and reveals it.
 */
export function BlockList(props: BlockListProps) {
  const { doc, assets, onApply, onDuplicate, onOpenTrim, onEnhance, onAskHelper, follow } = props;
  const [toRemove, setToRemove] = useState<string | null>(null);
  const { sortable, ids, move, onDragEnd, refocus } = useReorder(doc, onApply);
  const picker = useSectionPicker(doc.blocks, (block) => onApply({ op: "add_block", block }));
  const working = useWorkingLock();

  const confirmRemove = (blockId: string) => {
    setToRemove(null);
    refocus(ADD_TILE_ID);
    onApply({ op: "remove_block", blockId });
  };

  return (
    <>
      <HeroSlot {...props} />
      <CanvasStack
        doc={doc}
        assets={assets}
        sortable={sortable}
        ids={ids}
        move={move}
        onDragEnd={onDragEnd}
        onApply={onApply}
        onDuplicate={onDuplicate}
        onOpenTrim={onOpenTrim}
        onEnhance={onEnhance}
        onAskHelper={onAskHelper}
        onAskRemove={setToRemove}
        follow={follow}
      />
      <StripedPlaceholder
        as="button"
        id={ADD_TILE_ID}
        label="+ add section"
        disabled={working}
        onClick={picker.openPicker}
      />
      <RemoveQuestion
        doc={doc}
        assets={assets}
        blockId={toRemove}
        onKeep={() => setToRemove(null)}
        onRemove={confirmRemove}
      />
      <SectionPicker open={picker.open} sex={doc.sex} close={picker.close} choose={picker.choose} />
    </>
  );
}

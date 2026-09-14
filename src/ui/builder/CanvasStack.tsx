"use client";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useId, useMemo } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { describeOperation, type EditOperation } from "@/core/profile/operations";
import type { Block, ProfileDocument } from "@/core/profile/schema";
import { BlockFrame } from "./BlockFrame";
import { displayName } from "./display-name";
import { touchOf, type FollowMarks } from "./follow";
import { DRAG_INSTRUCTIONS, dragAnnouncements } from "./reorder";
import type { EnhanceFn } from "./use-enhance";

// The sortable stack under the fixed hero (hi-fi 3a; FR-022; ADR-010), split out of
// `Canvas.tsx` to keep it under the lint line ceiling (F2). Pointer and keyboard drags,
// Move up and Move down all end in `Canvas`'s one `reorder_blocks` — this component only
// draws the frames and reports drag ends and moves upward, deciding nothing itself.

export interface CanvasStackProps {
  doc: ProfileDocument;
  assets: readonly AssetView[];
  onApply: (op: EditOperation, label?: string) => void;
  onDuplicate: (blockId: string) => void;
  onOpenTrim: (mediaId: string) => void;
  onEnhance: EnhanceFn;
  onAskHelper: (text: string) => void;
  /** The blocks below the fixed hero — `doc.blocks.slice(1)` — the only ones that sort. */
  sortable: readonly Block[];
  ids: string[];
  move: (index: number, direction: "up" | "down") => void;
  onDragEnd: (event: DragEndEvent) => void;
  onAskRemove: (blockId: string) => void;
  /** The helper's touch on the frames (F34): which blink now, which wear the tag. */
  follow?: FollowMarks;
}

// The stack is vertical, so a dragged frame only ever moves up or down (CONTENT.md →
// Canvas: full-width sections only).
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** How long a finger holds the handle before a touch drag starts; a shorter touch scrolls. */
const TOUCH_HOLD_MS = 250;

// The frames inside the drag context. The pointer sensor waits for 4px of travel so a
// click on the handle is a click; a touch waits a short hold so the canvas still scrolls
// under a finger (ADR-010, tablets); the keyboard sensor walks the sortable rects.
export function CanvasStack(props: CanvasStackProps) {
  const {
    doc,
    assets,
    sortable,
    ids,
    move,
    onDragEnd,
    onApply,
    onDuplicate,
    onOpenTrim,
    onEnhance,
    onAskHelper,
    onAskRemove,
    follow,
  } = props;
  // F9: the sensors themselves stay armed for the helper's whole life — dnd-kit's own
  // `DndContext` reads the array's *length* as an (acknowledged, unfixed) dependency
  // array internally, so an array that ever holds fewer than three sensors trips "the
  // final argument passed to useMemo changed size between renders" the moment the lock
  // engages or lifts. A drag still cannot start while locked: `BlockFrame`'s own handle
  // is a real `disabled` button (F9), and a disabled element receives neither the
  // pointerdown a mouse drag activates on nor the focus a keyboard drag needs.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements = useMemo(() => dragAnnouncements(sortable, doc.sex), [sortable, doc.sex]);
  // A fixed id keeps dnd-kit's `aria-describedby` the same on the server and in the
  // browser; its default is a counter, which hydrates differently.
  const dndId = useId();
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: DRAG_INSTRUCTIONS }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-12">
          {sortable.map((block, index) => (
            <BlockFrame
              key={block.id}
              block={block}
              index={index}
              count={sortable.length}
              assets={assets}
              catName={displayName(doc.name)}
              onApply={onApply}
              describe={(op) => describeOperation(doc, op, assets)}
              onOpenTrim={onOpenTrim}
              onEnhance={onEnhance}
              onAskHelper={onAskHelper}
              onMoveUp={() => move(index, "up")}
              onMoveDown={() => move(index, "down")}
              onDuplicate={() => onDuplicate(block.id)}
              onRemove={() => onAskRemove(block.id)}
              {...touchOf(follow, block.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

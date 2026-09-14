"use client";
import { useState } from "react";
import type { EditOperation } from "@/core/profile/operations";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { OpenEnhanceCompare } from "../EnhanceCompare";
import { MediaPicker } from "../MediaPicker";
import { PhotoSlot } from "../PhotoSlot";
import { useEnhance, type Enhancing } from "../use-enhance";
import { useRefocus } from "../use-refocus";
import { BlockShell } from "./BlockShell";
import { ConfirmEdit } from "./ConfirmEdit";
import type { EditorFor } from "./editor-props";
import { GalleryCell, moveId } from "./GalleryCell";
import { useTouch } from "./use-touch-band";

// The gallery (hi-fi 3a `GALLERY · 3 of up to 12`; FR-016): the photos in a 4-up grid (two
// up under 1180px — F44 made the phone two-up, a thumb's slot, not a fingernail's; F55
// carries that through the touch band, where a 4-up tile beside the rail is 71px at 768
// and cannot hold its four 44px pills) in display order, each with Move left, Move right and Remove, then one pickable slot, and
// `add photos` on the label row for several at once. Every change is one operation: a
// pick is `replace_image` with its slot (the slot after the last appends); a move, an add
// of several and a removal are one `set_field mediaIds` with the whole list. The cap is
// the schema's — a thirteenth photo comes back refused with the core's sentence. T045:
// each cell's slot carries `enhance` / `revert to original` as a chip — one label row
// cannot name twelve photos — and the compare opens over the gallery for that one slot.
// F55 item 2: on touch the grid pads with nothing — one `Add a photo` cell after the
// photos, not that and a second striped spare (the sweep's "two dashed cells *and* an
// `add photos` button"); the pointer's 4-up row keeps its padding so an empty gallery
// still reads as one row.

/** How many cells the pointer's grid shows at least, so an empty gallery reads as one row. */
const MIN_CELLS = 4;

/** `list` with the item at `from` moved to `to`. */
function moved(list: readonly string[], from: number, to: number): string[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

// The gallery's edits as operations, and the two questions' state.
function useGalleryEdits({ block, onApply, describe }: EditorFor<"gallery">) {
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<string | null>(null);
  const refocus = useRefocus();
  const setIds = (mediaIds: string[]): EditOperation => ({
    op: "set_field",
    target: { kind: "block", blockId: block.id },
    path: "mediaIds",
    value: mediaIds,
  });
  const without = (id: string) => setIds(block.mediaIds.filter((other) => other !== id));
  return {
    adding,
    setAdding,
    toRemove,
    setToRemove,
    without,
    pick: (slot: number, mediaId: string) =>
      onApply({ op: "replace_image", blockId: block.id, mediaId, slot }),
    move: (index: number, direction: "left" | "right") => {
      const id = block.mediaIds[index];
      if (id === undefined) return;
      refocus(moveId(block.id, id, direction));
      onApply(setIds(moved(block.mediaIds, index, direction === "left" ? index - 1 : index + 1)));
    },
    add: (ids: string[]) => onApply(setIds([...block.mediaIds, ...ids])),
    askRemove: (id: string) => {
      if (describe(without(id)).destructive) setToRemove(id);
      else onApply(without(id));
    },
  };
}

type Edits = ReturnType<typeof useGalleryEdits>;

interface QuestionsProps extends Pick<
  EditorFor<"gallery">,
  "block" | "assets" | "onApply" | "describe"
> {
  edits: Edits;
}

// The multi-pick over the library (without the photos already placed), and the ask-first
// before a photo comes off the page.
function GalleryQuestions({ block, assets, onApply, describe, edits }: QuestionsProps) {
  const { adding, setAdding, toRemove, setToRemove, without } = edits;
  return (
    <>
      {adding ? (
        <MediaPicker
          assets={assets}
          kind="photo"
          multiple
          title="Add photos"
          exclude={block.mediaIds}
          onCancel={() => setAdding(false)}
          onPick={(ids) => {
            setAdding(false);
            edits.add(ids);
          }}
        />
      ) : null}
      {toRemove === null ? null : (
        <ConfirmEdit
          question="Remove this photo from the gallery?"
          description={describe(without(toRemove))}
          confirmLabel="Remove"
          onKeep={() => setToRemove(null)}
          onConfirm={() => {
            setToRemove(null);
            onApply(without(toRemove));
          }}
        />
      )}
    </>
  );
}

interface CellsProps extends Pick<EditorFor<"gallery">, "block" | "assets" | "onApply"> {
  edits: Edits;
  enhancing: Enhancing;
}

// The placed photos, each with its controls and its enhance chip, then the pickable
// slot, then the padding that keeps an empty gallery one row tall.
function GalleryCells({ block, assets, onApply, edits, enhancing }: CellsProps) {
  const count = block.mediaIds.length;
  const padding = useTouch() ? 0 : Math.max(0, MIN_CELLS - count - 1);
  return (
    <ul className="grid grid-cols-2 gap-8 wide:grid-cols-4">
      {block.mediaIds.map((mediaId, index) => (
        <GalleryCell
          key={mediaId}
          block={block}
          assets={assets}
          mediaId={mediaId}
          index={index}
          onPick={(id) => edits.pick(index, id)}
          onMove={(direction) => edits.move(index, direction)}
          onRemove={() => edits.askRemove(mediaId)}
          enhance={enhancing.actionFor(mediaId, { blockId: block.id, slot: index }, onApply)}
        />
      ))}
      <li>
        <PhotoSlot
          mediaId={null}
          assets={assets}
          kind="photo"
          aspect="square"
          mergedPick
          onPick={(id) => edits.pick(count, id)}
        />
      </li>
      {Array.from({ length: padding }, (_, i) => (
        <li key={`pad-${i}`} aria-hidden="true">
          <StripedPlaceholder label="drop a photo" aspect="square" />
        </li>
      ))}
    </ul>
  );
}

/** The gallery's editor. */
export function GalleryEditor(props: EditorFor<"gallery">) {
  const { block, assets, onApply } = props;
  const edits = useGalleryEdits(props);
  const enhancing = useEnhance(assets, props.onEnhance);
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      actions={[{ label: "add photos", onClick: () => edits.setAdding(true) }]}
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <GalleryCells
        block={block}
        assets={assets}
        onApply={onApply}
        edits={edits}
        enhancing={enhancing}
      />
      <GalleryQuestions
        block={block}
        assets={assets}
        onApply={onApply}
        describe={props.describe}
        edits={edits}
      />
      <OpenEnhanceCompare enhancing={enhancing} describe={props.describe} onApply={onApply} />
    </BlockShell>
  );
}

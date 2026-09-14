"use client";
import { useId, useRef } from "react";
import { OpenEnhanceCompare } from "../EnhanceCompare";
import { useOpenEditor } from "../open-editor";
import { PhotoSlot, slotFace, type PhotoSlotHandle } from "../PhotoSlot";
import { useEnhance } from "../use-enhance";
import { useRefocus } from "../use-refocus";
import { BlockShell, type ShellAction } from "./BlockShell";
import type { EditorFor } from "./editor-props";

// The hero (hi-fi 3a; FR-016; F1): the full-bleed photo with the cat's name set in the
// display face over the scrim — the one section that already carries content. Mandatory
// and fixed at the top of every profile: its frame is `fixed` — `replace photo` and (F39)
// `focal point` once a photo is placed, and (T045) `enhance` / `revert to original` are
// its label-row actions, no `duplicate` and no `remove` (FR-021).

// The name in the builder is fixed at the comp's own size (F28 review #10, comp 3a: 52 /
// .86 / -.03em — `typeScale.heroCardName`), not the public page's hero size: a 196px name
// would not fit a canvas frame, and the comp sets its own fixed value here rather than the
// public clamp. Over a photo it is white on the scrim (DESIGN.md §1: never alpha-faded ink
// on a photo); over the stripes it is ink, and the slot's own controls stay reachable
// underneath.
function NameOverlay({ name, onPhoto }: { name: string; onPhoto: boolean }) {
  const ground = onPhoto ? "bg-linear-to-b from-transparent from-40% to-night/80" : "";
  return (
    <div className={`pointer-events-none absolute inset-0 flex items-end p-20 ${ground}`}>
      <p className={`font-display text-hero-card-name ${onPhoto ? "text-card" : "text-ink"}`}>
        {name}
      </p>
    </div>
  );
}

/**
 * The hero's editor: the slot, the name, and on the label row `replace photo`, then —
 * with a photo in the slot and a library to ask (F39) — `focal point`, which opens the
 * library's sheet over this very photo (the modal hands focus back here when it
 * closes), then `enhance`.
 */
export function HeroEditor(props: EditorFor<"hero">) {
  const { block, assets, catName, onApply } = props;
  const slot = useRef<PhotoSlotHandle>(null);
  const replaceId = useId();
  const refocus = useRefocus();
  const openEditor = useOpenEditor();
  const enhancing = useEnhance(assets, props.onEnhance);
  const enhance = enhancing.actionFor(block.mediaId, { blockId: block.id }, onApply);
  const onPhoto = slotFace(block.mediaId, assets).kind === "image";
  const { mediaId } = block;
  const focal: ShellAction[] =
    onPhoto && openEditor !== null && mediaId !== null
      ? [{ label: "focal point", onClick: () => openEditor("focal", mediaId) }]
      : [];
  // F55 (S1): nothing to replace while the slot is empty — the face's own `Pick a photo`
  // / `Add a photo` is the one way in. Once a photo lands the row grows `replace photo`,
  // and `onFilledFocus` still finds it by id after that render.
  const actions: ShellAction[] = [
    ...(mediaId === null
      ? []
      : [{ id: replaceId, label: "replace photo", onClick: () => slot.current?.open() }]),
    ...focal,
    ...(enhance === null ? [] : [enhance]),
  ];
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      actions={actions}
      fixed
      flush
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <PhotoSlot
        ref={slot}
        mediaId={block.mediaId}
        assets={assets}
        kind="photo"
        radius="editorial"
        replaceOnSlot={false}
        priority
        onFilledFocus={() => refocus(replaceId)}
        onPick={(mediaId) => onApply({ op: "replace_image", blockId: block.id, mediaId })}
      >
        <NameOverlay name={catName} onPhoto={onPhoto} />
      </PhotoSlot>
      <OpenEnhanceCompare enhancing={enhancing} describe={props.describe} onApply={onApply} />
    </BlockShell>
  );
}

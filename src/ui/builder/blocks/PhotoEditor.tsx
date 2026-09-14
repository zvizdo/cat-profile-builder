"use client";
import { FIELD_LIMITS } from "@/core/profile/schema";
import { OpenEnhanceCompare } from "../EnhanceCompare";
import { PhotoSlot } from "../PhotoSlot";
import { useEnhance } from "../use-enhance";
import { BlockShell } from "./BlockShell";
import { DraftField } from "./DraftField";
import type { EditorFor } from "./editor-props";

// The photo section (FR-016): one slot and an optional caption under it, as the public
// page sets a caption beneath a photo. The caption is `set_field caption`. `enhance` /
// `revert to original` (T045) sit on the label row, as on the hero.

/** The photo section's editor. */
export function PhotoEditor(props: EditorFor<"photo">) {
  const { block, assets, onApply } = props;
  const enhancing = useEnhance(assets, props.onEnhance);
  const enhance = enhancing.actionFor(block.mediaId, { blockId: block.id }, onApply);
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      actions={enhance === null ? [] : [enhance]}
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <div className="flex flex-col gap-16">
        <PhotoSlot
          mediaId={block.mediaId}
          assets={assets}
          kind="photo"
          onPick={(mediaId) => onApply({ op: "replace_image", blockId: block.id, mediaId })}
        />
        <DraftField
          label="Caption"
          value={block.caption ?? ""}
          maxLength={FIELD_LIMITS.caption}
          placeholder="Optional — one line under the photo"
          onCommit={(value) =>
            onApply({
              op: "set_field",
              target: { kind: "block", blockId: block.id },
              path: "caption",
              value,
            })
          }
        />
      </div>
      <OpenEnhanceCompare enhancing={enhancing} describe={props.describe} onApply={onApply} />
    </BlockShell>
  );
}

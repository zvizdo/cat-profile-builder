"use client";
import { FIELD_LIMITS, type Block } from "@/core/profile/schema";
import { OpenEnhanceCompare } from "../EnhanceCompare";
import { PhotoSlot } from "../PhotoSlot";
import { useEnhance, type Enhancing } from "../use-enhance";
import { BlockShell } from "./BlockShell";
import { CellAction } from "./CellAction";
import { DraftField } from "./DraftField";
import type { EditorFor } from "./editor-props";

// "A day in her life" (FR-016): exactly three scenes side by side, each a photo and one
// line under it, as the public page pins them in a scroll sequence. There is no way to
// add or remove a scene — the schema holds three. A pick is `replace_image` with the
// scene's slot; a caption is `set_field scenes.N.caption`. T045: each scene carries
// `enhance` / `revert to original` in its own row under the slot, as a gallery cell does.

type Scene = Extract<Block, { type: "day" }>["scenes"][number];

/** The caption path of scene `index`, one of the three the grammar knows. */
function captionPath(index: number): "scenes.0.caption" | "scenes.1.caption" | "scenes.2.caption" {
  return index === 0 ? "scenes.0.caption" : index === 1 ? "scenes.1.caption" : "scenes.2.caption";
}

interface SceneProps extends Pick<EditorFor<"day">, "block" | "assets" | "onApply"> {
  scene: Scene;
  index: number;
  enhancing: Enhancing;
}

function SceneEditor({ block, assets, onApply, scene, index, enhancing }: SceneProps) {
  const n = index + 1;
  return (
    <li className="flex flex-col gap-12">
      <PhotoSlot
        mediaId={scene.mediaId}
        assets={assets}
        kind="photo"
        aspect="square"
        slotName={`scene ${n}`}
        onPick={(mediaId) =>
          onApply({ op: "replace_image", blockId: block.id, mediaId, slot: index })
        }
      />
      <CellAction
        action={enhancing.actionFor(scene.mediaId, { blockId: block.id, slot: index }, onApply)}
      />
      <DraftField
        label={`Scene ${n} caption`}
        value={scene.caption}
        maxLength={FIELD_LIMITS.sceneCaption}
        placeholder="One line"
        onCommit={(value) =>
          onApply({
            op: "set_field",
            target: { kind: "block", blockId: block.id },
            path: captionPath(index),
            value,
          })
        }
      />
    </li>
  );
}

/** The day section's editor: three scenes, nothing to add or remove. */
export function DayEditor(props: EditorFor<"day">) {
  const { block, assets, onApply } = props;
  const enhancing = useEnhance(assets, props.onEnhance);
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <ol className="grid gap-12 md:grid-cols-3">
        {block.scenes.map((scene, index) => (
          <SceneEditor
            key={index}
            block={block}
            assets={assets}
            onApply={onApply}
            scene={scene}
            index={index}
            enhancing={enhancing}
          />
        ))}
      </ol>
      <OpenEnhanceCompare enhancing={enhancing} describe={props.describe} onApply={onApply} />
    </BlockShell>
  );
}

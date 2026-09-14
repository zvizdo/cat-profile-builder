import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { Description, EditOperation } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import type { EnhanceFn } from "../use-enhance";

// What every block editor is handed (T025): its block, the library's live records to draw
// slots from, and the ways out — every edit as an `EditOperation` through `onApply`, the
// core's sentence for one through `describe` (so a destructive edit can ask first in the
// same words the helper's card will use), the trim editor for a clip, the frame's own
// `duplicate` and `remove`, and (T038) a way to hand a request to the helper panel — the
// bio's `rewrite`/`shorten` chips are the first callers, but the field is on every editor
// like `catName` is, rather than special-cased only onto the one that uses it. No editor
// holds a rule about what the document may become.

export interface BlockEditorProps<B extends Block = Block> {
  block: B;
  /** The id of the frame's mono label, which names the frame's `region`. */
  labelId: string;
  assets: readonly AssetView[];
  /** The cat's display name, for the hero. */
  catName: string;
  onApply: (op: EditOperation, label?: string) => void;
  describe: (op: EditOperation) => Description;
  /** Opens T023's trim editor over the library for a clip. */
  onOpenTrim: (mediaId: string) => void;
  /** The library's `enhance` (T045): runs the recipe on a photo and hands back the new record. */
  onEnhance: EnhanceFn;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Sends `text` to the helper panel as the volunteer's next request (T038); a no-op
   * while the helper is locked or the panel isn't mounted. */
  onAskHelper: (text: string) => void;
}

/** The editor for one block type: the same props, narrowed to that block. */
export type EditorFor<T extends Block["type"]> = BlockEditorProps<Extract<Block, { type: T }>>;

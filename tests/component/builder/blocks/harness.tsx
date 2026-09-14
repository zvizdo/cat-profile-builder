import { act, useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { applyOperation, describeOperation, type EditOperation } from "@/core/profile/operations";
import type { Block, ProfileDocument } from "@/core/profile/schema";
import { BlockBody } from "@/ui/builder/BlockBody";
import { CatSexProvider } from "@/ui/builder/cat-sex";
import type { EnhanceFn } from "@/ui/builder/use-enhance";
import { block, DOC } from "../canvas-fixtures";

// One editor over a real document: every operation an editor dispatches is applied through
// the core, a refusal shows as an alert in the core's words, and the test sees the ops in
// order. `BlockBody` is the dispatcher, so it is covered by the same tests.

export interface EditorHarnessProps {
  /** The one block on the page. */
  block: Block;
  assets?: AssetView[];
  name?: string;
  /** The cat's recorded sex (F41), for the editors whose own copy carries a pronoun;
   * unset (the default) reads as "they", same as everywhere else. */
  sex?: ProfileDocument["sex"];
  /** Sees every operation the editor dispatches. */
  onApply?: (op: EditOperation) => void;
  onOpenTrim?: (mediaId: string) => void;
  /** The library's `enhance` (T045); by default a call that never lands. */
  onEnhance?: EnhanceFn;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onAskHelper?: (text: string) => void;
}

/** A hero to stand under a non-hero block under test (F1: every page has one, fixed at 0). */
const HARNESS_HERO_ID = "harnesheroaa";

const noop = () => undefined;

/** The editor's ways out, each a no-op unless the test listens (the enhance never lands). */
function waysOut(props: EditorHarnessProps) {
  return {
    onOpenTrim: props.onOpenTrim ?? noop,
    onEnhance: props.onEnhance ?? (() => Promise.resolve(false)),
    onDuplicate: props.onDuplicate ?? noop,
    onRemove: props.onRemove ?? noop,
    onAskHelper: props.onAskHelper ?? noop,
  };
}

/**
 * A page holding `block` — with a fixed empty hero ahead of it unless `block` is itself
 * the hero — wired to `applyOperation`; the notice renders as an alert.
 */
export function EditorHarness(props: EditorHarnessProps) {
  const { assets = [], name = "Charlotte", sex, onApply } = props;
  const blocks =
    props.block.type === "hero" ? [props.block] : [block("hero", HARNESS_HERO_ID), props.block];
  const [doc, setDoc] = useState<ProfileDocument>({ ...DOC, name, sex, blocks });
  const [notice, setNotice] = useState<string | null>(null);
  const current = doc.blocks.at(-1);
  if (current === undefined) throw new Error("the page lost its block");
  return (
    <CatSexProvider sex={doc.sex}>
      <BlockBody
        block={current}
        labelId="frame-label"
        assets={assets}
        catName={doc.name}
        onApply={(op) => {
          onApply?.(op);
          const result = applyOperation(doc, op, { assets, newBlockId: () => "baaaaaaaaaab" });
          if (result.ok) {
            setDoc(result.value);
            setNotice(null);
          } else setNotice(result.error.reason);
        }}
        describe={(op) => describeOperation(doc, op, assets)}
        {...waysOut(props)}
      />
      {notice === null ? null : <p role="alert">{notice}</p>}
    </CatSexProvider>
  );
}

export { block };

/** Lets a debounced editor flush its pending `set_field`. */
export async function settle(ms = 400): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

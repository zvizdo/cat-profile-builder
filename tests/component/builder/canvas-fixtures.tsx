import { useState } from "react";
import type { EditOperation } from "@/core/profile/operations";
import { applyOperation } from "@/core/profile/operations";
import type { Block, ProfileDocument } from "@/core/profile/schema";
import { Canvas, type CanvasProps } from "@/ui/builder/Canvas";
import { sequentialIds } from "../../fakes/id-source";

// A document with four empty sections and a canvas wired to the real `applyOperation`, so
// a test sees the order the core produces, not what a mock would say.

export function block(type: Block["type"], id: string): Block {
  switch (type) {
    case "hero":
    case "photo":
    case "video":
      return { id, type, mediaId: null };
    case "bio":
      return { id, type, content: { paragraphs: [] } };
    case "gallery":
      return { id, type, mediaIds: [] };
    case "quote":
      return { id, type, mediaId: null, text: "" };
    case "day":
      return {
        id,
        type,
        scenes: [
          { mediaId: null, caption: "" },
          { mediaId: null, caption: "" },
          { mediaId: null, caption: "" },
        ],
      };
    case "needs":
      return { id, type, cards: [{ title: "", text: "" }] };
  }
}

export const HERO = "heroaaaaaaaa";
export const BIO = "bioaaaaaaaaa";
export const GALLERY = "galleryaaaaa";
export const VIDEO = "videoaaaaaaa";

export const DOC: ProfileDocument = {
  schemaVersion: 1,
  id: "abcdefgh",
  name: "Charlotte",
  blocks: [
    block("hero", HERO),
    block("bio", BIO),
    block("gallery", GALLERY),
    block("video", VIDEO),
  ],
  theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
  updatedAt: "2026-09-10T12:00:00.000Z",
};

export interface HarnessProps extends Partial<Omit<CanvasProps, "doc" | "onApply">> {
  initial?: ProfileDocument;
  /** Sees every operation the canvas dispatches, in order. */
  onApply?: (op: EditOperation) => void;
}

/** The canvas over a real document: every dispatched operation is applied through the core. */
export function CanvasHarness({ initial = DOC, onApply, ...rest }: HarnessProps) {
  const [doc, setDoc] = useState(initial);
  const [ids] = useState(sequentialIds);
  return (
    <Canvas
      doc={doc}
      theme={doc.theme}
      assets={[]}
      onApply={(op) => {
        onApply?.(op);
        const result = applyOperation(doc, op, { assets: [], newBlockId: ids.blockId });
        if (result.ok) setDoc(result.value);
      }}
      onDuplicate={rest.onDuplicate ?? (() => undefined)}
      onOpenTrim={rest.onOpenTrim ?? (() => undefined)}
      onEnhance={rest.onEnhance ?? (() => Promise.resolve(false))}
      onAskHelper={rest.onAskHelper ?? (() => undefined)}
    />
  );
}

/** The type labels of the frames on the canvas, top to bottom. */
export function frameOrder(): string[] {
  return Array.from(document.querySelectorAll("[data-block-type]")).map(
    (node) => node.getAttribute("data-block-type") ?? "",
  );
}

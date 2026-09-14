"use client";
import { BioEditor } from "./blocks/BioEditor";
import { DayEditor } from "./blocks/DayEditor";
import type { BlockEditorProps } from "./blocks/editor-props";
import { GalleryEditor } from "./blocks/GalleryEditor";
import { HeroEditor } from "./blocks/HeroEditor";
import { NeedsEditor } from "./blocks/NeedsEditor";
import { PhotoEditor } from "./blocks/PhotoEditor";
import { QuoteEditor } from "./blocks/QuoteEditor";
import { VideoEditor } from "./blocks/VideoEditor";

// Which editor a section gets (T025): one per block type, each drawing the body and its
// own label-row actions inside `BlockShell`. The frame around it — handle, sortable,
// drop indicator — is `BlockFrame`'s.

/** The editor for `block`'s type, with the frame's props passed straight through. */
export function BlockBody(props: BlockEditorProps) {
  const { block } = props;
  switch (block.type) {
    case "hero":
      return <HeroEditor {...props} block={block} />;
    case "bio":
      return <BioEditor {...props} block={block} />;
    case "photo":
      return <PhotoEditor {...props} block={block} />;
    case "gallery":
      return <GalleryEditor {...props} block={block} />;
    case "video":
      return <VideoEditor {...props} block={block} />;
    case "day":
      return <DayEditor {...props} block={block} />;
    case "needs":
      return <NeedsEditor {...props} block={block} />;
    case "quote":
      return <QuoteEditor {...props} block={block} />;
  }
}

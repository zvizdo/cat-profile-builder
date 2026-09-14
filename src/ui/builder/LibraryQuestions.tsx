"use client";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { Modal } from "@/ui/shared/Modal";

// The two questions the library asks (CONTENT.md → Modals): remove this file, and we
// can't read that one. Escape is always the safe answer. Split from `MediaLibrary.tsx`
// (F45) so the library file stays about the grid and the card.

/** The unsupported-file question (CONTENT.md → Modals; the spec's formats, FR-008). */
const UNSUPPORTED = {
  title: "We can't read that file.",
  body: "Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.",
};

/** The remove question, naming the file (DESIGN.md rule 3). */
const REMOVE_BODY =
  "It comes out of the library. Sections using it will show an empty slot until you pick another photo.";

export interface LibraryQuestionsProps {
  toRemove: AssetView | null;
  unsupported: boolean;
  onKeep: () => void;
  onRemove: (asset: AssetView) => void;
  onClose: () => void;
  onChooseAnother: () => void;
}

/** The remove question while a removal is asked, and the unsupported-file question while a file was refused. */
export function LibraryQuestions(props: LibraryQuestionsProps) {
  const { toRemove, unsupported, onKeep, onRemove, onClose, onChooseAnother } = props;
  return (
    <>
      {toRemove === null ? null : (
        <Modal
          open
          title={`Remove ${toRemove.fileName}?`}
          body={REMOVE_BODY}
          safeAction={{ label: "Keep it", onClick: onKeep }}
          dangerAction={{ label: "Remove", destructive: true, onClick: () => onRemove(toRemove) }}
        />
      )}
      <Modal
        open={unsupported}
        title={UNSUPPORTED.title}
        body={UNSUPPORTED.body}
        safeAction={{ label: "Close", onClick: onClose }}
        dangerAction={{ label: "Choose another", onClick: onChooseAnother }}
      />
    </>
  );
}

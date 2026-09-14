"use client";
import { sectionLabel } from "@/core/profile/fields";
import { describeOperation, type MediaRef } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import { Modal } from "@/ui/shared/Modal";

// The remove-section question (CONTENT.md → Modals; DESIGN.md rule 3: every irreversible
// action names what it will remove). The consequence comes from `describeOperation`, so
// the modal and the helper's proposal card say the same thing about the same removal.

export interface RemoveQuestionProps {
  doc: ProfileDocument;
  assets: readonly MediaRef[];
  /** The block asked about; `null` renders nothing. */
  blockId: string | null;
  onKeep: () => void;
  onRemove: (blockId: string) => void;
}

/** The sentence after the first of a `describeOperation` summary: what the edit takes off the page. */
export function consequence(summary: string): string {
  const at = summary.indexOf(". ");
  return at === -1 ? summary : summary.slice(at + 2);
}

/**
 * `Remove the gallery?` with what leaves and that one undo brings it back; `Keep it` is
 * the safe answer and Escape. Nothing while `blockId` names no block on the page.
 */
export function RemoveQuestion({ doc, assets, blockId, onKeep, onRemove }: RemoveQuestionProps) {
  const block = doc.blocks.find((candidate) => candidate.id === blockId);
  if (block === undefined) return null;
  const summary = describeOperation(doc, { op: "remove_block", blockId: block.id }, assets).summary;
  return (
    <Modal
      open
      title={`Remove the ${sectionLabel(block.type, doc.sex)}?`}
      body={`${consequence(summary)} One undo brings the section back.`}
      safeAction={{ label: "Keep it", onClick: onKeep }}
      dangerAction={{
        label: "Remove section",
        destructive: true,
        onClick: () => onRemove(block.id),
      }}
    />
  );
}

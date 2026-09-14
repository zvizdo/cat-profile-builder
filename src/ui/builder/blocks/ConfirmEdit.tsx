"use client";
import type { Description } from "@/core/profile/operations";
import { Modal } from "@/ui/shared/Modal";
import { consequence } from "../RemoveQuestion";

// The ask-first question for a destructive edit inside a section (DESIGN.md rule 3;
// constitution VIII): a gallery photo or a written card coming off the page. The
// consequence is `describeOperation`'s own sentence, so the modal says what the helper's
// proposal card would say about the same edit, and one undo is always named.

export interface ConfirmEditProps {
  /** `Remove this photo from the gallery?` */
  question: string;
  description: Description;
  confirmLabel: string;
  onKeep: () => void;
  onConfirm: () => void;
}

/** A question in the core's words; `Keep it` is the safe answer and Escape. */
export function ConfirmEdit(props: ConfirmEditProps) {
  const { question, description, confirmLabel, onKeep, onConfirm } = props;
  return (
    <Modal
      open
      title={question}
      body={`${consequence(description.summary)} One undo brings it back.`}
      safeAction={{ label: "Keep it", onClick: onKeep }}
      dangerAction={{ label: confirmLabel, destructive: true, onClick: onConfirm }}
    />
  );
}

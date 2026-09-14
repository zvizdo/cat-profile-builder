"use client";
import { Modal } from "@/ui/shared/Modal";

// The restore question (FR-024; quickstart §1 step 12), in CONTENT.md's voice: a mirror
// newer than the server's document is offered back. Restore is the safe action — it
// keeps everything, and one undo returns the server's copy — so it is the outline
// button and what Escape presses; Discard is what loses work, so it is clay.

/** CONTENT.md voice: the question, its one paragraph, and the two buttons. */
export const RESTORE_TITLE = "Restore unsaved changes?";
export const RESTORE_BODY =
  "This cat has edits saved on this device that never reached the server.";

export interface RestorePromptProps {
  open: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}

/** The modal over the builder while a newer mirror waits; nothing when there is none. */
export function RestorePrompt({ open, onRestore, onDiscard }: RestorePromptProps) {
  return (
    <Modal
      open={open}
      title={RESTORE_TITLE}
      body={RESTORE_BODY}
      safeAction={{ label: "Restore", onClick: onRestore }}
      dangerAction={{ label: "Discard", onClick: onDiscard, destructive: true }}
    />
  );
}

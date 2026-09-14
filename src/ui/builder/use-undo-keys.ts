import { useEffect } from "react";
import { isEditable, undoKey } from "./undo-keys";

// ⌘Z / Ctrl+Z and ⌘⇧Z / Ctrl+Y anywhere on the page but in a text field (FR-025), not
// while a question is open, and — F9 — not while the helper works: the reducer already
// refuses `undo`/`redo` then (T036), but the handler itself must not even dispatch.
// Shared by the full builder and the phone builder (F44), one listener each.

/** Binds the undo and redo keys on the document for as long as the caller is mounted. */
export function useUndoKeys(undo: () => void, redo: () => void, working: boolean): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        working ||
        isEditable(event.target) ||
        document.querySelector('[role="dialog"]') !== null
      ) {
        return;
      }
      const step = undoKey(event);
      if (step === null) return;
      event.preventDefault();
      if (step === "undo") undo();
      else redo();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, working]);
}

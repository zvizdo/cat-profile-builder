// ⌘Z / Ctrl+Z and ⌘⇧Z / Ctrl+Y (FR-025) as one pure decision, so the shell's key handler
// has nothing to reason about. A text field keeps its own history: while one has focus the
// shortcut is the browser's, not the page's (T025's editors bring their own undo).

/** The parts of a key event the decision reads. */
export interface UndoKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** True for an input, a textarea or anything contenteditable — where the shortcut is not ours. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/** Which step `event` asks for: ⌘Z / Ctrl+Z undo, ⌘⇧Z / Ctrl+Shift+Z / Ctrl+Y redo, else none. */
export function undoKey(event: UndoKeyEvent): "undo" | "redo" | null {
  if (!event.metaKey && !event.ctrlKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey) return "redo";
  return null;
}

import { type ProfileDocument } from "./schema";

// Undo and redo for the page document (data-model.md → Builder session; FR-025, FR-036).
// Shared by manual and helper edits. Every function here is pure: it returns a new history
// and never touches the one it was given, so a reducer can hold it as state.

/** One undoable step: the document before it, the document after it, and a short label. */
export type Entry = {
  before: ProfileDocument;
  after: ProfileDocument;
  label: string;
};

/**
 * An entry still being written — everything the helper applies in one response (FR-036).
 * `after` is `null` until the first `appendToOpen`; an entry that is closed while still
 * `null` is dropped, since nothing changed.
 */
export type OpenEntry = {
  label: string;
  before: ProfileDocument;
  after: ProfileDocument | null;
};

/**
 * The undo history. `past` holds what can be undone, oldest first; `future` holds what was
 * undone and can be redone, next-to-redo last; `open` is the helper's in-progress entry.
 */
export type History = {
  past: Entry[];
  future: Entry[];
  open: OpenEntry | null;
};

/**
 * How many steps `past` keeps; the oldest is dropped past this. FR-025 sets no cap; this one
 * bounds memory for a long builder session (each entry holds two full documents).
 */
export const HISTORY_LIMIT = 100;

/** An empty history: nothing to undo, nothing to redo, nothing open. */
export function createHistory(): History {
  return { past: [], future: [], open: null };
}

/**
 * Records one finished step. A new step clears `future` — once something new happens, the
 * undone steps can no longer be replayed onto it. Any open entry is closed first, so a
 * manual edit during a helper response never lands inside the helper's step.
 */
export function record(h: History, entry: Entry): History {
  const closed = closeEntry(h);
  const past = [...closed.past, entry].slice(-HISTORY_LIMIT);
  return { past, future: [], open: null };
}

/**
 * Starts an open entry from `before` (the document as it stands when the response begins
 * applying edits). An entry already open is closed first.
 */
export function openEntry(h: History, label: string, before: ProfileDocument): History {
  const closed = closeEntry(h);
  return { ...closed, open: { label, before, after: null } };
}

/**
 * Sets the open entry's `after` to the latest document. Any number of appends fold into the
 * one entry; with nothing open the history is returned unchanged.
 */
export function appendToOpen(h: History, after: ProfileDocument): History {
  if (h.open === null) return h;
  return { ...h, open: { ...h.open, after } };
}

/**
 * Closes the open entry. If at least one append happened it becomes one recorded step
 * (`before` → the last `after`), clearing `future` like any record; otherwise nothing is
 * recorded. With nothing open the history is returned unchanged.
 */
export function closeEntry(h: History): History {
  if (h.open === null) return h;
  const { label, before, after } = h.open;
  if (after === null) return { ...h, open: null };
  const past = [...h.past, { before, after, label }].slice(-HISTORY_LIMIT);
  return { past, future: [], open: null };
}

/** True when there is a step to undo. An open entry does not count until it is closed. */
export function canUndo(h: History): boolean {
  return h.past.length > 0;
}

/** True when there is an undone step to redo. */
export function canRedo(h: History): boolean {
  return h.future.length > 0;
}

/**
 * Undoes the latest step: returns the new history and the document to show (the step's
 * `before`, exactly as recorded), or `null` when there is nothing to undo. Not expected
 * while an entry is open — the builder disables undo and redo during a helper response
 * (T036); the open entry is carried along untouched if it is called anyway.
 */
export function undo(h: History): { h: History; doc: ProfileDocument } | null {
  const entry = h.past.at(-1);
  if (entry === undefined) return null;
  return {
    h: { ...h, past: h.past.slice(0, -1), future: [...h.future, entry] },
    doc: entry.before,
  };
}

/**
 * Redoes the most recently undone step: returns the new history and the document to show
 * (the step's `after`), or `null` when there is nothing to redo. Like `undo`, not expected
 * while an entry is open.
 */
export function redo(h: History): { h: History; doc: ProfileDocument } | null {
  const entry = h.future.at(-1);
  if (entry === undefined) return null;
  return {
    h: { ...h, past: [...h.past, entry], future: h.future.slice(0, -1) },
    doc: entry.after,
  };
}

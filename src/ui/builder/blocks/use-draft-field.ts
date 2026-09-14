import { useEffect, useRef, useState } from "react";

// A text field over one document text (T025): the volunteer's keystrokes land in a local
// draft, and the draft becomes one edit — one history entry, one autosave touch — when the
// typing pauses, when Enter is pressed, or when the field is left. The draft remembers
// which document value it was typed over, so a value that changes from outside (undo,
// the helper) shows at once and a stale draft is never sent. The document itself changes
// only through the `commit` the caller wires to `apply`.

/** How long the typing must pause before the draft is committed. */
export const DRAFT_PAUSE_MS = 300;

export interface DraftField {
  value: string;
  onChange: (value: string) => void;
  /** Commits at once; wired to blur and Enter. */
  flush: () => void;
}

/** What has been typed, and the document value it was typed over. */
interface Draft {
  base: string;
  text: string;
}

/**
 * The draft of `committed`: `onChange` schedules a commit after the pause; `flush` commits
 * now and ends the draft either way; nothing is committed while the draft equals what the
 * document holds, or once the document has moved on from the value the draft was typed
 * over. With no draft pending the field always shows the document's value.
 */
export function useDraftField(committed: string, commit: (value: string) => void): DraftField {
  const [draft, setDraft] = useState<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the handlers below read: the render's latest, written once it has landed.
  const latest = useRef({ committed, commit, draft });
  useEffect(() => {
    latest.current = { committed, commit, draft };
  });

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  // A flush always ends the draft: the words are sent when they are new and typed over
  // the value the document still holds; otherwise the document has moved on (undo, the
  // helper) and the field goes back to showing it.
  const flush = () => {
    cancel();
    const { committed: current, commit: send, draft: typed } = latest.current;
    latest.current = { ...latest.current, draft: null };
    setDraft(null);
    if (typed !== null && typed.base === current && typed.text !== current) send(typed.text);
  };

  useEffect(() => cancel, []);

  const live = draft !== null && draft.base === committed;
  return {
    value: live ? draft.text : committed,
    onChange: (next) => {
      const typed = { base: committed, text: next };
      setDraft(typed);
      latest.current = { ...latest.current, draft: typed };
      cancel();
      timer.current = setTimeout(flush, DRAFT_PAUSE_MS);
    },
    flush,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { PublishActionInput, PublishActionResult } from "@/app/actions/_lib/publishing";
import type { MediaAsset } from "@/core/media/schema";
import type { ProfileState } from "@/core/ports";
import type { ProfileDocument } from "@/core/profile/schema";
import { checkReadiness, readinessTargets, type ReadinessProblem } from "@/core/profile/readiness";
import { restoreToPassing } from "@/core/profile/theme";
import type { DocumentSession } from "./use-document";

// The publishing state of the builder (FR-056, FR-058, FR-060, FR-031, FR-086, FR-087):
// where the cat stands, the readiness panel, the one open question, the one toast. Every
// change goes through a Server Action; the document itself is touched only by `Restore to
// passing`, which is one recorded `set_theme` like any edit. Publish sends the pending
// draft first, so the copy that goes live is the copy on the screen.

/** The four Server Actions, injected so a test can fake them. */
export interface PublishingActions {
  publish: (input: PublishActionInput) => Promise<PublishActionResult>;
  unpublish: (input: PublishActionInput) => Promise<ActionResult<Record<never, never>>>;
  archive: (input: PublishActionInput) => Promise<ActionResult<Record<never, never>>>;
  restore: (input: PublishActionInput) => Promise<ActionResult<{ url: string }>>;
}

/** Where the cat stands and, while a published copy exists, its address. */
export interface Publication {
  state: ProfileState;
  url: string | null;
}

/** The one question that can be open: the contrast warning, or a confirmation. */
export type PublishQuestion =
  { kind: "contrast"; warning: string } | { kind: "unpublish" } | { kind: "archive" };

/** The one toast that can show. */
export type PublishToast =
  { kind: "live"; url: string } | { kind: "unpublished" } | { kind: "error"; message: string };

export interface Publishing {
  publication: Publication;
  /** A call is on its way; the button waits. */
  busy: boolean;
  /**
   * What is still missing, addressed for the canvas, while the panel is open — re-read
   * from the live document, so a fixed item disappears; `null` when the panel is closed
   * or nothing is missing any more.
   */
  problems: ReadinessProblem[] | null;
  /** Changes on every refusal: the panel reveals the first gap when it does. */
  refusals: number;
  question: PublishQuestion | null;
  toast: PublishToast | null;
  /** The Publish button: asks about contrast first when the text fails, else publishes. */
  publish: () => void;
  /** The contrast question's two answers. */
  publishAnyway: () => void;
  restoreAndPublish: () => void;
  ask: (question: "unpublish" | "archive") => void;
  keep: () => void;
  /** The confirmations' other answer, and the archived cat's way back. */
  unpublish: () => void;
  archive: () => void;
  restore: () => void;
  /** The unpublished toast's Undo: publishes again. */
  undoUnpublish: () => void;
  dismissProblems: () => void;
  dismissToast: () => void;
}

/** TOKENS.json `toast.autoDismissMs`: success toasts go away by themselves. */
export const TOAST_MS = 6000;

interface Options {
  session: DocumentSession;
  assets: readonly MediaAsset[];
  initial: Publication;
  actions: PublishingActions;
}

// The panel (as a count of refusals, `0` closed), the question and the toast; a success
// toast goes away by itself.
function useNotices() {
  const [busy, setBusy] = useState(false);
  const [refusals, setRefusals] = useState(0);
  const [question, setQuestion] = useState<PublishQuestion | null>(null);
  const [toast, setToast] = useState<PublishToast | null>(null);
  useEffect(() => {
    if (toast === null || toast.kind === "error") return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  return { busy, setBusy, refusals, setRefusals, question, setQuestion, toast, setToast };
}

type Notices = ReturnType<typeof useNotices>;

// The publish call: the pending draft first, then the action; a refusal opens the panel.
function usePublishCall(options: Options, notices: Notices, setPublication: SetPublication) {
  const { session, actions } = options;
  const { setBusy, setQuestion, setRefusals, setToast } = notices;
  const id = session.state.doc.id;
  return useCallback(async () => {
    setBusy(true);
    setQuestion(null);
    const saved = await session.flush();
    if (saved !== null && !saved.ok) {
      setToast({ kind: "error", message: saved.message });
    } else {
      const result = await actions.publish({ id });
      if (result.ok) {
        setRefusals(0);
        setPublication({ state: "live", url: result.url });
        setToast({ kind: "live", url: result.url });
      } else if ("problems" in result) {
        setRefusals((count) => count + 1);
      } else {
        setToast({ kind: "error", message: result.error.message });
      }
    }
    setBusy(false);
  }, [session, actions, id, setBusy, setQuestion, setRefusals, setToast, setPublication]);
}

type SetPublication = (next: Publication | ((prior: Publication) => Publication)) => void;

/** One state change through an action: on ok `next` moves the state, else the sentence shows. */
type Change = <T extends object>(
  call: () => Promise<ActionResult<T>>,
  next: (result: T) => void,
) => Promise<void>;

interface Moves {
  id: string;
  actions: PublishingActions;
  change: Change;
  setPublication: SetPublication;
  setToast: Notices["setToast"];
}

// The three moves between states, each one action and the state it leaves behind.
function movesOf({ id, actions, change, setPublication, setToast }: Moves) {
  return {
    unpublish: () =>
      void change(
        () => actions.unpublish({ id }),
        () => {
          setPublication({ state: "draft", url: null });
          setToast({ kind: "unpublished" });
        },
      ),
    archive: () =>
      void change(
        () => actions.archive({ id }),
        () => setPublication((prior) => ({ ...prior, state: "archived" })),
      ),
    restore: () =>
      void change(
        () => actions.restore({ id }),
        ({ url }) => {
          setPublication({ state: "live", url });
          setToast({ kind: "live", url });
        },
      ),
  };
}

// `Restore to passing` is an edit; the publish that follows waits one render, until the
// autosave has seen the new document, so the flush sends the restored theme.
function usePublishAfterEdit(doc: ProfileDocument, run: () => Promise<void>) {
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    void run();
  }, [doc, run]);
  return pending;
}

// The server refuses; the live document says what is still missing. Once nothing is,
// the panel goes.
function useLiveProblems(
  refusals: number,
  session: DocumentSession,
  assets: readonly MediaAsset[],
) {
  return useMemo(() => {
    if (refusals === 0) return null;
    const live = readinessTargets(session.state.doc, assets).problems;
    return live.length === 0 ? null : live;
  }, [refusals, session.state.doc, assets]);
}

export function usePublishing(options: Options): Publishing {
  const { session, assets, actions } = options;
  const [publication, setPublication] = useState(options.initial);
  const notices = useNotices();
  const { busy, refusals, setBusy, setQuestion, setToast } = notices;
  const run = usePublishCall(options, notices, setPublication);
  const id = session.state.doc.id;
  const problems = useLiveProblems(refusals, session, assets);
  const publishAfterEditRef = usePublishAfterEdit(session.state.doc, run);

  const change: Change = async (call, next) => {
    setBusy(true);
    setQuestion(null);
    const result = await call();
    if (result.ok) next(result);
    else setToast({ kind: "error", message: result.error.message });
    setBusy(false);
  };

  return {
    ...movesOf({ id, actions, change, setPublication, setToast }),
    publication,
    busy,
    problems,
    refusals,
    question: notices.question,
    toast: notices.toast,
    publish: () => {
      if (busy) return;
      const readiness = checkReadiness(session.state.doc, assets);
      const warning = readiness.warnings[0];
      if (readiness.problems.length === 0 && warning !== undefined) {
        setQuestion({ kind: "contrast", warning });
      } else {
        void run();
      }
    },
    publishAnyway: () => void run(),
    restoreAndPublish: () => {
      publishAfterEditRef.current = true;
      session.apply({ op: "set_theme", ...restoreToPassing(session.state.doc.theme) });
    },
    ask: (kind) => setQuestion({ kind }),
    keep: () => setQuestion(null),
    undoUnpublish: () => void run(),
    dismissProblems: () => notices.setRefusals(0),
    dismissToast: () => setToast(null),
  };
}

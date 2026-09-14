import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
} from "react";
import { randomIds } from "@/adapters/ids";
import {
  createHelperState,
  helperReducer,
  type HelperAction,
  type HelperState,
  type HelperSurface,
} from "@/core/helper/reducer";
import type { MediaAsset } from "@/core/media/schema";
import type { IdSource } from "@/core/ports";
import { sectionLabel } from "@/core/profile/fields";
import {
  createHistory,
  canRedo,
  canUndo,
  record,
  redo,
  undo,
  type History,
} from "@/core/profile/history";
import {
  applyOperation,
  BlockInputSchema,
  describeOperation,
  type BlockInput,
  type EditOperation,
  type MediaRef,
} from "@/core/profile/operations";
import type { Block, ProfileDocument } from "@/core/profile/schema";
import { createAutosave, sendDraft, type SendResult } from "./autosave";
import {
  browserStorage,
  clearMirror,
  mirrorApplies,
  readMirror,
  writeMirror,
} from "./offline-mirror";
import { useSurface } from "./use-surface";

// The builder session (data-model.md → Builder session; FR-021, FR-023, FR-024, FR-025):
// the working document, its undo history and the save state, changed only by the actions
// below. Every manual edit is an `EditOperation` through `applyOperation` then `record` —
// the same path the helper takes in T036 — so a component never touches `doc.blocks`.
// Every document the session holds is also mirrored to the browser's storage, so a tab
// closed while offline can offer its edits back when the cat is next opened.

/** The history entry a restored mirror makes. */
const RESTORE_LABEL = "Restore unsaved changes.";

/** Where the draft stands against the server. `error` keeps the local copy (FR-027). */
export type SaveState =
  | { status: "saved"; savedAt: string }
  | { status: "saving" }
  | { status: "dirty" }
  | { status: "error"; message: string };

/**
 * The helper's own slice of `HelperState` (T036 controller ruling 1): everything
 * `helperReducer` holds beyond `doc` and `history`, which this session already carries at
 * its own top level — one document, one history, so a helper turn and a manual edit can
 * never record two competing pasts. `assets` here is the helper's own narrowed view (only
 * `status: "ready"` media, as `createHelperState`/`handleMediaChanged` build it) — a
 * different list from `DocumentState.assets` below, which is every asset regardless of
 * status and is what manual edits validate against. Keeping the two separate, rather than
 * forcing one `assets` field to serve both call sites, is deliberate: the model may only
 * ever place media that is actually ready, exactly as the standalone `helperReducer` (T032)
 * is already tested to enforce, and this composition must not weaken that.
 */
export type HelperSlice = Omit<HelperState, "doc" | "history">;

/** What the reducer holds: the document, its history, the media it may name, the save state. */
export interface DocumentState {
  doc: ProfileDocument;
  history: History;
  assets: readonly MediaRef[];
  save: SaveState;
  /** The reason an edit was refused, to show once; `null` when there is none. */
  notice: string | null;
  /** A mirrored document the server never saw, waiting to be restored or discarded. */
  offer: ProfileDocument | null;
  /** The server `updatedAt` the working document grew from: the open, or the last save that landed. */
  basedOn: string;
  /** The AI helper's status, surface and in-progress turn (T036), over this same doc/history. */
  helper: HelperSlice;
}

/** Everything that can happen to the session. `newBlockId` is passed in so the reducer stays pure. */
export type DocumentAction =
  | { type: "apply"; op: EditOperation; label: string; newBlockId: () => string }
  | { type: "duplicate"; blockId: string; newBlockId: () => string }
  | { type: "offer"; doc: ProfileDocument }
  | { type: "restore" }
  | { type: "discard" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saving" }
  | { type: "saved"; updatedAt: string; doc: ProfileDocument }
  | { type: "saveFailed"; message: string }
  | { type: "clearNotice" }
  | { type: "notice"; message: string }
  | { type: "assets"; assets: readonly MediaRef[] }
  // The AI helper's own actions (contracts/helper-protocol.md → "Client state"), forwarded
  // to `helperReducer` by `reduce` below. `helperMediaChanged` carries the *raw* asset list
  // (status and all) since only `handleMediaChanged` needs it, to decide locked/ready and
  // to narrow `helper.assets`; everywhere else in this file `MediaRef` is enough.
  | { type: "helperMediaChanged"; assets: readonly MediaAsset[] }
  | { type: "helperSurface"; surface: HelperSurface }
  | { type: "helperSend" }
  | { type: "helperToolCall"; toolCallId: string; op: EditOperation; newBlockId: () => string }
  | { type: "helperCardResolved"; toolCallId: string; choice: "apply" | "decline" }
  | ({ type: "helperStreamEnded" } & ({ finishReason: string } | { error: string }));

/** The session as the builder opens: nothing to undo, saved as of the document's own stamp. */
export function createDocumentState(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
  surface: HelperSurface = "full",
): DocumentState {
  const helperState = createHelperState(doc, assets, surface);
  return {
    doc,
    history: createHistory(),
    assets,
    save: { status: "saved", savedAt: doc.updatedAt },
    notice: null,
    offer: null,
    basedOn: doc.updatedAt,
    helper: {
      assets: helperState.assets,
      status: helperState.status,
      surface: helperState.surface,
      turn: helperState.turn,
    },
  };
}

/** `state` packed as the `HelperState` `helperReducer` and `resolveToolCall` expect. */
export function helperStateOf(state: DocumentState): HelperState {
  return { doc: state.doc, history: state.history, ...state.helper };
}

/** `state` with a `helperReducer` result folded back in: the doc/history move together,
 * a document change marks the session dirty exactly as a manual edit does, and the
 * helper's own slice is replaced whole. */
function withHelperResult(state: DocumentState, result: HelperState): DocumentState {
  const save = result.doc !== state.doc ? ({ status: "dirty" } as const) : state.save;
  return {
    ...state,
    doc: result.doc,
    history: result.history,
    helper: {
      assets: result.assets,
      status: result.status,
      surface: result.surface,
      turn: result.turn,
    },
    save,
  };
}

/** The `helper*` actions `helperReducer` actually resolves — `helperSurface` moves the
 * session's own field directly (below), since no `HelperAction` carries a surface alone. */
type DelegatedHelperAction = Exclude<
  Extract<DocumentAction, { type: `helper${string}` }>,
  { type: "helperSurface" }
>;

/** `action` as the `HelperAction` it forwards to `helperReducer`. */
function toHelperAction(action: DelegatedHelperAction): HelperAction {
  switch (action.type) {
    case "helperMediaChanged":
      return { type: "mediaChanged", assets: action.assets };
    case "helperSend":
      return { type: "send" };
    case "helperToolCall":
      return {
        type: "toolCall",
        toolCallId: action.toolCallId,
        op: action.op,
        newBlockId: action.newBlockId,
      };
    case "helperCardResolved":
      return { type: "cardResolved", toolCallId: action.toolCallId, choice: action.choice };
    case "helperStreamEnded":
      return "error" in action
        ? { type: "streamEnded", error: action.error }
        : { type: "streamEnded", finishReason: action.finishReason };
  }
}

function applyEdit(
  state: DocumentState,
  op: EditOperation,
  label: string,
  newBlockId: () => string,
): DocumentState {
  const result = applyOperation(state.doc, op, { assets: state.assets, newBlockId });
  if (!result.ok) return { ...state, notice: result.error.reason };
  const entry = { before: state.doc, after: result.value, label };
  return {
    ...state,
    doc: result.value,
    history: record(state.history, entry),
    save: { status: "dirty" },
    notice: null,
  };
}

/** `block` without its id, parsed as the input `add_block` takes for a copy. */
function inputOf(block: Block): BlockInput {
  return BlockInputSchema.parse(
    Object.fromEntries(Object.entries(block).filter(([key]) => key !== "id")),
  );
}

// A copy right after the original with a fresh id — one `add_block`, never a separate
// operation (data-model.md), and never for the hero (FR-021).
function duplicate(state: DocumentState, blockId: string, newBlockId: () => string) {
  const index = state.doc.blocks.findIndex((block) => block.id === blockId);
  const block = state.doc.blocks[index];
  if (block === undefined || block.type === "hero") return state;
  const op: EditOperation = { op: "add_block", block: inputOf(block), index: index + 1 };
  const label = `Duplicate the ${sectionLabel(block.type, state.doc.sex)}.`;
  return applyEdit(state, op, label, newBlockId);
}

// The offered mirror takes the place of the server's document as one entry, so one undo
// is the server's copy again; it is dirty because the server has never seen it.
function restore(state: DocumentState): DocumentState {
  if (state.offer === null) return state;
  const entry = { before: state.doc, after: state.offer, label: RESTORE_LABEL };
  return {
    ...state,
    doc: state.offer,
    history: record(state.history, entry),
    save: { status: "dirty" },
    notice: null,
    offer: null,
  };
}

// Any save that lands moves `basedOn`: the server now holds what was sent, which every
// later local change grew from. Only a save for the document still current is `saved`;
// one for an older document leaves the state dirty, since the newer one is about to go.
function saved(state: DocumentState, action: Extract<DocumentAction, { type: "saved" }>) {
  const based = { ...state, basedOn: action.updatedAt };
  if (action.doc !== state.doc) return based;
  return { ...based, save: { status: "saved" as const, savedAt: action.updatedAt } };
}

function step(state: DocumentState, move: typeof undo): DocumentState {
  const moved = move(state.history);
  if (moved === null) return state;
  return { ...state, doc: moved.doc, history: moved.h, save: { status: "dirty" }, notice: null };
}

/** The actions that move the save state, the notice, the offer or the assets, never the document. */
type StatusAction = Extract<
  DocumentAction,
  {
    type:
      | "saving"
      | "saved"
      | "saveFailed"
      | "clearNotice"
      | "notice"
      | "assets"
      | "offer"
      | "discard"
      | "helperSurface";
  }
>;

// The save actions move `save` (and `saved` moves `basedOn`); `offer` holds a mirrored
// document and `discard` drops it; `assets` takes the library's live list, so an upload
// made this session can be placed; `notice` is the one error toast, set from outside an
// edit (the topbar's Publish, refused while the helper works); `helperSurface` moves the
// helper's own `full`/`phone` field, which no `HelperAction` carries alone (T036).
function reduceStatus(state: DocumentState, action: StatusAction): DocumentState {
  switch (action.type) {
    case "saving":
      return { ...state, save: { status: "saving" } };
    case "saved":
      return saved(state, action);
    case "saveFailed":
      return { ...state, save: { status: "error", message: action.message } };
    case "clearNotice":
      return { ...state, notice: null };
    case "notice":
      return { ...state, notice: action.message };
    case "assets":
      return { ...state, assets: action.assets };
    case "offer":
      return { ...state, offer: action.doc };
    case "discard":
      return { ...state, offer: null };
    case "helperSurface":
      return { ...state, helper: { ...state.helper, surface: action.surface } };
  }
}

/** The volunteer's own moves: refused outright while `helper.status === "working"` (T036
 * controller ruling 1), so the helper's turn and a manual edit can never record two
 * competing history entries at once. */
type ManualAction = Extract<
  DocumentAction,
  { type: "apply" | "duplicate" | "restore" | "undo" | "redo" }
>;

function reduceManual(state: DocumentState, action: ManualAction): DocumentState {
  if (state.helper.status === "working") return state;
  switch (action.type) {
    case "apply":
      return applyEdit(state, action.op, action.label, action.newBlockId);
    case "duplicate":
      return duplicate(state, action.blockId, action.newBlockId);
    case "restore":
      return restore(state);
    case "undo":
      return step(state, undo);
    case "redo":
      return step(state, redo);
  }
}

/**
 * The pure reducer. Manual actions (`apply`, `duplicate`, `restore`, `undo`, `redo`) are
 * `reduceManual`'s; `helper*` actions are forwarded to `helperReducer` via
 * `toHelperAction` and folded back with `withHelperResult`; everything else is
 * `reduceStatus`'s. Unknown block ids, empty histories and an absent offer are no-ops
 * that return the same state.
 */
export function reduce(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case "apply":
    case "duplicate":
    case "restore":
    case "undo":
    case "redo":
      return reduceManual(state, action);
    case "helperMediaChanged":
    case "helperSend":
    case "helperToolCall":
    case "helperCardResolved":
    case "helperStreamEnded":
      return withHelperResult(state, helperReducer(helperStateOf(state), toHelperAction(action)));
    default:
      return reduceStatus(state, action);
  }
}

/** The AI helper's own dispatchers (T036): `use-helper.ts`'s one way to move `state.helper`. */
export interface HelperDispatch {
  send: () => void;
  /**
   * `newBlockId` defaults to the session's own id source; `use-helper.ts` (review round 1)
   * passes one it generated and cached itself instead, so the id an `add_block` gets here
   * is the exact same one its own synchronous `helperReducer` preview already used —
   * never a second, different random draw for the same tool call.
   */
  toolCall: (toolCallId: string, op: EditOperation, newBlockId?: () => string) => void;
  cardResolved: (toolCallId: string, choice: "apply" | "decline") => void;
  streamEnded: (outcome: { finishReason: string } | { error: string }) => void;
}

/** What `useDocument` hands the builder: the state and the ways to change it. */
export interface DocumentSession {
  state: DocumentState;
  canUndo: boolean;
  canRedo: boolean;
  /** One manual edit; the label is its history entry's name. Refused while the helper works. */
  apply: (op: EditOperation, label?: string) => void;
  duplicate: (blockId: string) => void;
  undo: () => void;
  redo: () => void;
  clearNotice: () => void;
  /** Sets the one error toast directly — the topbar's Publish, refused while the helper works. */
  notice: (message: string) => void;
  /** A save failed while the browser knew it was offline; clears on `online` or a save. */
  offline: boolean;
  /** Answers `state.offer`: restore puts the mirror in place; discard drops it and its copy. */
  restore: () => void;
  discard: () => void;
  /**
   * Sends any pending change now and settles once the server has answered: with that
   * send's outcome, or `null` when nothing was waiting. Publish calls it first, so the
   * copy it publishes is the one on the screen.
   */
  flush: () => Promise<SendResult | null>;
  /** The AI helper's own actions (T036), over this same document and history. */
  helper: HelperDispatch;
}

function initialise([doc, assets, surface]: [
  ProfileDocument,
  readonly MediaAsset[],
  HelperSurface,
]): DocumentState {
  return createDocumentState(doc, assets, surface);
}

// The autosave over `sendDraft`, reporting into the reducer with the document each
// send carried. A failure while the browser knows it is offline raises `offline`; the
// `online` event clears it and sends what is pending at once, on top of the backoff the
// failure armed.
function useAutosave(dispatch: Dispatch<DocumentAction>) {
  const [offline, setOffline] = useState(false);
  const [autosave] = useState(() =>
    createAutosave({
      send: sendDraft,
      onStart: () => dispatch({ type: "saving" }),
      onResult: (result: SendResult, doc: ProfileDocument) => {
        if (result.ok) setOffline(false);
        else if (!result.terminal && !navigator.onLine) setOffline(true);
        dispatch(
          result.ok
            ? { type: "saved", updatedAt: result.updatedAt, doc }
            : { type: "saveFailed", message: result.message },
        );
      },
    }),
  );

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      autosave.retry();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [autosave]);

  return { autosave, offline };
}

// The mirror around the session (FR-024). On open — after hydration, since the server
// has no storage — a mirror based on exactly the version the server holds, and saying
// something different, is offered; a stale or identical one is cleared; none is left
// alone. While the session has unsaved changes the mirror holds the working document and
// the version it grew from (`basedOn`); the save that lands for it clears the mirror. No
// clock is consulted: a browser clock behind the server's cannot lose an edit.
function useMirror(doc: ProfileDocument, state: DocumentState, dispatch: Dispatch<DocumentAction>) {
  const [storage] = useState(browserStorage);

  useEffect(() => {
    const mirror = readMirror(storage, doc.id);
    const standing = mirrorApplies(mirror, doc);
    if (standing === "applies" && mirror !== null) dispatch({ type: "offer", doc: mirror.doc });
    else if (standing !== "none") clearMirror(storage, doc.id);
  }, [storage, doc, dispatch]);

  // Anything this session has changed — an edit, an undo back to where it opened — is
  // mirrored until it is saved; an untouched history is the open itself, which the open
  // effect above has already judged.
  const touched = canUndo(state.history) || canRedo(state.history);
  useEffect(() => {
    if (!touched) return;
    if (state.save.status === "saved") clearMirror(storage, doc.id);
    else writeMirror(storage, state.doc, state.basedOn);
  }, [storage, doc.id, touched, state.doc, state.save, state.basedOn]);

  return {
    discard: () => {
      dispatch({ type: "discard" });
      clearMirror(storage, doc.id);
    },
  };
}

/** The AI helper's own dispatchers, memoised over the one thing they close over: `ids`. */
function useHelperDispatch(dispatch: Dispatch<DocumentAction>, ids: IdSource) {
  return useMemo<HelperDispatch>(
    () => ({
      send: () => dispatch({ type: "helperSend" }),
      toolCall: (toolCallId, op, newBlockId = ids.blockId) =>
        dispatch({ type: "helperToolCall", toolCallId, op, newBlockId }),
      cardResolved: (toolCallId, choice) =>
        dispatch({ type: "helperCardResolved", toolCallId, choice }),
      streamEnded: (outcome) => dispatch({ type: "helperStreamEnded", ...outcome }),
    }),
    [dispatch, ids],
  );
}

/**
 * Wires the reducer to the autosave and the mirror: every document change is `touch`ed
 * and mirrored at once, the send's outcome comes back as a save action, `pagehide`
 * flushes with `keepalive` so a closed tab loses nothing, and the `online` event sends
 * one retry (FR-024). Block ids come from `randomIds`, the same source the server uses.
 * An `apply` without a label is named by `describeOperation`. `assets` is the library's
 * live list — the full records, not just `MediaRef` (T036: the helper's own lock/ready
 * gate needs each asset's `status`) — so every change to it reaches the reducer and
 * ownership checks see this session's uploads and removals. `surface` (`use-surface.ts`)
 * is read here once per render and folded in as its own action, since it moves on a
 * window resize rather than a document change.
 */
export function useDocument(doc: ProfileDocument, assets: readonly MediaAsset[]): DocumentSession {
  const surface = useSurface();
  const [state, dispatch] = useReducer(reduce, [doc, assets, surface], initialise);
  useEffect(() => dispatch({ type: "assets", assets }), [assets]);
  useEffect(() => dispatch({ type: "helperMediaChanged", assets }), [assets]);
  useEffect(() => dispatch({ type: "helperSurface", surface }), [surface]);
  const [ids] = useState(randomIds);
  const { autosave, offline } = useAutosave(dispatch);
  const mirror = useMirror(doc, state, dispatch);
  const lastSent = useRef(doc);

  useEffect(() => {
    if (state.doc === lastSent.current) return;
    lastSent.current = state.doc;
    autosave.touch(state.doc);
  }, [state.doc, autosave]);

  // Leaving the page by any route — a closed tab, a link to the list, an unmount — sends
  // what is pending at once, so nothing waits on a debounce that will never fire.
  useEffect(() => {
    const flush = () => autosave.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [autosave]);

  const apply = useCallback(
    (op: EditOperation, label?: string) => {
      const name = label ?? describeOperation(state.doc, op, state.assets).summary;
      dispatch({ type: "apply", op, label: name, newBlockId: ids.blockId });
    },
    [state.doc, state.assets, ids],
  );

  const helper = useHelperDispatch(dispatch, ids);

  // Undo/Redo read as disabled the instant the helper starts working (T036 controller
  // ruling 1), not just refused on a click that already does nothing: the history itself
  // may still hold entries from before the turn began.
  const working = state.helper.status === "working";
  return {
    state,
    canUndo: !working && canUndo(state.history),
    canRedo: !working && canRedo(state.history),
    apply,
    duplicate: (blockId) => dispatch({ type: "duplicate", blockId, newBlockId: ids.blockId }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    clearNotice: () => dispatch({ type: "clearNotice" }),
    notice: (message) => dispatch({ type: "notice", message }),
    offline,
    restore: () => dispatch({ type: "restore" }),
    discard: mirror.discard,
    flush: autosave.flush,
    helper,
  };
}

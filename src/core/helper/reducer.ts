import type { MediaAsset } from "../media/schema";
import { PRESET_NAME } from "../profile/describe";
import { blockById, fieldLabel, sectionLabel } from "../profile/fields";
import {
  appendToOpen,
  closeEntry,
  createHistory,
  openEntry,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type History,
} from "../profile/history";
import {
  applyOperation,
  describeOperation,
  type EditOperation,
  type MediaRef,
} from "../profile/operations";
import type { ProfileDocument, Theme } from "../profile/schema";
import {
  createTurn,
  movedBlockId,
  targetOf,
  touchedBlockIds,
  turnSummary,
  type AppliedEdit,
  type ToolOutcome,
  type Turn,
  type TurnOutcome,
} from "./turn";

// The AI helper's client-side state (contracts/helper-protocol.md → "Client state"): the
// same document and undo history the manual builder edits (T009, T008), plus the helper's
// own three-state machine (locked / ready / working) and the in-progress turn. Every edit
// the helper applies or the volunteer resolves on a card goes through `applyOperation` and
// `describeOperation` — the one path every edit takes (Principle VIII) — so this reducer
// never re-implements validation or the "what changed" sentence; it only sequences them.
// The turn's own shape and the readers over it live in `turn.ts` (F34 review, finding 2);
// they are re-exported here so every caller keeps its one import.

export {
  cardResolution,
  cardTarget,
  currentRejection,
  failureSentence,
  taggedBlocks,
  turnClauses,
  turnGroups,
  turnStanding,
  turnSummary,
  type AppliedEdit,
  type CardResolution,
  type PendingCard,
  type ToolOutcome,
  type Turn,
  type TurnGroup,
  type TurnOutcome,
  type TurnStanding,
} from "./turn";

/** `locked`: no ready photo yet (FR-032). `working`: a response is streaming. */
export type HelperStatus = "locked" | "ready" | "working";

/** The two surfaces the helper runs on (FR-091); phone mode has no block editors. */
export type HelperSurface = "full" | "phone";

/** What the helper reducer holds. Field names and types match `DocumentState` (T036). */
export interface HelperState {
  doc: ProfileDocument;
  history: History;
  assets: readonly MediaRef[];
  status: HelperStatus;
  surface: HelperSurface;
  turn: Turn;
}

/** Everything that can happen to the helper session. `newBlockId` keeps the reducer pure. */
export type HelperAction =
  | { type: "mediaChanged"; assets: readonly MediaAsset[] }
  | { type: "send" }
  | { type: "toolCall"; toolCallId: string; op: EditOperation; newBlockId: () => string }
  | { type: "cardResolved"; toolCallId: string; choice: "apply" | "decline" }
  | ({ type: "streamEnded" } & ({ finishReason: string } | { error: string }))
  | { type: "manualEdit"; op: EditOperation; label: string; newBlockId: () => string }
  | { type: "undo" }
  | { type: "redo" };

/** The `MediaRef`s of the ready assets: what `applyOperation` and `describeOperation` see. */
function readyRefs(assets: readonly MediaAsset[]): readonly MediaRef[] {
  return assets
    .filter((asset) => asset.status === "ready")
    .map((asset) => ({ id: asset.id, kind: asset.kind, enhancement: asset.enhancement }));
}

/** A ready photo is what unlocks the helper (FR-032); a ready clip alone does not. */
function hasReadyPhoto(assets: readonly MediaRef[]): boolean {
  return assets.some((asset) => asset.kind === "photo");
}

/** The session as the helper panel first sees it: locked or ready, nothing yet in flight. */
export function createHelperState(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
  surface: HelperSurface,
): HelperState {
  const refs = readyRefs(assets);
  return {
    doc,
    history: createHistory(),
    assets: refs,
    status: hasReadyPhoto(refs) ? "ready" : "locked",
    surface,
    turn: createTurn(),
  };
}

/** `movedBlockId` (`turn.ts`) read into a section label, for a reorder's fragment. */
function movedBlockLabel(doc: ProfileDocument, order: readonly string[]): string {
  const movedId = movedBlockId(doc, order);
  const moved = movedId === undefined ? undefined : blockById(doc, movedId);
  return moved ? sectionLabel(moved.type, doc.sex) : "section";
}

/** The fragment for a theme change: named preset if one was set, otherwise just "theme". */
function themeFragment(preset: Theme["preset"] | undefined): Pick<AppliedEdit, "verb" | "label"> {
  return preset === undefined
    ? { verb: "changed", label: "theme" }
    : { verb: "set theme", label: PRESET_NAME[preset] };
}

/**
 * The verb and short label `turnSummary` folds this edit into, decided from `doc` — the
 * document immediately before the edit, so a removed or reordered block's type is still
 * there to read.
 */
function fragmentFor(doc: ProfileDocument, op: EditOperation): Pick<AppliedEdit, "verb" | "label"> {
  switch (op.op) {
    case "add_block":
      return { verb: "added", label: sectionLabel(op.block.type, doc.sex) };
    case "remove_block": {
      const block = blockById(doc, op.blockId);
      return { verb: "removed", label: block ? sectionLabel(block.type, doc.sex) : "section" };
    }
    case "reorder_blocks":
      return { verb: "moved", label: movedBlockLabel(doc, op.order) };
    case "set_field":
      return { verb: "changed", label: fieldLabel(op.path, doc.sex) };
    case "set_theme":
      return themeFragment(op.preset);
    case "replace_image":
      return { verb: "replaced", label: "photo" };
  }
}

/** `touched` with `target` appended, once — a block edited twice is followed twice but
 * listed once, so the return to "the first touched block" and the tags are per block. */
function withTouched(touched: readonly string[], target: string | null): readonly string[] {
  if (target === null || touched.includes(target)) return touched;
  return [...touched, target];
}

/** `h` with its open entry's label replaced; a no-op with nothing open. */
function withOpenLabel(h: History, label: string): History {
  return h.open === null ? h : { ...h, open: { ...h.open, label } };
}

/**
 * Folds one more applied edit into `state`: the document moves on, the turn's `applied`
 * and `results` grow, and the history's open entry is opened (on the first edit of the
 * turn) or extended. `openEntry` fixes a label when it opens an entry, but the turn's full
 * summary is only known once every edit (and the final outcome) is in, so `open.label` —
 * plain data on `OpenEntry` — is overwritten here after every edit and once more at
 * `streamEnded` just before closing, rather than trusted from the entry's first open.
 * Never touches `turn.card` (F42): an additive edit that lands while a card waits leaves
 * the card standing — only `handleCardResolved` and `handleStreamEnded` clear it.
 */
function applyAndRecord(state: HelperState, next: ProfileDocument, edit: AppliedEdit): HelperState {
  const applied = [...state.turn.applied, edit];
  const turn: Turn = {
    ...state.turn,
    applied,
    touched: withTouched(state.turn.touched, edit.target),
    results: {
      ...state.turn.results,
      [edit.toolCallId]: { status: "applied", summary: edit.summary },
    },
  };
  const label = turnSummary(turn);
  const opened =
    state.turn.applied.length === 0 ? openEntry(state.history, label, state.doc) : state.history;
  const history = withOpenLabel(appendToOpen(opened, next), label);
  return { ...state, doc: next, history, turn };
}

/** `state` with `toolCallId`'s result recorded, nothing else changed. */
function withResult(state: HelperState, toolCallId: string, outcome: ToolOutcome): HelperState {
  return {
    ...state,
    turn: { ...state.turn, results: { ...state.turn.results, [toolCallId]: outcome } },
  };
}

/**
 * What applying `op` to `state.doc` would do, without changing anything (contracts/
 * helper-protocol.md → "Results"): `applied` if it validates and is not destructive,
 * `carded` if it validates but `describeOperation` calls it destructive, `rejected` if
 * `applyOperation` refuses it. T036 calls this from the AI SDK's `onToolCall` to decide,
 * synchronously, whether to answer `addToolResult` at once or wait for the card.
 */
/**
 * A well-formed but arbitrary block id, for a `newBlockId` the type system requires but
 * that will never actually be called: `resolveToolCall` never applies its candidate for
 * real, and a carded op (`handleCardResolved`'s re-`applyOperation`) is never `add_block`
 * (`describeOperation` never calls one destructive) — `add_block` is the only operation
 * that calls `newBlockId`.
 */
const NO_OP_BLOCK_ID = "tttttttttttt";

/**
 * The one-card-at-a-time rule's answer to the model (F42; contracts/helper-protocol.md →
 * "Results"): a second destructive call in the same step, while the first is still on
 * the volunteer's screen, is refused with this reason — the document is untouched, and
 * the model can ask again once the card is answered. Before F42 the second call silently
 * replaced the first card, and the displaced call was never answered at all: the AI SDK
 * then waited for it for ever ("the build stalled").
 */
export const CARD_WAITING =
  "A suggestion is already waiting for the volunteer's answer. Ask again once it is answered.";

export function resolveToolCall(
  state: HelperState,
  op: EditOperation,
):
  | { kind: "applied"; summary: string }
  | { kind: "carded"; summary: string }
  | { kind: "rejected"; reason: string } {
  // The id only matters if the op is actually applied to state.doc, which happens later
  // (in the `toolCall` action, with the real generator) — a placeholder is enough here to
  // classify what would happen. `add_block` never lands on a destructive branch (see
  // describe.ts), so a real, applied `add_block` always uses the caller's own id.
  const result = applyOperation(state.doc, op, {
    assets: state.assets,
    newBlockId: () => NO_OP_BLOCK_ID,
  });
  if (!result.ok) return { kind: "rejected", reason: result.error.reason };
  const { summary, destructive } = describeOperation(state.doc, op, state.assets);
  return destructive ? { kind: "carded", summary } : { kind: "applied", summary };
}

function handleMediaChanged(state: HelperState, assets: readonly MediaAsset[]): HelperState {
  const refs = readyRefs(assets);
  const status = state.status === "working" ? "working" : hasReadyPhoto(refs) ? "ready" : "locked";
  return { ...state, assets: refs, status };
}

function handleSend(state: HelperState): HelperState {
  if (state.status === "working" && state.turn.card !== null) return sendOverCard(state);
  if (state.status !== "ready") return state;
  return { ...state, status: "working", turn: createTurn() };
}

/**
 * The unanswered-card rule (F35; contracts/helper-protocol.md → "Results"): a new message
 * while a card is still waiting is "Not this" for that card. The card is declined (the
 * document was untouched, FR-043), the turn it belonged to closes exactly as a clean
 * `streamEnded` would close it — its history entry holds whatever it applied, one undo —
 * and the new turn opens. That new turn starts with the one `declined` result carried
 * over, so `cardResolution` can still tell the panel the card was left as it was until
 * something newer lands; `turn.results` is otherwise turn-scoped, and nothing else from
 * the old turn crosses.
 */
function sendOverCard(state: HelperState): HelperState {
  const card = state.turn.card;
  if (card === null) return state;
  const declined = handleCardResolved(state, {
    type: "cardResolved",
    toolCallId: card.toolCallId,
    choice: "decline",
  });
  const closed = handleStreamEnded(declined, { type: "streamEnded", finishReason: "stop" });
  const next = handleSend(closed);
  if (next.status !== "working") return next;
  return {
    ...next,
    turn: { ...next.turn, results: { [card.toolCallId]: { status: "declined" } } },
  };
}

function handleToolCall(
  state: HelperState,
  action: Extract<HelperAction, { type: "toolCall" }>,
): HelperState {
  if (state.status !== "working") return state;
  let addedBlockId: string | undefined;
  const newBlockId = () => {
    addedBlockId = action.newBlockId();
    return addedBlockId;
  };
  const result = applyOperation(state.doc, action.op, { assets: state.assets, newBlockId });
  if (!result.ok) {
    return withResult(state, action.toolCallId, {
      status: "rejected",
      reason: result.error.reason,
    });
  }
  const { summary, destructive, noop } = describeOperation(state.doc, action.op, state.assets);
  if (destructive) {
    if (state.turn.card !== null) {
      return withResult(state, action.toolCallId, { status: "rejected", reason: CARD_WAITING });
    }
    return {
      ...state,
      turn: { ...state.turn, card: { toolCallId: action.toolCallId, op: action.op, summary } },
    };
  }
  // A no-op (F42: a `set_field` to the value already held) is answered `applied` with the
  // sentence that says nothing changed, and that is all: the document stays the same
  // object, no history entry opens, and the Applied line never lists it.
  if (noop) return withResult(state, action.toolCallId, { status: "applied", summary });
  const edit: AppliedEdit = {
    toolCallId: action.toolCallId,
    op: action.op,
    summary,
    blockIds: touchedBlockIds(action.op, addedBlockId),
    target: targetOf(state.doc, action.op, addedBlockId),
    ...fragmentFor(state.doc, action.op),
  };
  return applyAndRecord(state, result.value, edit);
}

function handleCardResolved(
  state: HelperState,
  action: Extract<HelperAction, { type: "cardResolved" }>,
): HelperState {
  const card = state.turn.card;
  if (card === null || card.toolCallId !== action.toolCallId) return state;
  if (action.choice === "decline") {
    return {
      ...state,
      turn: {
        ...state.turn,
        card: null,
        results: { ...state.turn.results, [action.toolCallId]: { status: "declined" } },
      },
    };
  }
  const result = applyOperation(state.doc, card.op, {
    assets: state.assets,
    newBlockId: () => NO_OP_BLOCK_ID,
  });
  if (!result.ok) {
    return {
      ...state,
      turn: {
        ...state.turn,
        card: null,
        results: {
          ...state.turn.results,
          [action.toolCallId]: { status: "rejected", reason: result.error.reason },
        },
      },
    };
  }
  const edit: AppliedEdit = {
    toolCallId: action.toolCallId,
    op: card.op,
    summary: card.summary,
    blockIds: touchedBlockIds(card.op, undefined),
    target: targetOf(state.doc, card.op, undefined),
    ...fragmentFor(state.doc, card.op),
  };
  return applyAndRecord({ ...state, turn: { ...state.turn, card: null } }, result.value, edit);
}

function handleStreamEnded(
  state: HelperState,
  action: Extract<HelperAction, { type: "streamEnded" }>,
): HelperState {
  // A non-error end with a card still pending is the normal AI SDK shape for a tool call
  // that awaits the browser's answer: the model's turn ends on the tool call, and answering
  // it (`cardResolved`) starts the next stream. The helper's own turn isn't over — the card
  // stays open, `status` stays `working`, the history entry stays open and `outcome` stays
  // `null` — it ends at the next `streamEnded` that finds no card pending.
  if (!("error" in action) && state.turn.card !== null) return state;
  // An error strands any pending card's tool call with no answer, which the next request to
  // the model cannot carry (an assistant tool call needs a matching tool result). Record one
  // so nothing is left unanswered: the op was never invalid, it just never got resolved.
  const results =
    state.turn.card === null
      ? state.turn.results
      : { ...state.turn.results, [state.turn.card.toolCallId]: { status: "declined" as const } };
  const outcome: TurnOutcome =
    "error" in action
      ? { kind: "error", applied: state.turn.applied.length, message: action.error }
      : action.finishReason === "length"
        ? { kind: "truncated", applied: state.turn.applied.length }
        : { kind: "done" };
  const closing: Turn = { ...state.turn, results, outcome, card: null };
  const history = closeEntry(withOpenLabel(state.history, turnSummary(closing)));
  // `closeEntry` records the open entry only once something was appended to it, which is
  // exactly when the turn applied an edit — so the top of `past` is then this turn's own.
  const entry = closing.applied.length > 0 ? (history.past.at(-1) ?? null) : null;
  const status = hasReadyPhoto(state.assets) ? "ready" : "locked";
  return { ...state, history, turn: { ...closing, entry }, status };
}

function handleManualEdit(
  state: HelperState,
  action: Extract<HelperAction, { type: "manualEdit" }>,
): HelperState {
  if (state.status === "working") return state;
  const result = applyOperation(state.doc, action.op, {
    assets: state.assets,
    newBlockId: action.newBlockId,
  });
  if (!result.ok) return state;
  const entry = { before: state.doc, after: result.value, label: action.label };
  return { ...state, doc: result.value, history: record(state.history, entry) };
}

function handleUndo(state: HelperState): HelperState {
  if (state.status === "working") return state;
  const moved = undoHistory(state.history);
  if (moved === null) return state;
  return { ...state, doc: moved.doc, history: moved.h };
}

function handleRedo(state: HelperState): HelperState {
  if (state.status === "working") return state;
  const moved = redoHistory(state.history);
  if (moved === null) return state;
  return { ...state, doc: moved.doc, history: moved.h };
}

/**
 * The pure helper reducer (contracts/helper-protocol.md → "Client state"). `mediaChanged`
 * tracks the ready library and the locked/ready gate (FR-032); `send` starts a turn (over a
 * pending card, it first declines that card and closes its turn — `sendOverCard`);
 * `toolCall` applies an additive edit at once, cards a destructive one — one card at a
 * time: a second destructive call while one waits is `rejected` (F42, `CARD_WAITING`) —
 * and answers a no-op `applied` without recording it; `cardResolved`
 * settles a card; `streamEnded` closes the turn's one history entry and names how it went;
 * `manualEdit`, `undo` and `redo` are the volunteer's own actions, refused while the
 * helper is `working` so the two histories never interleave (FR-036).
 */
export function helperReducer(state: HelperState, action: HelperAction): HelperState {
  switch (action.type) {
    case "mediaChanged":
      return handleMediaChanged(state, action.assets);
    case "send":
      return handleSend(state);
    case "toolCall":
      return handleToolCall(state, action);
    case "cardResolved":
      return handleCardResolved(state, action);
    case "streamEnded":
      return handleStreamEnded(state, action);
    case "manualEdit":
      return handleManualEdit(state, action);
    case "undo":
      return handleUndo(state);
    case "redo":
      return handleRedo(state);
  }
}

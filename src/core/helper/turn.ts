import type { Entry, History } from "../profile/history";
import type { EditOperation } from "../profile/operations";
import type { ProfileDocument } from "../profile/schema";

// One helper turn — what it holds (`Turn`, `AppliedEdit` and their parts) and the nine
// readers the panel and the canvas consult about it: the history label (`turnSummary`),
// the Applied sentence and its folding (`turnClauses`, `turnGroups`), the tagged blocks
// (`taggedBlocks`, F34), the latest refusal (`currentRejection`), a card's own resolution
// (`cardResolution`), where the turn's entry stands under undo/redo (`turnStanding`), the
// cut-off line (`failureSentence`), and the block a pending card names (`cardTarget`,
// F60). Pure over the turn and the history: nothing here changes state, and nothing here
// imports the reducer — the reducer imports this (F34 review, finding 2: the same split
// F2 made for `Canvas.tsx` / `CanvasStack.tsx`). `touchedBlockIds`, `movedBlockId` and
// `targetOf` moved here from the reducer for F60: `cardTarget` needs `targetOf` over a
// card's own op, and `targetOf` needs no reducer state — only `doc` and `op`, the same
// pure inputs `AppliedEdit`'s `target` (F34) already reads it with.

/**
 * One edit the helper has applied so far this turn: the tool call it answers, the
 * operation, the sentence the panel shows for it, the block ids to highlight (FR-042), and
 * the fragment `turnSummary` folds into the running label — `verb` and `label` are decided
 * once, at apply time, from the document as it stood immediately before the edit, since a
 * `remove_block` or `reorder_blocks` can no longer be resolved to a block type afterwards.
 * `target` (F34) is the one block the canvas follows for this edit — the block set, added
 * or given a photo, or for a reorder the block that moved — and `null` for an edit with
 * no block of its own (a theme, a facts field, a removal, a reorder that moved nothing).
 */
export interface AppliedEdit {
  toolCallId: string;
  op: EditOperation;
  summary: string;
  blockIds: readonly string[];
  target: string | null;
  verb: "added" | "removed" | "moved" | "changed" | "replaced" | "set theme";
  label: string;
}

/** A destructive op waiting on the volunteer's Apply / Not this (FR-043). */
export interface PendingCard {
  toolCallId: string;
  op: EditOperation;
  summary: string;
}

/** The one shape `addToolResult` sends back to the model for any edit tool. */
export type ToolOutcome =
  | { status: "applied"; summary: string }
  | { status: "declined" }
  | { status: "rejected"; reason: string };

/** How the turn ended: clean, cut off mid-response, or an error. `applied` is the count. */
export type TurnOutcome =
  | { kind: "done" }
  | { kind: "truncated"; applied: number }
  | { kind: "error"; applied: number; message: string };

/** Everything one helper response has done so far, from `send` to `streamEnded`. */
export interface Turn {
  applied: readonly AppliedEdit[];
  /** The `target` of every applied edit, in the order the edits landed and without
   * repeats (F34): what the canvas follows edit by edit, returns to the first of when the
   * turn ends, and tags while the turn's edits still stand ({@link taggedBlocks}). */
  touched: readonly string[];
  card: PendingCard | null;
  results: Readonly<Record<string, ToolOutcome>>;
  outcome: TurnOutcome | null;
  /** The one history entry the turn closed into at `streamEnded` — the same object the
   * history holds, so {@link turnStanding} can find it by identity wherever undo and redo
   * have moved it; `null` until then, and for a turn that applied nothing. */
  entry: Entry | null;
}

/** A turn with nothing in it yet: what `send` opens. */
export function createTurn(): Turn {
  return { applied: [], touched: [], card: null, results: {}, outcome: null, entry: null };
}

/** What `taggedBlocks` and `turnStanding` look at: the turn, and the history its entry
 * may sit in — the reducer's own state satisfies it. */
export interface TurnView {
  history: History;
  turn: Turn;
}

/**
 * `CATalyst: added hero, bio, gallery; set theme Sand` (FR-036, FR-042): the history
 * entry's label — the protocol's own name prefix on {@link turnClauses}.
 */
export function turnSummary(turn: Turn): string {
  return `CATalyst: ${turnClauses(turn)}`;
}

/**
 * `added hero, bio, gallery; set theme Sand` — consecutive applied edits that share a verb
 * are folded into one clause with their labels comma-joined; different verbs start a new
 * clause, joined with `; `. The panel's own "Applied — …" line (F26) reads this without
 * the history label's prefix, so the two can never disagree about what happened.
 */
export function turnClauses(turn: Turn): string {
  return turnGroups(turn)
    .map((group) => `${group.verb} ${group.edits.map((edit) => edit.label).join(", ")}`)
    .join("; ");
}

/** One clause of {@link turnClauses} before it is read as words: the verb and the
 * consecutive edits that share it, in order. */
export interface TurnGroup {
  verb: AppliedEdit["verb"];
  edits: readonly AppliedEdit[];
}

/**
 * The turn's applied edits folded by consecutive verb (F34) — the same folding
 * {@link turnClauses} reads as a sentence, kept edit by edit so the panel can make each
 * label the button that finds its block (`edit.target`) and still say the same thing the
 * history label says.
 */
export function turnGroups(turn: Turn): readonly TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const edit of turn.applied) {
    const last = groups.at(-1);
    if (last !== undefined && last.verb === edit.verb) {
      last.edits = [...last.edits, edit];
    } else {
      groups.push({ verb: edit.verb, edits: [edit] });
    }
  }
  return groups;
}

/**
 * The blocks that carry the "CATalyst · just now" tag (F34): the turn's touched blocks
 * while the turn is still open, and after it ends for exactly as long as its edits are
 * the newest thing on the page — the standing "Undo these" reads ({@link turnStanding}).
 * The volunteer's next edit buries the entry and the tags go with it; undo lifts the
 * turn's edits off the page, so nothing is "just now" any more; redo puts both back.
 */
export function taggedBlocks(state: TurnView): readonly string[] {
  if (state.turn.outcome === null) return state.turn.touched;
  return turnStanding(state) === "undoable" ? state.turn.touched : [];
}

/**
 * The reason for the turn's most recent tool call, when it was refused and nothing has
 * applied yet this turn (FR-040/046: told at once, never held for the turn's own end) —
 * `null` the rest of the time, so a refusal never displaces the "Applied — …" summary for
 * a turn that went on to apply something anyway. `Object.values` walks `turn.results` in
 * insertion order for these string keys, so its last entry is the most recent result.
 */
export function currentRejection(turn: Turn): string | null {
  if (turn.applied.length > 0) return null;
  const results = Object.values(turn.results);
  const last = results[results.length - 1];
  return last?.status === "rejected" ? last.reason : null;
}

/** What a card's own tool call resolved to, once it has (T038 review, finding 1 — "the card
 * itself owns its resolved states, independent of the turn summary"). */
export type CardResolution = { status: "declined" } | { status: "applied"; summary: string };

/**
 * `toolCallId`'s own resolution, but only while it is still the most recent thing that
 * happened this turn — `Object.keys(turn.results)` walks in insertion order for these
 * string keys, so comparing against its last key is enough to know nothing newer has
 * landed. `null` once something newer has (a card's inline state must never linger stale),
 * for a `toolCallId` this turn never carded, or for a turn that hasn't resolved it yet.
 * `declined` only ever comes from `handleCardResolved`'s decline branch, so it unambiguously
 * means "this card was dismissed" with no need to know which op it was; `applied` carries
 * the same `summary` `describeOperation` gave the card in the first place. `turn.results`
 * is turn-scoped (`createTurn()` on every `send`), so a `toolCallId` from an earlier turn
 * simply finds nothing here.
 */
export function cardResolution(turn: Turn, toolCallId: string): CardResolution | null {
  const ids = Object.keys(turn.results);
  if (ids[ids.length - 1] !== toolCallId) return null;
  const result = turn.results[toolCallId];
  if (result?.status === "declined") return { status: "declined" };
  if (result?.status === "applied") return { status: "applied", summary: result.summary };
  return null;
}

/** Where the turn's own history entry stands: the next step undo would take (`undoable`),
 * the next step redo would put back (`redoable`), or neither (`gone`). */
export type TurnStanding = "undoable" | "redoable" | "gone";

/**
 * Whether "Undo these" / "Redo these" would act on *this turn's* edits right now (F26
 * review, finding 1). The turn's entry (`turn.entry`, set at `streamEnded`) is compared by
 * identity with the top of `history.past` and `history.future` — undo and redo move the
 * same object between the two — so once the volunteer has undone the turn, or edited
 * again on top of it, the panel never offers an undo that would take something else.
 */
export function turnStanding(state: TurnView): TurnStanding {
  const { entry } = state.turn;
  if (entry === null) return "gone";
  if (state.history.past.at(-1) === entry) return "undoable";
  if (state.history.future.at(-1) === entry) return "redoable";
  return "gone";
}

/**
 * The panel's line after a turn that was cut off (FR-046/047): what landed, or that
 * nothing did. `turn.applied.length` is the count regardless of how the turn ended.
 */
export function failureSentence(turn: Turn): string {
  const n = turn.applied.length;
  if (n === 0) return "Nothing on your page changed.";
  const count = n === 1 ? "1 section" : `${n} sections`;
  return `I added ${count} before I was cut off. Undo these, or ask me to continue.`;
}

/** The block ids `op` touches, for the canvas to briefly highlight (FR-042). */
export function touchedBlockIds(
  op: EditOperation,
  addedBlockId: string | undefined,
): readonly string[] {
  switch (op.op) {
    case "set_field":
      return op.target.kind === "block" ? [op.target.blockId] : [];
    case "add_block":
      return addedBlockId === undefined ? [] : [addedBlockId];
    case "remove_block":
      return [];
    case "reorder_blocks":
      return op.order;
    case "set_theme":
      return [];
    case "replace_image":
      return [op.blockId];
  }
}

/**
 * The block that moved, for a reorder's fragment: the one now at the first position that
 * changed — matches describe.ts's `reorderSummary`, which names the same block in its
 * full sentence. `undefined` when the "reorder" is the identity permutation.
 */
export function movedBlockId(doc: ProfileDocument, order: readonly string[]): string | undefined {
  const index = doc.blocks.findIndex((block, i) => order[i] !== block.id);
  return index === -1 ? undefined : order[index];
}

/**
 * The one block the canvas follows for `op` (F34): a reorder's is the block that moved —
 * read from `doc`, the document before the edit, like its label — and an op with no
 * block of its own has none. `null` rather than `undefined`, since it is data the panel
 * reads back.
 */
export function targetOf(
  doc: ProfileDocument,
  op: EditOperation,
  addedBlockId: string | undefined,
): string | null {
  if (op.op === "reorder_blocks") return movedBlockId(doc, op.order) ?? null;
  return touchedBlockIds(op, addedBlockId)[0] ?? null;
}

/**
 * The block a pending card names (F60; design 2026-09-13 §4): what the canvas reveals —
 * scrolls to and rings, the same `reveal` a landed edit gets (F34) — while the volunteer
 * still has Apply / Not this in front of them. `null` with no card waiting.
 *
 * Two op kinds `targetOf` reads as "no block of its own" still have one here, because the
 * card is asking about a block that still exists (nothing has applied yet):
 *
 * - `remove_block` — `targetOf`/`touchedBlockIds` answer `[]` for it, since *after* the
 *   removal there is nothing left to highlight; but the card is raised *before* Apply, so
 *   `op.blockId` is still on the page and is exactly what the volunteer should see.
 * - `set_field` on the profile itself (tagline, name, age) has no block at all — the
 *   value shows on the hero, so the hero (`doc.blocks[0]`, F1: mandatory, fixed at the
 *   top) is revealed instead.
 *
 * Every other carded kind (`set_field` on a block, `replace_image`) already has a block
 * `targetOf` finds; `add_block`, `reorder_blocks` and `set_theme` are never carded
 * (describe.ts), so `turn.card.op` never actually reaches those branches here — `targetOf`
 * still handles them for completeness, matching its one other caller.
 */
export function cardTarget(doc: ProfileDocument, turn: Turn): string | null {
  const { card } = turn;
  if (card === null) return null;
  const { op } = card;
  if (op.op === "remove_block") return op.blockId;
  const target = targetOf(doc, op, undefined);
  if (target !== null) return target;
  if (op.op === "set_field" && op.target.kind === "profile") return doc.blocks[0]?.id ?? null;
  return null;
}

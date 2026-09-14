import type { EditOperation } from "@/core/profile/operations";

// The sentences the proposal card and its later states cut from `describeOperation`'s
// summary (split out of `ProposalCard.tsx` in F58 so the card stays under the component
// ceiling): the ledger row's own sentence, the consequence notice's heading, the "Not
// applied" note, the mono header and the row's one-word key.

/** `describeOperation`'s summary is always one or two plain sentences. */
export function sentences(summary: string): string[] {
  return summary.split(/(?<=\.) +/);
}

/** The consequence notice's heading: the destructive half of the summary (its last
 * sentence), without its own trailing period — CONTENT.md's own table entry
 * ("Shortening the bio replaces your text") and the hi-fi both drop it (T038 review,
 * finding 3); `detail` (a full sentence of its own) carries the period back in. */
export function consequenceHeading(summary: string): string {
  const list = sentences(summary);
  const last = list[list.length - 1] ?? summary;
  return last.replace(/\.$/, "");
}

/** The ledger row's sentence: the summary without its consequence sentence when the op
 * is destructive — that sentence is the notice's heading, and a notice never explains
 * twice (CONTENT.md) — or the whole summary otherwise. */
export function rowSentence(summary: string, destructive: boolean): string {
  const list = sentences(summary);
  return destructive && list.length > 1 ? list.slice(0, -1).join(" ") : summary;
}

/** `Not applied: shortening the bio.` — the summary's first sentence with its verb as a
 * gerund (`Shorten the bio.` → `shortening the bio`), for the one-line note under a turn
 * summary when the volunteer declined a card the same turn that applied something. */
export function notAppliedLine(summary: string): string {
  const first = sentences(summary)[0] ?? summary;
  const [verb = "", ...rest] = first.replace(/\.$/, "").split(" ");
  const doing = `${verb.toLowerCase().replace(/e$/, "")}ing`;
  return `Not applied: ${[doing, ...rest].join(" ")}.`;
}

/** The mono header: `count` is always 1 today (`PendingCard` never holds more than one
 * op), pluralised for when it might not be. */
export function operationsHeader(count: number): string {
  return `Proposed · ${count} operation${count === 1 ? "" : "s"}`;
}

/** The ledger key for a field, by the first segment of its path: what the edit touches,
 * in the one word the canvas's own block labels use. */
const FIELD_KEY: Readonly<Record<string, string>> = {
  name: "name",
  age: "age",
  sex: "sex",
  tagline: "tagline",
  content: "bio",
  caption: "caption",
  mediaIds: "gallery",
  text: "quote",
  attribution: "quote",
  cards: "cards",
  scenes: "scene",
};

/** The row's mono key: one word for what the operation touches. */
export function ledgerKey(op: EditOperation): string {
  switch (op.op) {
    case "set_field":
      return FIELD_KEY[op.path.split(".")[0] ?? ""] ?? "field";
    case "add_block":
    case "remove_block":
      return "section";
    case "reorder_blocks":
      return "order";
    case "set_theme":
      return "theme";
    case "replace_image":
      return "photo";
  }
}

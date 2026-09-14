"use client";
import { useRef, useState } from "react";
import { FOLD_CHARS, type TextChange } from "@/core/profile/text-change";
import { foldDiff, type DiffPart, type ParagraphDiff } from "@/core/profile/text-diff";
import { LINK_BUTTON } from "./styles";

// CONTENT.md → Helper, Proposal change (F58; user feedback 2026-09-13: "you Apply or deny
// but you don't really know what you are applying"; DESIGN.md §6 rule 3 "every
// irreversible action names what it will remove"): the ledger row's readout grown into
// the change itself. A text field draws its old value struck through in `meta` and the
// new one under it in `body` — two lines a volunteer reads faster than a speckled one.
// The bio draws a word-level diff as prose, paragraphs kept: removed words struck in
// `meta`, added words in `ink` with a hairline underline, the first ~8 lines and then
// `Show the full text`. No colour on either: clay is the notice's and blue is the ring's
// (DESIGN.md §6 rule 1). The needs cards are the two-line form three times over.
//
// `<del>` / `<ins>` carry the meaning for a screen reader that announces them; for one
// that does not, each line of the two-line form is led in with a visually hidden `was:` /
// `now:`, and the prose gets one visually hidden sentence before it. The markup is the
// text itself: core's diff re-joins to either value verbatim, so nothing here is a
// paraphrase of what Apply will do.

const LEAD_IN = "Removed words are struck through; added words are underlined.";
const MARKS_ONLY = "Only the formatting changes.";
const SHOW_ALL = "Show the full text";

const DEL = "text-meta line-through";
const INS_LINE = "text-body no-underline";
const INS_WORD = "text-ink underline decoration-rule decoration-1 underline-offset-2";

/** The old value, struck, led in for the ear. */
function Was({ text }: { text: string }) {
  return (
    <del className={DEL}>
      <span className="sr-only">was: </span>
      {text}
    </del>
  );
}

/** The new value, plain, led in for the ear. */
function Now({ text }: { text: string }) {
  return (
    <ins className={INS_LINE}>
      <span className="sr-only">now: </span>
      {text}
    </ins>
  );
}

/** A text field's two lines: the old struck (unless the field was empty), the new under
 * it (unless the edit clears it). */
function Pair({ before, after }: { before: string; after: string }) {
  return (
    <div className="flex basis-full flex-col gap-4 text-ui-dense font-normal">
      {before === "" ? null : <Was text={before} />}
      {after === "" ? null : <Now text={after} />}
    </div>
  );
}

/** One of a needs card's two fields: plain when kept, the pair when changed. */
function CardField({ before, after, title }: { before: string; after: string; title?: true }) {
  if (before === after) {
    if (before === "") return null;
    const voice = title ? "font-medium text-ink" : "font-normal text-body";
    return <p className={`text-ui-dense ${voice}`}>{before}</p>;
  }
  return <Pair before={before} after={after} />;
}

/** The needs cards paired by position: a changed card struck and new, a kept one plain,
 * a dropped one all struck, an added one all new. */
function CardPairs({ change }: { change: Extract<TextChange, { kind: "cards" }> }) {
  const count = Math.max(change.before.length, change.after.length);
  return (
    <div className="flex flex-col gap-8">
      {Array.from({ length: count }, (_, i) => {
        const before = change.before[i];
        const after = change.after[i];
        return (
          <div key={i} className="flex flex-col gap-4">
            <CardField before={before?.title ?? ""} after={after?.title ?? ""} title />
            <CardField before={before?.text ?? ""} after={after?.text ?? ""} />
          </div>
        );
      })}
    </div>
  );
}

/** One part of the prose. Only the words are struck or underlined: the whitespace a
 * token carries after its word is drawn plain, so no mark runs on into the next word and
 * no lone space is ever marked. */
function Part({ part }: { part: DiffPart }) {
  const words = part.text.trimEnd();
  const tail = part.text.slice(words.length);
  if (part.kind === "same" || words === "") return part.text;
  const marked =
    part.kind === "del" ? (
      <del className={DEL}>{words}</del>
    ) : (
      <ins className={INS_WORD}>{words}</ins>
    );
  return (
    <>
      {marked}
      {tail}
    </>
  );
}

/** Whether any word in the diff is struck or underlined; a bio edit that only changes
 * marks (a bold toggled) has none, and must not promise them. */
function hasMarks(diff: readonly ParagraphDiff[]): boolean {
  return diff.some((paragraph) => paragraph.parts.some((part) => part.kind !== "same"));
}

/** The bio's diff as prose: its paragraphs, folded past {@link FOLD_CHARS} behind
 * `Show the full text`, which opens the rest in place and keeps focus on the prose. */
function DiffProse({ diff }: { diff: readonly ParagraphDiff[] }) {
  const [open, setOpen] = useState(false);
  const prose = useRef<HTMLDivElement>(null);
  const { shown, folded } = open ? { shown: diff, folded: false } : foldDiff(diff, FOLD_CHARS);
  const showAll = () => {
    setOpen(true);
    prose.current?.focus({ preventScroll: true });
  };
  return (
    <div
      ref={prose}
      tabIndex={-1}
      data-diff=""
      className="flex flex-col gap-8 rounded-control text-ui-dense font-normal text-body focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue"
    >
      {hasMarks(diff) ? (
        <span className="sr-only">{LEAD_IN}</span>
      ) : (
        <p className="text-meta">{MARKS_ONLY}</p>
      )}
      {shown.map((paragraph, i) => (
        <p key={i}>
          {paragraph.parts.map((part, j) => (
            <Part key={j} part={part} />
          ))}
        </p>
      ))}
      {folded ? (
        <button type="button" className={LINK_BUTTON} onClick={showAll}>
          {SHOW_ALL}
        </button>
      ) : null}
    </div>
  );
}

/** The change block for `change`: the two-line pair for a text field, the prose diff for
 * the bio, the pairs for the needs cards. `ProposalCard` places a text pair inside the
 * ledger row under its sentence and the other two under the row, full width. */
export function ChangeBlock({ change }: { change: TextChange }) {
  switch (change.kind) {
    case "text":
      return <Pair before={change.before} after={change.after} />;
    case "richText":
      return <DiffProse diff={change.diff} />;
    case "cards":
      return <CardPairs change={change} />;
  }
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { EditOperation } from "@/core/profile/operations";
import { pronouns } from "@/core/profile/pronouns";
import { FIELD_LIMITS, type Block } from "@/core/profile/schema";
import { Button } from "@/ui/shared/Button";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { BlockShell } from "./BlockShell";
import { ConfirmEdit } from "./ConfirmEdit";
import { DraftField, DraftTextarea } from "./DraftField";
import type { EditorFor } from "./editor-props";
import { useCatSex } from "../cat-sex";
import { useWorkingLock } from "../working-lock";

// "What she needs" (FR-016): one to three titled cards. A title or a text is its own
// `set_field cards.N.title|text`; `add card` and `remove card` are one `set_field cards`
// with the whole list, which the core refuses past three or under one — the editor holds
// no count of its own. Removing a card with words in it asks first. F41: a card's text
// placeholder names the cat by pronoun (`her` / `him` / `them`), read from `useCatSex()`.
//
// F12: the card fieldset carries `theme-chrome` alongside its `bg-paper`, the same pairing
// BlockShell's own label row uses (see its comment) — without it, `bg-paper` reads the
// *themed* paper (`--profile-bg-a`) inside the canvas's `.theme-scope`, and clay `remove
// card` fell under 4.5:1 on Sand (4.34:1) and, worse, on Night (3.26:1). Chrome pins the
// card back to the fixed, un-themed paper every preset's clay was measured against.

type Card = Extract<Block, { type: "needs" }>["cards"][number];

type CardPath =
  | "cards.0.title"
  | "cards.0.text"
  | "cards.1.title"
  | "cards.1.text"
  | "cards.2.title"
  | "cards.2.text";

/** The path of card `index`'s title or text, one of the six the grammar knows. */
function cardPath(index: number, field: "title" | "text"): CardPath {
  const n = index === 0 ? "0" : index === 1 ? "1" : "2";
  return `cards.${n}.${field}`;
}

interface CardProps extends Pick<EditorFor<"needs">, "block" | "onApply"> {
  card: Card;
  index: number;
  titleRef: (input: HTMLInputElement | null) => void;
  onRemove: () => void;
}

function CardEditor({ block, onApply, card, index, titleRef, onRemove }: CardProps) {
  const n = index + 1;
  const working = useWorkingLock();
  const object = pronouns(useCatSex()).object;
  const set = (field: "title" | "text", value: string) =>
    onApply({
      op: "set_field",
      target: { kind: "block", blockId: block.id },
      path: cardPath(index, field),
      value,
    });
  return (
    <fieldset className="theme-chrome flex min-w-0 flex-col gap-12 rounded-control border border-line-panel bg-paper p-16">
      <legend className="px-4">
        <MonoLabel className="text-meta">Card {n}</MonoLabel>
      </legend>
      <DraftField
        ref={titleRef}
        label={`Card ${n} title`}
        value={card.title}
        maxLength={FIELD_LIMITS.cardTitle}
        placeholder="A quiet room"
        onCommit={(value) => set("title", value)}
      />
      <DraftTextarea
        label={`Card ${n} text`}
        value={card.text}
        maxLength={FIELD_LIMITS.cardText}
        placeholder={`What it means for ${object}, in a sentence or two`}
        onCommit={(value) => set("text", value)}
      />
      <Button
        variant="ghost"
        className="self-start text-clay"
        disabled={working}
        onClick={onRemove}
      >
        remove card
      </Button>
    </fieldset>
  );
}

// The cards' edits as operations, the focus a new card asks for, and the question's state.
function useNeedsEdits({ block, onApply, describe }: EditorFor<"needs">) {
  const [toRemove, setToRemove] = useState<number | null>(null);
  const wantFocus = useRef<number | null>(null);
  const titles = useRef<(HTMLInputElement | null)[]>([]);

  // A new card gets focus on its title once it is on the page.
  useEffect(() => {
    const index = wantFocus.current;
    if (index === null) return;
    wantFocus.current = null;
    titles.current[index]?.focus();
  });

  const setCards = (cards: Card[]): EditOperation => ({
    op: "set_field",
    target: { kind: "block", blockId: block.id },
    path: "cards",
    value: cards,
  });
  const without = (index: number) => setCards(block.cards.filter((_, i) => i !== index));
  return {
    toRemove,
    setToRemove,
    without,
    titleRef: (index: number) => (input: HTMLInputElement | null) => {
      titles.current[index] = input;
    },
    add: () => {
      wantFocus.current = block.cards.length;
      onApply(setCards([...block.cards, { title: "", text: "" }]));
    },
    askRemove: (index: number) => {
      if (describe(without(index)).destructive) setToRemove(index);
      else onApply(without(index));
    },
  };
}

/** The needs section's editor. */
export function NeedsEditor(props: EditorFor<"needs">) {
  const { block, onApply, describe } = props;
  const edits = useNeedsEdits(props);
  const working = useWorkingLock();
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <div className="flex flex-col gap-12">
        <div className="grid gap-12 md:grid-cols-3">
          {block.cards.map((card, index) => (
            <CardEditor
              key={index}
              block={block}
              onApply={onApply}
              card={card}
              index={index}
              titleRef={edits.titleRef(index)}
              onRemove={() => edits.askRemove(index)}
            />
          ))}
        </div>
        <Button variant="secondary" className="self-start" disabled={working} onClick={edits.add}>
          add card
        </Button>
      </div>
      {edits.toRemove === null ? null : (
        <ConfirmEdit
          question={`Remove card ${edits.toRemove + 1}?`}
          description={describe(edits.without(edits.toRemove))}
          confirmLabel="Remove card"
          onKeep={() => edits.setToRemove(null)}
          onConfirm={() => {
            const index = edits.toRemove;
            edits.setToRemove(null);
            if (index !== null) onApply(edits.without(index));
          }}
        />
      )}
    </BlockShell>
  );
}

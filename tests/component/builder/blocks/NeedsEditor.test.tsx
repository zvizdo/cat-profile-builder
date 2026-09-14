import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import { EditorHarness, settle } from "./harness";

// The "What she needs" editor (T025; FR-016): one to three cards, each a title of at most
// 60 characters and a text of at most 240. `add card` and `remove card` are one
// `set_field cards` with the whole list; the core refuses a fourth card or an empty list
// and says so. Removing a card that has words asks first.

const NEEDS = {
  id: "needsaaaaaaa",
  type: "needs",
  cards: [{ title: "", text: "" }],
} satisfies Block;
const WRITTEN = {
  ...NEEDS,
  cards: [
    { title: "A quiet room", text: "She hides for a day, then owns the place." },
    { title: "", text: "" },
  ],
};

function lastCards(ops: EditOperation[]): unknown {
  const op = ops.at(-1);
  return op?.op === "set_field" ? op.value : undefined;
}

describe("NeedsEditor", () => {
  it("shows one empty card with its caps and adds a second from the keyboard", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={NEEDS} onApply={(op) => ops.push(op)} />);
    expect(screen.getByRole("textbox", { name: "Card 1 title" })).toHaveAttribute(
      "maxLength",
      "60",
    );
    expect(screen.getByRole("textbox", { name: "Card 1 text" })).toHaveAttribute(
      "maxLength",
      "240",
    );
    screen.getByRole("button", { name: "add card" }).focus();
    await user.keyboard("{Enter}");
    expect(ops).toEqual([
      {
        op: "set_field",
        target: { kind: "block", blockId: NEEDS.id },
        path: "cards",
        value: [
          { title: "", text: "" },
          { title: "", text: "" },
        ],
      },
    ]);
    expect(screen.getByRole("textbox", { name: "Card 2 title" })).toHaveFocus();
  });

  it("writes a card's title and text to their own paths", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={NEEDS} onApply={(op) => ops.push(op)} />);
    await user.type(screen.getByRole("textbox", { name: "Card 1 title" }), "A window");
    await user.tab();
    expect(ops.at(-1)).toMatchObject({ path: "cards.0.title", value: "A window" });
    await user.type(screen.getByRole("textbox", { name: "Card 1 text" }), "For the birds.");
    await settle();
    expect(ops.at(-1)).toMatchObject({ path: "cards.0.text", value: "For the birds." });
  });

  it("lets the core refuse a fourth card and an empty list, and shows why", async () => {
    const user = userEvent.setup();
    render(<EditorHarness block={{ ...NEEDS, cards: [{ title: "", text: "" }] }} />);
    await user.click(screen.getByRole("button", { name: "remove card" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      'That value doesn\'t fit the "What they need" cards.',
    );
    expect(screen.getByRole("textbox", { name: "Card 1 title" })).toBeInTheDocument();
    const add = screen.getByRole("button", { name: "add card" });
    await user.click(add);
    await user.click(add);
    expect(screen.getByRole("textbox", { name: "Card 3 title" })).toBeInTheDocument();
    await user.click(add);
    expect(screen.getByRole("alert")).toHaveTextContent(
      'That value doesn\'t fit the "What they need" cards.',
    );
    expect(screen.queryByRole("textbox", { name: "Card 4 title" })).toBeNull();
  });

  it("asks before removing a card with words in it, and removes an empty one at once", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={WRITTEN} onApply={(op) => ops.push(op)} />);
    const written = screen.getAllByRole("group")[0]!;
    await user.click(within(written).getByRole("button", { name: "remove card" }));
    const dialog = screen.getByRole("dialog", { name: "Remove card 1?" });
    expect(dialog).toHaveTextContent("Changing the cards replaces your text.");
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(ops).toHaveLength(0);
    await user.click(within(written).getByRole("button", { name: "remove card" }));
    await user.click(screen.getByRole("button", { name: "Remove card" }));
    expect(lastCards(ops)).toEqual([WRITTEN.cards[1]]);
    // The one card left is empty: no question, and the core keeps the last card.
    await user.click(screen.getByRole("button", { name: "remove card" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(lastCards(ops)).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      'That value doesn\'t fit the "What they need" cards.',
    );
  });

  it("names a card's text placeholder and the field's error by the cat's recorded sex — F41", () => {
    const female = render(
      <EditorHarness
        block={{ ...NEEDS, id: "needsfemalea" }}
        sex="female"
        assets={[]}
        name="Charlotte"
      />,
    );
    expect(screen.getByRole("textbox", { name: "Card 1 text" })).toHaveAttribute(
      "placeholder",
      "What it means for her, in a sentence or two",
    );
    female.unmount();

    render(<EditorHarness block={{ ...NEEDS, id: "needsmalea" }} sex="male" />);
    expect(screen.getByRole("textbox", { name: "Card 1 text" })).toHaveAttribute(
      "placeholder",
      "What it means for him, in a sentence or two",
    );
  });
});

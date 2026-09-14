import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { PendingCard } from "@/core/helper/reducer";
import { FOLD_CHARS, type TextChange } from "@/core/profile/text-change";
import { diffParagraphs } from "@/core/profile/text-diff";
import { renderCard } from "./card-harness";

// F58 (user feedback 2026-09-13: "you Apply or deny but you don't really know what you
// are applying"): the ledger row's readout grows into the change block — the text the
// edit replaces and the text it puts there, as `<del>` / `<ins>` so a screen reader that
// announces them hears the difference, with a visually hidden lead-in for one that does
// not. `change` is `textChange(doc, op)` from core; the card draws what it is handed and
// never derives a diff from the operation's shape.

const TAGLINE_CARD: PendingCard = {
  toolCallId: "call-tagline",
  op: { op: "set_field", target: { kind: "profile" }, path: "tagline", value: "New." },
  summary: "Change the tagline. Changing the tagline replaces your text.",
};

const OLD_TAGLINE = "A negotiator, not a complainer";
const NEW_TAGLINE = "Follows you room to room, then settles on the nearest lap";

function bioChange(before: string[], after: string[]): TextChange {
  const rt = (texts: string[]) => ({ paragraphs: texts.map((text) => ({ runs: [{ text }] })) });
  return {
    kind: "richText",
    label: "bio",
    before: rt(before),
    after: rt(after),
    diff: diffParagraphs(rt(before), rt(after)),
  };
}

describe("ProposalCard — the change block (F58)", () => {
  it("draws a text field's old value struck and the new one under it, each led in for a screen reader, in place of the word count", () => {
    const { container } = renderCard({
      card: TAGLINE_CARD,
      readout: { before: "5", after: "9", unit: "words" },
      change: { kind: "text", label: "tagline", before: OLD_TAGLINE, after: NEW_TAGLINE },
    });
    const del = container.querySelector("del");
    const ins = container.querySelector("ins");
    expect(del).toHaveTextContent(OLD_TAGLINE);
    expect(ins).toHaveTextContent(NEW_TAGLINE);
    expect(del).toHaveClass("line-through");
    // The lead-ins are for the ear, not the eye.
    expect(del?.querySelector(".sr-only")).toHaveTextContent("was:");
    expect(ins?.querySelector(".sr-only")).toHaveTextContent("now:");
    expect(screen.queryByText("5 → 9 words")).not.toBeInTheDocument();
    expect(screen.getByText("Change the tagline.")).toBeInTheDocument();
  });

  it("keeps the one-line readout for a pair short enough to read there, with no block", () => {
    const { container } = renderCard({
      card: { ...TAGLINE_CARD, summary: "Change the name. Changing the name replaces your text." },
      readout: { before: "Charlotte", after: "Marmalade" },
      change: { kind: "text", label: "name", before: "Charlotte", after: "Marmalade" },
    });
    expect(screen.getByText("Charlotte → Marmalade")).toBeInTheDocument();
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector("ins")).toBeNull();
  });

  it("draws an unset field's first value as new alone, with nothing struck", () => {
    const { container } = renderCard({
      card: TAGLINE_CARD,
      destructive: false,
      change: { kind: "text", label: "tagline", before: "", after: NEW_TAGLINE },
    });
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector("ins")).toHaveTextContent(NEW_TAGLINE);
  });

  it("draws the bio's word count beside the sentence and its diff as prose under the row, paragraphs kept", () => {
    const { container } = renderCard({
      card: { ...TAGLINE_CARD, summary: "Shorten the bio. Shortening the bio replaces your text." },
      readout: { before: "12", after: "9", unit: "words" },
      change: bioChange(
        ["Charlotte is a three-year-old tabby who follows you.", "She ignores the dog."],
        ["Charlotte is a tabby who follows you.", "She tolerates the dog."],
      ),
    });
    expect(screen.getByText("12 → 9 words")).toBeInTheDocument();
    const dels = [...container.querySelectorAll("del")].map((el) => el.textContent);
    const inss = [...container.querySelectorAll("ins")].map((el) => el.textContent);
    // The words only: the space after each is drawn plain, so no mark runs into the next word.
    expect(dels).toEqual(["three-year-old", "ignores"]);
    expect(inss).toEqual(["tolerates"]);
    expect(container.querySelector("[data-diff] p")).toHaveTextContent(
      "Charlotte is a three-year-old tabby who follows you.",
    );
    // Two paragraphs, as written; the lead-in sentence is read, not seen.
    const prose = container.querySelector("[data-diff]");
    expect(prose?.querySelectorAll("p")).toHaveLength(2);
    const leadIn = screen.getByText(
      "Removed words are struck through; added words are underlined.",
    );
    expect(leadIn).toHaveClass("sr-only");
    expect(screen.queryByRole("button", { name: "Show the full text" })).not.toBeInTheDocument();
  });

  it("says only the formatting changes, with no lead-in, when no word is struck or added", () => {
    const rt = (bold?: true) => ({
      paragraphs: [{ runs: [{ text: "A calm cat.", ...(bold ? { bold } : {}) }] }],
    });
    const { container } = renderCard({
      card: TAGLINE_CARD,
      change: {
        kind: "richText",
        label: "bio",
        before: rt(),
        after: rt(true),
        diff: diffParagraphs(rt(), rt(true)),
      },
    });
    expect(screen.getByText("Only the formatting changes.")).toBeInTheDocument();
    expect(
      screen.queryByText("Removed words are struck through; added words are underlined."),
    ).not.toBeInTheDocument();
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector("ins")).toBeNull();
  });

  it("draws a part that is only whitespace plain — never a struck or underlined space", () => {
    const { container } = renderCard({
      card: TAGLINE_CARD,
      change: bioChange(["a  b"], ["a b"]),
    });
    expect(container.querySelector("[data-diff]")).toHaveTextContent("a b");
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector("ins")).toBeNull();
  });

  it("folds a long diff behind Show the full text, which reveals the rest in place", async () => {
    const user = userEvent.setup();
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const change = bioChange(
      [words, "Last paragraph here."],
      ["Short now.", "Last paragraph here."],
    );
    expect(change.kind === "richText" && change.diff.length).toBe(2);
    renderCard({
      card: { ...TAGLINE_CARD, summary: "Shorten the bio. Shortening the bio replaces your text." },
      change,
    });
    expect(screen.queryByText("Last paragraph here.")).not.toBeInTheDocument();
    const shown = screen.getByText(/^word0 word1/);
    expect(shown.textContent?.length).toBeLessThanOrEqual(FOLD_CHARS + 1);
    expect(shown.textContent?.endsWith("…")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Show the full text" }));
    expect(screen.getByText("Last paragraph here.")).toBeInTheDocument();
    expect(screen.getByText(/^word0 word1/).textContent?.endsWith("word119")).toBe(true);
    expect(screen.queryByRole("button", { name: "Show the full text" })).not.toBeInTheDocument();
    // The button is gone; focus stays on the prose it opened, never falls to the body.
    expect(document.activeElement).toHaveAttribute("data-diff");
  });

  it("draws the needs cards as pairs: a changed card struck and new, a kept one plain, a dropped one all struck, an added one all new", () => {
    const { container } = renderCard({
      card: {
        ...TAGLINE_CARD,
        summary: 'Change the "What she needs" cards. Changing the cards replaces your text.',
      },
      change: {
        kind: "cards",
        label: '"What she needs" cards',
        before: [
          { title: "Quiet", text: "No dogs." },
          { title: "Sunlight", text: "A windowsill to watch from." },
          { title: "Company", text: "Someone home most days." },
        ],
        after: [
          { title: "Calm", text: "No dogs." },
          { title: "Sunlight", text: "A windowsill to watch from." },
        ],
      },
    });
    const dels = [...container.querySelectorAll("del")].map((el) => el.textContent);
    const inss = [...container.querySelectorAll("ins")].map((el) => el.textContent);
    expect(dels).toEqual(["was: Quiet", "was: Company", "was: Someone home most days."]);
    expect(inss).toEqual(["now: Calm"]);
    // The kept card and the kept text are there to read, plain.
    expect(screen.getByText("Sunlight")).toBeInTheDocument();
    expect(screen.getByText("A windowsill to watch from.")).toBeInTheDocument();
    expect(screen.getAllByText("No dogs.")).toHaveLength(1);
  });

  it("draws an added needs card all new, and skips a field empty on both sides", () => {
    const { container } = renderCard({
      card: TAGLINE_CARD,
      destructive: false,
      change: {
        kind: "cards",
        label: '"What she needs" cards',
        before: [{ title: "Quiet", text: "" }],
        after: [
          { title: "Quiet", text: "" },
          { title: "Sunlight", text: "A windowsill." },
        ],
      },
    });
    expect(container.querySelectorAll("del")).toHaveLength(0);
    const inss = [...container.querySelectorAll("ins")].map((el) => el.textContent);
    expect(inss).toEqual(["now: Sunlight", "now: A windowsill."]);
    expect(screen.getByText("Quiet")).toBeInTheDocument();
    // Two cards' worth of lines, and nothing drawn for the kept card's empty text.
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("keys a photo swap as `photo`, with no block", () => {
    const { container } = renderCard({
      card: {
        toolCallId: "call-photo",
        op: { op: "replace_image", blockId: "video1aaaaa", slot: 0, mediaId: "media2aa" },
        summary: "Replace the photo in the hero. The photo in the hero leaves Charlotte's page.",
      },
      change: null,
    });
    expect(screen.getByText("photo")).toBeInTheDocument();
    expect(container.querySelector("del")).toBeNull();
  });

  it("draws no block at all when core answers no change for the operation (a photo swap, a removal)", () => {
    const { container } = renderCard({ destructive: false, change: null });
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector("ins")).toBeNull();
    expect(container.querySelector("[data-diff]")).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import { RichTextSchema, type RichText } from "@/core/profile/rich-text";
import type { Block } from "@/core/profile/schema";
import { BlockBody } from "@/ui/builder/BlockBody";
import { EditorHarness, settle } from "./harness";
import { nextFrame, pasteInto, selectFirst, stubLayout, typeInto } from "./prosemirror-jsdom";

// The bio editor (T025; ADR-013; FR-020): Tiptap with paragraph, bold, italic and link
// only, mapped to `RichText` on every change — the document never holds Tiptap JSON —
// and one history entry per pause, not per keystroke. Pasted markup becomes text; a link
// that is not http(s) is refused with a sentence.

beforeAll(stubLayout);

const BIO = { id: "bioaaaaaaaaa", type: "bio", content: { paragraphs: [] } } satisfies Block;

/** The `RichText` the last `set_field content` carried. */
function lastContent(ops: EditOperation[]): RichText {
  const op = ops.findLast((candidate) => candidate.op === "set_field");
  if (op === undefined || op.op !== "set_field") throw new Error("no set_field was dispatched");
  return RichTextSchema.parse(op.value);
}

async function openBio(ops: EditOperation[]): Promise<HTMLElement> {
  render(<EditorHarness block={BIO} onApply={(op) => ops.push(op)} />);
  const box = await screen.findByRole("textbox", { name: "Bio" });
  box.focus();
  return box;
}

describe("BioEditor", () => {
  it("names the kicker by the cat's recorded sex — she, he, then they when unset (F41)", async () => {
    const female = render(<EditorHarness block={BIO} sex="female" />);
    expect(await screen.findByText("Who she is")).toBeInTheDocument();
    female.unmount();

    const male = render(<EditorHarness block={BIO} sex="male" />);
    expect(await screen.findByText("Who he is")).toBeInTheDocument();
    male.unmount();

    render(<EditorHarness block={BIO} />);
    expect(await screen.findByText("Who they are")).toBeInTheDocument();
  });

  it("emits RichText — never Tiptap JSON — once per pause, on the bio's content path", async () => {
    const ops: EditOperation[] = [];
    const box = await openBio(ops);
    await typeInto(box, "Char");
    await typeInto(box, "lotte");
    expect(ops).toHaveLength(0);
    await settle();
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op).toMatchObject({
      op: "set_field",
      target: { kind: "block", blockId: BIO.id },
      path: "content",
    });
    if (op?.op !== "set_field") throw new Error("expected a set_field");
    expect(op.value).not.toHaveProperty("type");
    expect(RichTextSchema.safeParse(op.value).success).toBe(true);
    expect(lastContent(ops)).toEqual({ paragraphs: [{ runs: [{ text: "Charlotte" }] }] });
  });

  it("turns pasted markup into text: a heading is a paragraph, a script tag is nothing or words", async () => {
    const ops: EditOperation[] = [];
    const box = await openBio(ops);
    await pasteInto(box, {
      "text/html": "<h1>Hi</h1><p><script>alert(1)</script>ok <b>bold</b></p>",
    });
    await settle();
    const html = lastContent(ops);
    expect(html.paragraphs).toEqual([
      { runs: [{ text: "Hi" }] },
      { runs: [{ text: "ok " }, { text: "bold", bold: true }] },
    ]);
    await pasteInto(box, { "text/plain": "<script>alert(1)</script>" });
    await settle();
    const plain = lastContent(ops);
    const texts = plain.paragraphs.flatMap((p) => p.runs.map((run) => run.text)).join("");
    expect(texts).toContain("<script>alert(1)</script>");
    expect(document.querySelector("script")).toBeNull();
  });

  it("bolds and italicises the selection from the toolbar, by keyboard", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    const box = await openBio(ops);
    await typeInto(box, "Bold cat");
    await selectFirst(box, 4);
    // Space, not Enter: the button hands focus to the editor on activation, and
    // user-event then delivers the rest of an Enter press to the editor — a browser
    // does not — where it would split the paragraph.
    const bold = screen.getByRole("button", { name: "Bold" });
    bold.focus();
    await user.keyboard(" ");
    await nextFrame();
    expect(bold).toHaveAttribute("aria-pressed", "true");
    expect(box).toHaveFocus();
    screen.getByRole("button", { name: "Italic" }).focus();
    await user.keyboard(" ");
    await nextFrame();
    await settle();
    expect(lastContent(ops)).toEqual({
      paragraphs: [{ runs: [{ text: "Bold", bold: true, italic: true }, { text: " cat" }] }],
    });
  });

  it("links the selection to an http(s) address and refuses anything else with a sentence", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    const box = await openBio(ops);
    await typeInto(box, "See more");
    await selectFirst(box, 3);
    await user.click(screen.getByRole("button", { name: "Link" }));
    const address = screen.getByRole("textbox", { name: "Link address" });
    expect(address).toHaveFocus();
    await user.type(address, "javascript:alert(1){Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Links must start with http:// or https://.",
    );
    await settle();
    // Leaving the editor for the toolbar sent the words; nothing sent carries a link.
    expect(lastContent(ops)).toEqual({ paragraphs: [{ runs: [{ text: "See more" }] }] });
    await user.clear(address);
    await user.type(address, "https://example.org/cats{Enter}");
    expect(screen.queryByRole("textbox", { name: "Link address" })).toBeNull();
    await settle();
    expect(lastContent(ops)).toEqual({
      paragraphs: [
        { runs: [{ text: "See", href: "https://example.org/cats" }, { text: " more" }] },
      ],
    });
    // The link is on the page as an anchor, never as an HTML string.
    expect(screen.getByRole("link", { name: "See" })).toHaveAttribute(
      "href",
      "https://example.org/cats",
    );
  });

  it("removes a link from the selection", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    const box = await openBio(ops);
    await typeInto(box, "See more");
    await selectFirst(box, 3);
    await user.click(screen.getByRole("button", { name: "Link" }));
    await user.type(screen.getByRole("textbox", { name: "Link address" }), "https://a.b{Enter}");
    await settle();
    await selectFirst(box, 2);
    await user.click(screen.getByRole("button", { name: "Link" }));
    await user.click(screen.getByRole("button", { name: "Remove link" }));
    await settle();
    expect(lastContent(ops)).toEqual({ paragraphs: [{ runs: [{ text: "See more" }] }] });
  });
});

describe("BioEditor after an outside change", () => {
  it("shows the document's words after an undo and sends nothing on the next pause or blur", async () => {
    const ops: EditOperation[] = [];
    const noop = () => undefined;
    const props = {
      labelId: "l",
      assets: [],
      catName: "Charlotte",
      onApply: (op: EditOperation) => ops.push(op),
      describe: () => ({ summary: "", destructive: false, detail: "" }),
      onOpenTrim: noop,
      onEnhance: () => Promise.resolve(false),
      onDuplicate: noop,
      onRemove: noop,
      onAskHelper: noop,
    };
    const written: RichText = { paragraphs: [{ runs: [{ text: "Written" }] }] };
    const { rerender } = render(<BlockBody {...props} block={{ ...BIO, content: written }} />);
    const box = await screen.findByRole("textbox", { name: "Bio" });
    box.focus();
    await typeInto(box, " more");
    await settle();
    expect(lastContent(ops)).toEqual({ paragraphs: [{ runs: [{ text: "Written more" }] }] });
    // The edit landed, then was undone: the document is back at the base.
    rerender(<BlockBody {...props} block={{ ...BIO, content: lastContent(ops) }} />);
    rerender(<BlockBody {...props} block={{ ...BIO, content: written }} />);
    expect(box).toHaveTextContent("Written");
    expect(box).not.toHaveTextContent("Written more");
    box.blur();
    await settle();
    expect(ops).toHaveLength(1);
  });
});

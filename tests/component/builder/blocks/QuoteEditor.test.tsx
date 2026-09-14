import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import { block, EditorHarness, settle } from "./harness";
import { CAT } from "../media-fixtures";

// The quote editor (T025; FR-016): one photo, the foster's line of at most 200 characters
// and an optional attribution of at most 60, shown over the photo's scrim as they will
// publish and typed in two labelled fields beneath it.

const QUOTE = block("quote", "quoteaaaaaaa");

describe("QuoteEditor", () => {
  it("names the attribution placeholder by the cat's recorded sex — F41", () => {
    const female = render(<EditorHarness block={QUOTE} assets={[CAT]} sex="female" />);
    expect(screen.getByRole("textbox", { name: "Attribution" })).toHaveAttribute(
      "placeholder",
      "Her foster",
    );
    female.unmount();

    const male = render(<EditorHarness block={QUOTE} assets={[CAT]} sex="male" />);
    expect(screen.getByRole("textbox", { name: "Attribution" })).toHaveAttribute(
      "placeholder",
      "His foster",
    );
    male.unmount();

    render(<EditorHarness block={QUOTE} assets={[CAT]} />);
    expect(screen.getByRole("textbox", { name: "Attribution" })).toHaveAttribute(
      "placeholder",
      "Their foster",
    );
  });

  it("offers the slot, the line and the attribution with their caps", () => {
    render(<EditorHarness block={QUOTE} assets={[CAT]} />);
    expect(screen.getByRole("button", { name: "Pick a photo" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Quote" })).toHaveAttribute("maxLength", "200");
    expect(screen.getByRole("textbox", { name: "Attribution" })).toHaveAttribute("maxLength", "60");
    expect(screen.getByRole("button", { name: "duplicate" })).toBeInTheDocument();
  });

  it("places its photo from the keyboard as one replace_image (keyboard path)", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={QUOTE} assets={[CAT]} onApply={(op) => ops.push(op)} />);
    screen.getByRole("button", { name: "Pick a photo" }).focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Pick a photo" });
    within(dialog).getByRole("button", { name: "A tabby cat on a windowsill., cat-1.jpg" }).focus();
    await user.keyboard(" ");
    within(dialog).getByRole("button", { name: "Use photo" }).focus();
    await user.keyboard("{Enter}");
    expect(ops).toEqual([{ op: "replace_image", blockId: QUOTE.id, mediaId: CAT.id }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("writes the line and the attribution to their paths and shows them over the photo", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={QUOTE} assets={[CAT]} onApply={(op) => ops.push(op)} />);
    await user.type(
      screen.getByRole("textbox", { name: "Quote" }),
      "A negotiator, not a complainer.",
    );
    await settle();
    expect(ops.at(-1)).toEqual({
      op: "set_field",
      target: { kind: "block", blockId: QUOTE.id },
      path: "text",
      value: "A negotiator, not a complainer.",
    });
    await user.type(screen.getByRole("textbox", { name: "Attribution" }), "Her foster{Enter}");
    expect(ops.at(-1)).toMatchObject({ path: "attribution", value: "Her foster" });
    expect(screen.getByText("A negotiator, not a complainer.", { selector: "p" })).toBeVisible();
    expect(screen.getByText("Her foster", { selector: "p" })).toBeVisible();
  });
});

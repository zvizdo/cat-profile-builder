import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import { EditorHarness, settle } from "./harness";
import { CAT } from "../media-fixtures";

// The photo editor (T025; FR-016): one slot and an optional caption of at most 200
// characters, written as `set_field caption` once the typing pauses or the field is left.

const PHOTO = { id: "photoaaaaaaa", type: "photo", mediaId: null } satisfies Block;

describe("PhotoEditor", () => {
  it("offers the slot, the caption with its cap, duplicate and remove", () => {
    render(<EditorHarness block={PHOTO} assets={[CAT]} />);
    expect(screen.getByRole("button", { name: "Pick a photo" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Caption" })).toHaveAttribute("maxLength", "200");
    expect(screen.getByText("PHOTO · one photo, optional caption")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "remove" })).toBeInTheDocument();
  });

  it("writes the caption once, after the typing pauses, and again when the field is left", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(
      <EditorHarness
        block={{ ...PHOTO, mediaId: CAT.id }}
        assets={[CAT]}
        onApply={(op) => ops.push(op)}
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", CAT.cleanUrl);
    const caption = screen.getByRole("textbox", { name: "Caption" });
    await user.type(caption, "On the sill");
    expect(ops).toHaveLength(0);
    await settle();
    expect(ops).toEqual([
      {
        op: "set_field",
        target: { kind: "block", blockId: PHOTO.id },
        path: "caption",
        value: "On the sill",
      },
    ]);
    await user.type(caption, ", waiting.");
    await user.tab();
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({ path: "caption", value: "On the sill, waiting." });
    await settle();
    // Leaving the field committed it; the pause afterwards has nothing new to send.
    expect(ops).toHaveLength(2);
  });

  it("moves focus to the slot's replace photo chip after a keyboard pick fills it", async () => {
    const user = userEvent.setup();
    render(<EditorHarness block={PHOTO} assets={[CAT]} />);
    screen.getByRole("button", { name: "Pick a photo" }).focus();
    await user.keyboard("{Enter}");
    screen.getByRole("button", { name: "A tabby cat on a windowsill., cat-1.jpg" }).focus();
    await user.keyboard("{Enter}");
    screen.getByRole("button", { name: "Use photo" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("img")).toHaveAttribute("src", CAT.cleanUrl);
    expect(screen.getByRole("button", { name: "replace photo" })).toHaveFocus();
  });
});

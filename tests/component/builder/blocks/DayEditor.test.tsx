import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import { block, EditorHarness, settle } from "./harness";
import { CAT } from "../media-fixtures";

// The "A day in her life" editor (T025; FR-016): exactly three scenes, each a photo slot
// and a caption of at most 120 characters — no scene can be added or removed, so the
// section can never hold two. Each pick is a `replace_image` with the scene's slot; each
// caption is a `set_field` on `scenes.N.caption`.

const DAY = block("day", "dayaaaaaaaaa");

describe("DayEditor", () => {
  it("always has three scenes and no way to add or remove one", () => {
    render(<EditorHarness block={DAY} assets={[CAT]} />);
    expect(screen.getAllByText("drop a photo")).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole("button", { name: `Pick a photo for scene ${n}` })).toBeVisible();
      expect(screen.getByRole("textbox", { name: `Scene ${n} caption` })).toHaveAttribute(
        "maxLength",
        "120",
      );
    }
    expect(screen.queryByRole("button", { name: /add scene/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove scene/i })).toBeNull();
  });

  it("places a photo in scene 2 from the keyboard as replace_image slot 1", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={DAY} assets={[CAT]} onApply={(op) => ops.push(op)} />);
    screen.getByRole("button", { name: "Pick a photo for scene 2" }).focus();
    await user.keyboard("{Enter}");
    screen.getByRole("button", { name: "A tabby cat on a windowsill., cat-1.jpg" }).focus();
    await user.keyboard("{Enter}");
    screen.getByRole("button", { name: "Use photo" }).focus();
    await user.keyboard("{Enter}");
    expect(ops).toEqual([{ op: "replace_image", blockId: DAY.id, mediaId: CAT.id, slot: 1 }]);
    expect(screen.getAllByText("drop a photo")).toHaveLength(2);
  });

  it("writes a caption to its scene's path, once the typing pauses", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={DAY} assets={[CAT]} onApply={(op) => ops.push(op)} />);
    await user.type(screen.getByRole("textbox", { name: "Scene 3 caption" }), "Breakfast first.");
    expect(ops).toHaveLength(0);
    await settle();
    expect(ops).toEqual([
      {
        op: "set_field",
        target: { kind: "block", blockId: DAY.id },
        path: "scenes.2.caption",
        value: "Breakfast first.",
      },
    ]);
  });
});

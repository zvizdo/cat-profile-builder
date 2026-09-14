import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { EditorHarness } from "./harness";
import { photo } from "../media-fixtures";

// The gallery editor (T025; hi-fi 3a `GALLERY · 3 of up to 12`): up to twelve photos in
// a grid, `add photos` as a multi-pick over the library, Move left / Move right as one
// `set_field mediaIds` with the new order, per-photo remove that asks first because
// `describeOperation` calls it destructive, and a thirteenth refused by the core with
// its sentence — the editor holds no cap of its own.

const IDS = "abcdefghijklm".split("").map((letter) => `maaaaaa${letter}`);
const LIBRARY: AssetView[] = IDS.map((id, i) =>
  photo(id, `cat-${i + 1}.jpg`, { alt: { text: `Photo ${i + 1}`, source: "model" } }),
);
const GALLERY = { id: "galleryaaaaa", type: "gallery", mediaIds: [] } satisfies Block;

function full(count: number) {
  return { ...GALLERY, mediaIds: IDS.slice(0, count) };
}

function lastIds(ops: EditOperation[]): unknown {
  const op = ops.at(-1);
  return op?.op === "set_field" ? op.value : undefined;
}

describe("GalleryEditor", () => {
  it("starts as one row of striped slots with the first one pickable", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={GALLERY} assets={LIBRARY} onApply={(op) => ops.push(op)} />);
    expect(screen.getAllByText("drop a photo")).toHaveLength(4);
    expect(screen.getByText("GALLERY · 0 of up to 12")).toBeInTheDocument();
    // F28 review #12: the pickable cell's mono label is the button — one line, not the
    // label plus a separate "Pick a photo" link.
    expect(screen.queryByText("Pick a photo")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Pick a photo" }));
    await user.click(screen.getByRole("button", { name: /^Photo 3,/ }));
    await user.click(screen.getByRole("button", { name: "Use photo" }));
    expect(ops).toEqual([{ op: "replace_image", blockId: GALLERY.id, mediaId: IDS[2], slot: 0 }]);
    expect(screen.getByText("GALLERY · 1 of up to 12")).toBeInTheDocument();
  });

  it("adds several photos at once as one set_field with the whole list", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={full(1)} assets={LIBRARY} onApply={(op) => ops.push(op)} />);
    screen.getByRole("button", { name: "add photos" }).focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Add photos" });
    await user.click(within(dialog).getByRole("button", { name: /^Photo 2,/ }));
    await user.click(within(dialog).getByRole("button", { name: /^Photo 4,/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add 2 photos" }));
    expect(lastIds(ops)).toEqual([IDS[0], IDS[1], IDS[3]]);
    expect(screen.getByText("GALLERY · 3 of up to 12")).toBeInTheDocument();
  });

  it("refuses a thirteenth photo with the core's sentence and keeps the twelve", async () => {
    const user = userEvent.setup();
    render(<EditorHarness block={full(12)} assets={LIBRARY} />);
    await user.click(screen.getByRole("button", { name: "add photos" }));
    await user.click(screen.getByRole("button", { name: /^Photo 13,/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 photo" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That value doesn't fit the gallery photos.",
    );
    expect(screen.getByText("GALLERY · 12 of up to 12")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(12);
  });

  it("moves a photo left or right as one set_field with the new order", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={full(3)} assets={LIBRARY} onApply={(op) => ops.push(op)} />);
    const slots = screen.getAllByRole("listitem");
    expect(within(slots[0]!).getByRole("button", { name: "Move left" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    within(slots[1]!).getByRole("button", { name: "Move right" }).focus();
    await user.keyboard("{Enter}");
    expect(lastIds(ops)).toEqual([IDS[0], IDS[2], IDS[1]]);
    const after = screen.getAllByRole("listitem");
    expect(within(after[2]!).getByRole("img")).toHaveAttribute("alt", "Photo 2");
    expect(within(after[2]!).getByRole("button", { name: "Move right" })).toHaveFocus();
  });

  it("asks before taking a photo off the page, in the core's words", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={full(2)} assets={LIBRARY} onApply={(op) => ops.push(op)} />);
    const [first] = screen.getAllByRole("listitem");
    await user.click(within(first!).getByRole("button", { name: "Remove photo" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this photo from the gallery?" });
    expect(dialog).toHaveTextContent("Changing the gallery takes one photo off Charlotte's page.");
    await user.keyboard("{Escape}");
    expect(ops).toHaveLength(0);
    await user.click(within(first!).getByRole("button", { name: "Remove photo" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(lastIds(ops)).toEqual([IDS[1]]);
  });

  it("still moves photos and adds more when one id is no longer in the library", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    const lost = { ...GALLERY, mediaIds: [IDS[0]!, "mgoneaaa", IDS[1]!] };
    render(<EditorHarness block={lost} assets={LIBRARY} onApply={(op) => ops.push(op)} />);
    const [, missing] = screen.getAllByRole("listitem");
    expect(within(missing!).getByText("photo missing — pick another")).toBeInTheDocument();
    await user.click(within(missing!).getByRole("button", { name: "Move right" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(lastIds(ops)).toEqual([IDS[0], IDS[1], "mgoneaaa"]);
    await user.click(screen.getByRole("button", { name: "add photos" }));
    const dialog = screen.getByRole("dialog", { name: "Add photos" });
    // Photos already on the page are not offered again.
    expect(within(dialog).queryByRole("button", { name: /^Photo 1,/ })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /^Photo 5,/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add 1 photo" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(lastIds(ops)).toEqual([IDS[0], IDS[1], "mgoneaaa", IDS[4]]);
    expect(screen.getByText("GALLERY · 4 of up to 12")).toBeInTheDocument();
  });
});

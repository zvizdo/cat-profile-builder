import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import { CanvasHarness, DOC, frameOrder, GALLERY, VIDEO } from "./canvas-fixtures";

// The canvas (FR-021, FR-022; ADR-010): the label, one frame per section in document
// order, Move up / Move down that keep focus on the pressed button, remove that asks and
// names what leaves, the keyboard drag that produces one `reorder_blocks`, and the striped
// `+ add section` tile that ends the stack.

function frame(name: RegExp) {
  return screen.getByRole("region", { name });
}

// dnd-kit reads layout from the DOM; jsdom has none. Each frame is given a 100px-tall box
// at its position in the stack so the keyboard sensor can find the neighbour above.
function layoutFrames() {
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const frame = this.closest("[data-block-type]");
    if (frame === null) return original.call(this);
    const frames = Array.from(document.querySelectorAll("[data-block-type]"));
    const top = frames.indexOf(frame) * 100;
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      width: 600,
      height: 100,
      bottom: top + 100,
      right: 600,
    } as DOMRect;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Canvas", () => {
  it("shows the label and one frame per section in order, then the add tile", () => {
    render(<CanvasHarness />);
    expect(
      screen.getByText("CANVAS · vertical stack, full-width sections only"),
    ).toBeInTheDocument();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
    expect(screen.getByRole("button", { name: "+ add section" })).toBeInTheDocument();
  });

  it("shows only the add tile on an empty page", () => {
    render(<CanvasHarness initial={{ ...DOC, blocks: [] }} />);
    expect(frameOrder()).toEqual([]);
    expect(screen.getByRole("button", { name: "+ add section" })).toBeInTheDocument();
  });

  it("Move up reorders through one reorder_blocks and keeps focus on the button", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<CanvasHarness onApply={(op) => ops.push(op)} />);
    const gallery = frame(/GALLERY/);
    const moveUp = within(gallery).getByRole("button", { name: "Move up" });
    moveUp.focus();
    await user.keyboard("{Enter}");
    expect(ops).toEqual([
      { op: "reorder_blocks", order: [DOC.blocks[0]?.id, GALLERY, DOC.blocks[1]?.id, VIDEO] },
    ]);
    expect(frameOrder()).toEqual(["hero", "gallery", "bio", "video"]);
    expect(within(frame(/GALLERY/)).getByRole("button", { name: "Move up" })).toHaveFocus();
  });

  it("Move down on the last frame and Move up on the first sortable frame change nothing (the hero has no move controls, F1)", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<CanvasHarness onApply={(op) => ops.push(op)} />);
    expect(within(frame(/HERO/)).queryByRole("button", { name: "Move up" })).toBeNull();
    expect(within(frame(/HERO/)).queryByRole("button", { name: "Move down" })).toBeNull();
    const up = within(frame(/BIO/)).getByRole("button", { name: "Move up" });
    expect(up).toHaveAttribute("aria-disabled", "true");
    up.focus();
    await user.keyboard("{Enter}");
    const down = within(frame(/VIDEO/)).getByRole("button", { name: "Move down" });
    expect(down).toHaveAttribute("aria-disabled", "true");
    down.focus();
    await user.keyboard("{Enter}");
    expect(ops).toEqual([]);
    expect(down).toHaveFocus();
  });

  it("remove asks first, naming what leaves; Escape keeps; confirming removes", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<CanvasHarness onApply={(op) => ops.push(op)} />);
    await user.click(within(frame(/GALLERY/)).getByRole("button", { name: "remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove the gallery?" });
    expect(dialog).toHaveTextContent(
      "Removing the gallery takes it off Charlotte's page. One undo brings the section back.",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ops).toEqual([]);
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
    await user.click(within(frame(/GALLERY/)).getByRole("button", { name: "remove" }));
    await user.click(screen.getByRole("button", { name: "Remove section" }));
    expect(ops).toEqual([{ op: "remove_block", blockId: GALLERY }]);
    expect(frameOrder()).toEqual(["hero", "bio", "video"]);
  });

  it("duplicate hands the block id up, and the hero has no duplicate", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    render(<CanvasHarness onDuplicate={onDuplicate} />);
    expect(within(frame(/HERO/)).queryByRole("button", { name: "duplicate" })).toBeNull();
    await user.click(within(frame(/GALLERY/)).getByRole("button", { name: "duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith(GALLERY);
  });

  it("the add tile opens the section picker (F2)", async () => {
    const user = userEvent.setup();
    render(<CanvasHarness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ add section" }));
    expect(screen.getByRole("dialog", { name: "Add a section" })).toBeInTheDocument();
  });

  it("a keyboard drag — space, arrow up, space — is one reorder_blocks with the whole order", async () => {
    layoutFrames();
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<CanvasHarness onApply={(op) => ops.push(op)} />);
    const handle = within(frame(/VIDEO/)).getByRole("button", { name: "Drag to reorder" });
    handle.focus();
    await user.keyboard("[Space]");
    await user.keyboard("[ArrowUp]");
    await user.keyboard("[Space]");
    expect(ops).toEqual([
      { op: "reorder_blocks", order: [DOC.blocks[0]?.id, DOC.blocks[1]?.id, VIDEO, GALLERY] },
    ]);
    expect(frameOrder()).toEqual(["hero", "bio", "video", "gallery"]);
  });

  it("a keyboard drag dropped where it started changes nothing", async () => {
    layoutFrames();
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<CanvasHarness onApply={(op) => ops.push(op)} />);
    within(frame(/VIDEO/)).getByRole("button", { name: "Drag to reorder" }).focus();
    await user.keyboard("[Space]");
    await user.keyboard("[Space]");
    expect(ops).toEqual([]);
  });

  it("a touch drag — press and hold, move up, lift — is one reorder_blocks (FR-022 on tablets)", async () => {
    layoutFrames();
    vi.useFakeTimers();
    try {
      const ops: EditOperation[] = [];
      render(<CanvasHarness onApply={(op) => ops.push(op)} />);
      const handle = within(frame(/VIDEO/)).getByRole("button", { name: "Drag to reorder" });
      expect(handle).toHaveClass("touch-none");
      const at = (y: number) => ({ touches: [{ clientX: 20, clientY: y }] });
      fireEvent.touchStart(handle, at(350));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      // dnd-kit listens on the handle itself, so the finger's moves are fired there.
      fireEvent.touchMove(handle, at(340));
      fireEvent.touchMove(handle, at(250));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      fireEvent.touchEnd(handle, { changedTouches: [{ clientX: 20, clientY: 250 }] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(ops).toEqual([
        { op: "reorder_blocks", order: [DOC.blocks[0]?.id, DOC.blocks[1]?.id, VIDEO, GALLERY] },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces the drag in the shelter's voice", async () => {
    layoutFrames();
    const user = userEvent.setup();
    render(<CanvasHarness />);
    within(frame(/VIDEO/)).getByRole("button", { name: "Drag to reorder" }).focus();
    await user.keyboard("[Space]");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Picked up the video section. Use the arrow keys to move it, space to drop, escape to cancel.",
    );
    await user.keyboard("[ArrowUp]");
    expect(screen.getByRole("status")).toHaveTextContent(
      "The video section is over position 2 of 3.",
    );
    await user.keyboard("[Escape]");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cancelled. The video section is back where it was.",
    );
  });
});

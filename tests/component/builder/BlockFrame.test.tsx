import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Block } from "@/core/profile/schema";
import { BlockFrame } from "@/ui/builder/BlockFrame";
import { block } from "./canvas-fixtures";

// One frame (hi-fi 3a; CONTENT.md → Block labels, placeholders): the type label in mono,
// the editor's empty body for a section with nothing in it yet, the actions in the tap
// floor, and the drag handle with its name.

function renderFrame(b: Block, props: Partial<Parameters<typeof BlockFrame>[0]> = {}) {
  const handlers = {
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onApply: vi.fn(),
    onOpenTrim: vi.fn(),
    onEnhance: vi.fn(() => Promise.resolve(false)),
    onAskHelper: vi.fn(),
  };
  render(
    <DndContext>
      <SortableContext items={[b.id]}>
        <ol>
          <BlockFrame
            block={b}
            index={1}
            count={3}
            catName="Charlotte"
            assets={[]}
            describe={() => ({ summary: "", destructive: false, detail: "" })}
            {...handlers}
            {...props}
          />
        </ol>
      </SortableContext>
    </DndContext>,
  );
  return handlers;
}

describe("BlockFrame", () => {
  it("is a region named by its label with every action named", () => {
    renderFrame(block("gallery", "galleryaaaaa"));
    const frame = screen.getByRole("region", { name: "GALLERY · 0 of up to 12" });
    for (const name of ["Drag to reorder", "Move up", "Move down", "duplicate", "remove"]) {
      expect(within(frame).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("keeps the label row and the handle column on the chrome's colours whatever theme the frame wears", () => {
    renderFrame(block("gallery", "galleryaaaaa"));
    // The row holds the label and the actions; `theme-chrome` takes the tokens back so
    // the clay `remove` and the blue actions keep 4.5:1 on Sand and Night.
    const row = screen.getByRole("button", { name: "remove" }).parentElement?.parentElement;
    expect(row).toHaveClass("theme-chrome", "bg-paper");
    expect(row).toContainElement(screen.getByText("GALLERY · 0 of up to 12"));
    // The handle column is the same chrome surface, so the two tool edges are one.
    const column = screen.getByRole("button", { name: "Drag to reorder" }).parentElement;
    expect(column).toHaveClass("theme-chrome", "bg-paper", "border-r", "border-line-chrome");
    expect(column).toContainElement(screen.getByRole("button", { name: "Move down" }));
  });

  it("shows a striped slot with the cat's name for an empty hero", () => {
    renderFrame(block("hero", "heroaaaaaaaa"));
    expect(screen.getByText("drop a photo")).toBeInTheDocument();
    expect(screen.getByText("Charlotte")).toBeInTheDocument();
  });

  it("names the video slot as a clip and the day section as three scenes", () => {
    renderFrame(block("video", "videoaaaaaaa"));
    expect(screen.getByText("drop a clip")).toBeInTheDocument();
  });

  it("marks the ends of the stack with aria-disabled, never disabled, so focus can stay", () => {
    renderFrame(block("bio", "bioaaaaaaaaa"), { index: 0, count: 1 });
    const up = screen.getByRole("button", { name: "Move up" });
    const down = screen.getByRole("button", { name: "Move down" });
    expect(up).toHaveAttribute("aria-disabled", "true");
    expect(down).toHaveAttribute("aria-disabled", "true");
    expect(up).not.toBeDisabled();
    expect(down).not.toBeDisabled();
  });

  it("Tab walks handle → Move up → Move down → duplicate → remove; Enter and Space fire each (keyboard path)", async () => {
    const user = userEvent.setup();
    const handlers = renderFrame(block("bio", "bioaaaaaaaaa"));
    await user.tab();
    expect(screen.getByRole("button", { name: "Drag to reorder" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Move up" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(handlers.onMoveUp).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "Move down" })).toHaveFocus();
    await user.keyboard(" ");
    expect(handlers.onMoveDown).toHaveBeenCalledTimes(1);
    // The editor's own controls sit between the label row and the action row.
    const duplicate = screen.getByRole("button", { name: "duplicate" });
    duplicate.focus();
    await user.keyboard("{Enter}");
    expect(handlers.onDuplicate).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "remove" })).toHaveFocus();
    await user.keyboard(" ");
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
  });

  it("calls the handlers", () => {
    const handlers = renderFrame(block("bio", "bioaaaaaaaaa"));
    screen.getByRole("button", { name: "Move up" }).click();
    screen.getByRole("button", { name: "Move down" }).click();
    screen.getByRole("button", { name: "duplicate" }).click();
    screen.getByRole("button", { name: "remove" }).click();
    expect(handlers.onMoveUp).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveDown).toHaveBeenCalledTimes(1);
    expect(handlers.onDuplicate).toHaveBeenCalledTimes(1);
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
  });

  // F34 ("follow, then overview"): the helper's touch is a two-pulse blink of the blue
  // focus ring drawn over the frame — never a background fill — and a mono tag on the
  // label row that stays until the volunteer's next edit. Both are the frame's to draw
  // and the builder's to decide (`useFollowHelper`); the frame itself only shows what it
  // is told.
  describe("the helper's touch (F34)", () => {
    it("blinks the blue ring over the frame while `pulse` is set, and draws none otherwise", () => {
      const { unmount } = render(<Frame b={block("bio", "bioaaaaaaaaa")} pulse={1} />);
      const frame = screen.getByRole("region", { name: /^BIO/ });
      const ring = frame.querySelector("[data-pulse-ring]");
      expect(ring).toHaveClass("pulse-ring", "outline-blue");
      expect(ring).toHaveAttribute("aria-hidden", "true");
      expect(frame).not.toHaveClass("bg-blue-whisper");
      unmount();
      render(<Frame b={block("bio", "bioaaaaaaaaa")} />);
      expect(
        screen.getByRole("region", { name: /^BIO/ }).querySelector("[data-pulse-ring]"),
      ).toBeNull();
    });

    it("re-runs the blink when the pulse count changes — a fresh ring, not the old one", () => {
      const { rerender } = render(<Frame b={block("bio", "bioaaaaaaaaa")} pulse={1} />);
      const first = screen.getByRole("region", { name: /^BIO/ }).querySelector("[data-pulse-ring]");
      rerender(<Frame b={block("bio", "bioaaaaaaaaa")} pulse={2} />);
      const second = screen
        .getByRole("region", { name: /^BIO/ })
        .querySelector("[data-pulse-ring]");
      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
    });

    it("wears the `CATalyst · just now` tag on its label row while `touched`, outside the region's own name", () => {
      render(<Frame b={block("bio", "bioaaaaaaaaa")} touched />);
      const frame = screen.getByRole("region", { name: "BIO · paragraphs, bold, italic, links" });
      const tag = within(frame).getByText("CATalyst · just now");
      const label = within(frame).getByText("BIO · paragraphs, bold, italic, links");
      expect(tag.parentElement).toBe(label.parentElement);
    });

    it("carries no tag once `touched` is withdrawn (the volunteer's next edit)", () => {
      const { rerender } = render(<Frame b={block("bio", "bioaaaaaaaaa")} touched />);
      expect(screen.getByText("CATalyst · just now")).toBeInTheDocument();
      rerender(<Frame b={block("bio", "bioaaaaaaaaa")} touched={false} />);
      expect(screen.queryByText("CATalyst · just now")).toBeNull();
    });
  });
});

/** A frame in its sortable context, re-renderable with new props. */
function Frame({ b, ...props }: { b: Block } & Partial<Parameters<typeof BlockFrame>[0]>) {
  return (
    <DndContext>
      <SortableContext items={[b.id]}>
        <ol>
          <BlockFrame
            block={b}
            index={1}
            count={3}
            catName="Charlotte"
            assets={[]}
            describe={() => ({ summary: "", destructive: false, detail: "" })}
            onMoveUp={vi.fn()}
            onMoveDown={vi.fn()}
            onDuplicate={vi.fn()}
            onRemove={vi.fn()}
            onApply={vi.fn()}
            onOpenTrim={vi.fn()}
            onEnhance={vi.fn(() => Promise.resolve(false))}
            onAskHelper={vi.fn()}
            {...props}
          />
        </ol>
      </SortableContext>
    </DndContext>
  );
}

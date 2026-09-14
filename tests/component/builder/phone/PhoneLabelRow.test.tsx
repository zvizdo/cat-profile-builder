import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "@/core/profile/schema";
import { BlockFrame, FixedHeroFrame, moveButtonId } from "@/ui/builder/BlockFrame";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { block } from "../canvas-fixtures";

// The phone's label row (design 2026-09-13 §2; QA B2): below 768px a frame draws one row
// in place of both the hidden handle column and the hover-gated action row — the kicker,
// then `↑` `↓` (what Move up / Move down dispatch), `duplicate` and `remove` as four 44px
// icon buttons that are always there. No drag handle exists on the phone at all; the
// ends of the stack are `aria-disabled`; the hero's fixed frame has none of the four.
// The editor's own actions move into the body as visible 44px buttons.

/** `matchMedia` answering the phone query for a window `width` wide. */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === PHONE_QUERY && width < 768,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const handlers = () => ({
  onMoveUp: vi.fn(),
  onMoveDown: vi.fn(),
  onDuplicate: vi.fn(),
  onRemove: vi.fn(),
  onApply: vi.fn(),
  onOpenTrim: vi.fn(),
  onEnhance: vi.fn(() => Promise.resolve(false)),
  onAskHelper: vi.fn(),
});

const shared = {
  catName: "Charlotte",
  assets: [],
  describe: () => ({ summary: "", destructive: false, detail: "" }),
};

function renderFrame(b: Block, props: Partial<Parameters<typeof BlockFrame>[0]> = {}) {
  const h = handlers();
  render(
    <DndContext>
      <SortableContext items={[b.id]}>
        <ol>
          <BlockFrame block={b} index={1} count={3} {...shared} {...h} {...props} />
        </ol>
      </SortableContext>
    </DndContext>,
  );
  return h;
}

describe("the phone label row", () => {
  beforeEach(() => stubWidth(390));
  afterEach(() => vi.unstubAllGlobals());

  it("draws the kicker with ↑ ↓ duplicate remove as 44px icon buttons, and no drag handle", () => {
    renderFrame(block("gallery", "galleryaaaaa"));
    const frame = screen.getByRole("region", { name: "GALLERY · 0 of up to 12" });
    expect(within(frame).queryByRole("button", { name: "Drag to reorder" })).toBeNull();
    for (const name of ["Move up", "Move down", "duplicate", "remove"]) {
      const button = within(frame).getByRole("button", { name });
      expect(button.className, name).toMatch(/size-44/);
    }
    // One row, on the chrome's own ground, holding the label and the four.
    const row = within(frame).getByRole("button", { name: "remove" }).closest("[data-phone-row]");
    expect(row).toHaveClass("theme-chrome", "bg-paper");
    expect(row).toContainElement(within(frame).getByText("GALLERY · 0 of up to 12"));
    // The kicker keeps to one line beside the four buttons (review, finding 8); the
    // region's accessible name is still the whole label.
    expect(within(frame).getByText("GALLERY · 0 of up to 12")).toHaveClass("truncate");
    // Exactly one of each: the desktop handle column and action row are not in the tree.
    expect(screen.getAllByRole("button", { name: "Move up" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "remove" })).toHaveLength(1);
  });

  it("↑ and ↓ dispatch the frame's moves and carry the ids the canvas refocuses by", async () => {
    const user = userEvent.setup();
    const h = renderFrame(block("bio", "bioaaaaaaaaa"));
    const up = screen.getByRole("button", { name: "Move up" });
    const down = screen.getByRole("button", { name: "Move down" });
    expect(up).toHaveAttribute("id", moveButtonId("bioaaaaaaaaa", "up"));
    expect(down).toHaveAttribute("id", moveButtonId("bioaaaaaaaaa", "down"));
    await user.click(up);
    expect(h.onMoveUp).toHaveBeenCalledTimes(1);
    await user.click(down);
    expect(h.onMoveDown).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "duplicate" }));
    expect(h.onDuplicate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "remove" }));
    expect(h.onRemove).toHaveBeenCalledTimes(1);
  });

  it("Tab walks the body's last control → ↑ → ↓ → duplicate → remove; Enter and Space fire each (keyboard path)", async () => {
    const user = userEvent.setup();
    const h = renderFrame(block("bio", "bioaaaaaaaaa"));
    // T049 part 2 (ADR-012): the phone row is its own component, so the desktop row's
    // proof (`BlockFrame.test.tsx`) does not cover it. The row sits under the body, so
    // the four come after the editor's own controls, with no handle anywhere.
    const buttons = screen.getAllByRole("button");
    const up = screen.getByRole("button", { name: "Move up" });
    expect(buttons.slice(-4).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Move up",
      "Move down",
      "duplicate",
      "remove",
    ]);
    buttons[buttons.indexOf(up) - 1]!.focus();
    await user.tab();
    expect(up).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(h.onMoveUp).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "Move down" })).toHaveFocus();
    await user.keyboard(" ");
    expect(h.onMoveDown).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "duplicate" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(h.onDuplicate).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "remove" })).toHaveFocus();
    await user.keyboard(" ");
    expect(h.onRemove).toHaveBeenCalledTimes(1);
  });

  it("disables ↑ on the first movable block and ↓ on the last with aria-disabled, keeping focus", async () => {
    const user = userEvent.setup();
    const h = renderFrame(block("bio", "bioaaaaaaaaa"), { index: 0, count: 1 });
    const up = screen.getByRole("button", { name: "Move up" });
    const down = screen.getByRole("button", { name: "Move down" });
    expect(up).toHaveAttribute("aria-disabled", "true");
    expect(down).toHaveAttribute("aria-disabled", "true");
    expect(up).not.toBeDisabled();
    await user.click(up);
    await user.click(down);
    expect(h.onMoveUp).not.toHaveBeenCalled();
    expect(h.onMoveDown).not.toHaveBeenCalled();
  });

  it("keeps the editor's own actions in the body as visible 44px buttons, not the desktop's mono links", () => {
    renderFrame(block("video", "videoaaaaaaa"));
    const body = document.querySelector("[data-block-body]") as HTMLElement;
    const replace = within(body).getByRole("button", { name: "replace clip" });
    expect(replace.className).toMatch(/min-h-44/);
    expect(replace.className).not.toMatch(/opacity-0/);
    // A bordered button at the dense chrome size (design §2; comp 7c's touch rule), never
    // the 10px mono caption the desktop row fades in on hover.
    expect(replace.className).toMatch(/border-line-button/);
    expect(replace.className).toMatch(/text-ui-dense/);
    expect(replace.className).not.toMatch(/text-mono-label/);
  });

  it("the hero's fixed frame has no ↑ ↓, no duplicate and no remove", () => {
    const h = handlers();
    render(
      <FixedHeroFrame
        block={{ id: "heroaaaaaaaa", type: "hero", mediaId: null }}
        {...shared}
        onApply={h.onApply}
        onOpenTrim={h.onOpenTrim}
        onEnhance={h.onEnhance}
        onAskHelper={h.onAskHelper}
      />,
    );
    const frame = screen.getByRole("region", { name: "HERO · full-bleed photo + name" });
    for (const name of ["Move up", "Move down", "duplicate", "remove"]) {
      expect(within(frame).queryByRole("button", { name })).toBeNull();
    }
    // F55 (S1): an empty hero's one way in is the slot itself — no `replace photo` row
    // action until a photo is placed.
    expect(within(frame).getByRole("button", { name: "Add a photo" })).toBeInTheDocument();
    expect(within(frame).queryByRole("button", { name: "replace photo" })).toBeNull();
  });
});

describe("the desktop frame is unchanged from 768px", () => {
  beforeEach(() => stubWidth(768));
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the drag handle and the text action row", () => {
    renderFrame(block("gallery", "galleryaaaaa"));
    expect(screen.getByRole("button", { name: "Drag to reorder" })).toBeInTheDocument();
    expect(document.querySelector("[data-phone-row]")).toBeNull();
    expect(screen.getByRole("button", { name: "remove" })).toHaveTextContent("remove");
  });
});

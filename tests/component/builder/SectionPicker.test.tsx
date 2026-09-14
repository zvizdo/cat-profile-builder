import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLOCK_TYPES, pickerLabel } from "@/ui/builder/block-content";
import { pickerDescription } from "@/ui/builder/section-picker-content";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { CanvasHarness, frameOrder } from "./canvas-fixtures";

// F2: the canvas's `+ add section` tile opens a picker instead of doing nothing. Driven
// through the real `Canvas` (`CanvasHarness` applies through the real `applyOperation`,
// data-model.md), since the acceptance is the whole path — the tile, the modal, the add,
// and where focus lands — not the picker's markup alone.

const scrollSpy = vi.fn();

// `readiness-scroll.ts`'s `revealTarget` (the newly added frame's focus) reads the
// reduced-motion query and calls `scrollIntoView`; jsdom has neither (PublishButton.test.tsx
// does the same). The frames also subscribe to the phone query (`useSurface`, F44), hence
// the listener methods.
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function tile() {
  return screen.getByRole("button", { name: "+ add section" });
}

async function openPicker() {
  const user = userEvent.setup();
  render(<CanvasHarness />);
  tile().focus();
  await user.keyboard("{Enter}");
  return { user, dialog: screen.getByRole("dialog", { name: "Add a section" }) };
}

describe("SectionPicker", () => {
  it("Enter on the tile opens it, naming the seven types in order and never the hero", async () => {
    const { dialog } = await openPicker();
    expect(dialog).toHaveTextContent("Pick what comes next on the page.");
    const options = within(dialog)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("data-section-option"));
    expect(options.map((button) => button.getAttribute("data-section-option"))).toEqual(
      BLOCK_TYPES,
    );
    // The Charlotte fixture has no recorded sex, so the pronoun-bearing descriptions fall
    // to the neutral, grammatical `they` (section-picker-content.ts).
    for (const [index, type] of BLOCK_TYPES.entries()) {
      expect(options[index]).toHaveTextContent(pickerLabel(type));
      expect(options[index]).toHaveTextContent(pickerDescription(type, undefined));
    }
    expect(within(dialog).queryByRole("button", { name: /^HERO/ })).toBeNull();
  });

  it("Tab and the arrow keys both walk the seven options", async () => {
    const { user, dialog } = await openPicker();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const bio = within(dialog).getByRole("button", { name: /^BIO/ });
    const photo = within(dialog).getByRole("button", { name: /^PHOTO/ });
    expect(cancel).toHaveFocus();

    await user.tab();
    expect(bio).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(photo).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(bio).toHaveFocus();
    // Wraps at the ends, same as the rail never needs to (it has no loop) but a menu does.
    await user.keyboard("{ArrowUp}");
    expect(within(dialog).getByRole("button", { name: /^QUOTE/ })).toHaveFocus();
  });

  it("leaves focus alone on any other key", async () => {
    const { user, dialog } = await openPicker();
    const bio = within(dialog).getByRole("button", { name: /^BIO/ });
    bio.focus();
    await user.keyboard("a");
    expect(bio).toHaveFocus();
  });

  it("Enter on an option adds exactly one block of that type at the end and focuses it", async () => {
    const { user, dialog } = await openPicker();
    await user.click(within(dialog).getByRole("button", { name: /^QUOTE/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video", "quote"]);
    const quoteFrame = screen.getByRole("region", { name: /QUOTE/ });
    expect(within(quoteFrame).getByRole("button", { name: "Pick a photo" })).toHaveFocus();
  });

  it("Escape closes the picker and returns focus to the tile", async () => {
    const { user } = await openPicker();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tile()).toHaveFocus();
  });

  it("Cancel does the same as Escape, and adds nothing", async () => {
    const { user, dialog } = await openPicker();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tile()).toHaveFocus();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
  });

  it("gives every option the scale's py-8, never the dead py-10 (F28 review #5)", async () => {
    const { dialog } = await openPicker();
    const options = within(dialog)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("data-section-option"));
    expect(options).toHaveLength(BLOCK_TYPES.length);
    for (const option of options) {
      expect(option.className).toMatch(/(^|\s)py-8(\s|$)/);
      expect(option.className).not.toMatch(/(^|\s)py-10(\s|$)/);
    }
  });
});

// F55 item 4 (the phone sweep, finding 4): under 768px the picker is a bottom sheet like
// the slot picker's (design 2026-09-13 §5, F45) — slid up from the window's foot, its
// seven options scrolling inside, `Cancel` pinned to the sheet's foot — not the centred
// card that stood taller than the phone's window with Cancel below the fold. From 768px
// the centred modal is unchanged.
describe("the picker on the phone", () => {
  it("under 768px is a bottom sheet with Cancel pinned", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === PHONE_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { dialog } = await openPicker();
    expect(dialog).toHaveClass("enter-sheet", "rounded-t-panel");
    expect(dialog.parentElement).toHaveClass("items-end");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel.parentElement).toHaveClass("sticky", "bottom-0");
    expect(cancel).toHaveFocus();
  });

  it("from 768px stays the centred card", async () => {
    const { dialog } = await openPicker();
    expect(dialog).toHaveClass("enter-panel", "rounded-panel");
    expect(dialog.parentElement).toHaveClass("place-items-center");
  });
});

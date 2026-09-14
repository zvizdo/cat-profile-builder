import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocument } from "@/core/profile/schema";
import { Builder } from "@/ui/builder/Builder";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { DOC, HERO } from "../canvas-fixtures";
import { CAT, CAT_NAME, photo } from "../media-fixtures";

// Placing from the block on the phone (design 2026-09-13 §5; F45): an empty slot's
// `Add a photo` (F55: its whole striped face, in the touch words), or a placed photo's `replace photo`, opens the existing picker — the
// same dialog, the same choices, `Use photo` — as a sheet from the bottom of the window
// rather than the centred card; choosing closes it and the block updates, one undo
// step. From 768px the picker stays the centred modal.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const OTHER = photo("maaaaaab", "cat-2.jpg");
const OTHER_NAME = "A tabby cat on a windowsill., cat-2.jpg";

const EMPTY_HERO: ProfileDocument = { ...DOC, blocks: [{ id: HERO, type: "hero", mediaId: null }] };
const PLACED_HERO: ProfileDocument = {
  ...DOC,
  blocks: [{ id: HERO, type: "hero", mediaId: CAT.id }],
};

function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === PHONE_QUERY && width < 768,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ updatedAt: "2026-09-11T12:00:00.000Z" })),
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

function renderBuilder(doc: ProfileDocument) {
  render(
    <Builder
      document={doc}
      assets={[CAT, OTHER]}
      publication={{ state: "draft", url: null }}
      now={doc.updatedAt}
    />,
  );
}

describe("the picker from a slot", () => {
  it("on the phone, an empty hero's Add a photo opens the picker as a bottom sheet; choosing fills the slot", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder(EMPTY_HERO);
    const hero = screen.getByRole("region", { name: /^HERO/ });
    await user.click(within(hero).getByRole("button", { name: "Add a photo" }));
    const picker = screen.getByRole("dialog", { name: "Pick a photo" });
    // The sheet shape: slid up from the bottom, square at the foot, round on top.
    expect(picker).toHaveClass("enter-sheet", "rounded-t-panel");
    expect(picker).not.toHaveClass("enter-panel");
    expect(picker.parentElement).toHaveClass("items-end");
    expect(within(picker).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(within(picker).getByRole("button", { name: CAT_NAME }));
    await user.click(within(picker).getByRole("button", { name: "Use photo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(hero).getByRole("img", { name: /tabby cat/ })).toBeInTheDocument();
    // One undo step.
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(hero).queryByRole("img")).toBeNull();
  });

  it("on the phone, replace photo opens the same sheet; Cancel and Escape leave the slot as it was", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder(PLACED_HERO);
    const hero = screen.getByRole("region", { name: /^HERO/ });
    const replace = within(hero).getByRole("button", { name: "replace photo" });
    await user.click(replace);
    const picker = screen.getByRole("dialog", { name: "Pick a photo" });
    expect(picker).toHaveClass("enter-sheet");
    expect(within(picker).getByRole("button", { name: OTHER_NAME })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replace).toHaveFocus();
    expect(within(hero).getByRole("img")).toHaveAttribute("src", expect.stringContaining(CAT.id));
  });

  it("on the phone the sheet fills the slot from the keyboard alone: Enter opens, Tab and Enter choose, Tab and Enter use (keyboard path)", async () => {
    // T049 part 2 (ADR-012): the phone's `Add a photo` face and the bottom-sheet variant
    // were only ever clicked; `PhotoSlot.test.tsx` proves the desktop modal.
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder(EMPTY_HERO);
    const hero = screen.getByRole("region", { name: /^HERO/ });
    within(hero).getByRole("button", { name: "Add a photo" }).focus();
    await user.keyboard("{Enter}");
    const picker = screen.getByRole("dialog", { name: "Pick a photo" });
    expect(within(picker).getByRole("button", { name: "Cancel" })).toHaveFocus();
    // Use photo is disabled until a choice is made, so the sheet's trap wraps Tab from
    // Cancel straight to the first photo.
    const use = within(picker).getByRole("button", { name: "Use photo" });
    expect(use).toBeDisabled();
    await user.tab();
    expect(within(picker).getByRole("button", { name: CAT_NAME })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(within(picker).getByRole("button", { name: CAT_NAME })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Now enabled: Tab walks the other photo → Cancel → Use photo, and Enter uses it.
    await user.tab();
    expect(within(picker).getByRole("button", { name: OTHER_NAME })).toHaveFocus();
    await user.tab();
    expect(within(picker).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(use).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(hero).getByRole("img", { name: /tabby cat/ })).toBeInTheDocument();
  });

  it("from 768px the picker is the centred modal", async () => {
    stubWidth(1024);
    const user = userEvent.setup();
    renderBuilder(EMPTY_HERO);
    const hero = screen.getByRole("region", { name: /^HERO/ });
    await user.click(within(hero).getByRole("button", { name: "Pick a photo" }));
    const picker = screen.getByRole("dialog", { name: "Pick a photo" });
    expect(picker).toHaveClass("enter-panel", "rounded-panel");
    expect(picker).not.toHaveClass("enter-sheet");
    expect(picker.parentElement).toHaveClass("place-items-center");
  });
});

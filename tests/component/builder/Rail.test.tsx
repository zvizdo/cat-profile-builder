import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RailHarness } from "./library-harness";

// The rail (hi-fi 3a; CONTENT.md → Rail): the seven `Add section` tiles, each adding its
// type's empty block — the hero is never one of them (F1: every profile already has one,
// mandatory and fixed at the top) — and the media library beneath.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const THEME = { preset: "paper", warmth: 0.5, contrast: 0.5 } as const;

function renderRail() {
  const onAdd = vi.fn();
  render(
    <RailHarness
      profileId="abcdefgh"
      assets={[]}
      onAdd={onAdd}
      theme={THEME}
      onTheme={vi.fn()}
      onPreviewTheme={vi.fn()}
    />,
  );
  return onAdd;
}

describe("Rail", () => {
  it("offers the seven addable section tiles under Add section, in order, the hero excluded", () => {
    renderRail();
    const group = screen.getByRole("region", { name: "Add section" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Bio", "Photo", "Gallery", "Video", "Day", "Needs", "Quote"]);
  });

  it("each tile adds its type's empty block", async () => {
    const user = userEvent.setup();
    const onAdd = renderRail();
    await user.click(screen.getByRole("button", { name: "Bio" }));
    expect(onAdd).toHaveBeenLastCalledWith({ type: "bio", content: { paragraphs: [] } });
    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(onAdd).toHaveBeenLastCalledWith({
      type: "day",
      scenes: [
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
      ],
    });
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it("the tiles are reached by Tab in order and add from Enter and Space (keyboard path)", async () => {
    const user = userEvent.setup();
    const onAdd = renderRail();
    const group = screen.getByRole("region", { name: "Add section" });
    await user.tab();
    expect(within(group).getByRole("button", { name: "Bio" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onAdd).toHaveBeenLastCalledWith({ type: "bio", content: { paragraphs: [] } });
    await user.tab();
    expect(within(group).getByRole("button", { name: "Photo" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onAdd).toHaveBeenLastCalledWith({ type: "photo", mediaId: null });
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it("has no hero tile (F1: the hero is never addable)", () => {
    renderRail();
    expect(screen.queryByRole("button", { name: "Hero" })).toBeNull();
  });

  it("holds the theme picker between the tiles and the library", () => {
    renderRail();
    expect(screen.getByRole("region", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Preset" })).toBeInTheDocument();
  });

  it("holds the media library beneath the tiles", () => {
    renderRail();
    expect(screen.getByRole("complementary", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Media · 0 items" })).toBeInTheDocument();
  });
});

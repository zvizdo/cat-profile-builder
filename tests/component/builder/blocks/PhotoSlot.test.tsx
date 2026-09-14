import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoSlot } from "@/ui/builder/PhotoSlot";
import { CAT, CLIP, photo } from "../media-fixtures";

// A media slot (T025; DESIGN.md §4 Media; the spec's missing-media edge case): striped
// with `drop a photo` while empty, striped with `photo missing — pick another` when the
// library no longer holds the id — never a broken image — and the photo on its focal point
// otherwise. Picking is a modal over the library, operable from the keyboard.

const OTHER = photo("maaaaaae", "cat-2.jpg", {
  alt: { text: "A black cat asleep in a box.", source: "volunteer" },
  focal: { x: 20, y: 70 },
});

describe("PhotoSlot", () => {
  it("is striped with the placeholder word and a pick button while empty", () => {
    render(<PhotoSlot mediaId={null} assets={[CAT]} kind="photo" onPick={() => undefined} />);
    expect(screen.getByText("drop a photo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick a photo" })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("gives the gallery's merged pick control a 44px hit area, not just its label (F51 regression)", () => {
    render(
      <PhotoSlot
        mediaId={null}
        assets={[CAT]}
        kind="photo"
        aspect="square"
        mergedPick
        onPick={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Pick a photo" })).toHaveClass("min-h-44");
  });

  it("draws the ordinary 4px corner by default and the hero's square one when asked (F28 review #10)", () => {
    const plain = render(
      <PhotoSlot mediaId={null} assets={[CAT]} kind="photo" onPick={() => undefined} />,
    );
    expect(plain.container.firstElementChild).toHaveClass("rounded-control");
    plain.unmount();
    const flush = render(
      <PhotoSlot
        mediaId={null}
        assets={[CAT]}
        kind="photo"
        radius="editorial"
        onPick={() => undefined}
      />,
    );
    expect(flush.container.firstElementChild).toHaveClass("rounded-editorial");
    expect(flush.container.firstElementChild).not.toHaveClass("rounded-control");
  });

  it("renders the missing state and no <img> for an id the library no longer holds", () => {
    render(<PhotoSlot mediaId="mgoneaaa" assets={[CAT]} kind="photo" onPick={() => undefined} />);
    expect(screen.getByText("photo missing — pick another")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Pick a photo" })).toBeInTheDocument();
  });

  it("keeps the full sentence for assistive tech on a small tile that shows only `photo missing`", () => {
    render(
      <PhotoSlot mediaId="mgoneaaa" assets={[CAT]} kind="photo" aspect="square" onPick={() => 0} />,
    );
    expect(screen.getByText("photo missing", { selector: "[aria-hidden]" })).toBeInTheDocument();
    expect(screen.getByText("photo missing — pick another")).toHaveClass("sr-only");
  });

  it("shows the clean photo on its focal point, described by its alt text, with a replace action", () => {
    render(<PhotoSlot mediaId={OTHER.id} assets={[CAT, OTHER]} kind="photo" onPick={() => 0} />);
    const img = screen.getByRole("img", { name: "A black cat asleep in a box." });
    expect(img).toHaveAttribute("src", OTHER.cleanUrl);
    expect(img).toHaveStyle({ objectPosition: "20% 70%" });
    expect(screen.getByRole("button", { name: "replace photo" })).toBeInTheDocument();
  });

  it("shows a clip's poster and offers a clip picker for a video slot", async () => {
    const user = userEvent.setup();
    render(<PhotoSlot mediaId={CLIP.id} assets={[CAT, CLIP]} kind="video" onPick={() => 0} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", CLIP.posterUrl);
    await user.click(screen.getByRole("button", { name: "replace clip" }));
    const dialog = screen.getByRole("dialog", { name: "Pick a clip" });
    expect(within(dialog).queryByRole("button", { name: /cat-1\.jpg/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /rain-day\.mov/ })).toBeInTheDocument();
  });

  it("picks a photo from the keyboard alone: Enter opens, Enter chooses, Enter uses it", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<PhotoSlot mediaId={null} assets={[CAT, OTHER]} kind="photo" onPick={onPick} />);
    screen.getByRole("button", { name: "Pick a photo" }).focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Pick a photo" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    const use = within(dialog).getByRole("button", { name: "Use photo" });
    expect(use).toBeDisabled();
    const choice = within(dialog).getByRole("button", {
      name: "A black cat asleep in a box., cat-2.jpg",
    });
    choice.focus();
    await user.keyboard("{Enter}");
    expect(choice).toHaveAttribute("aria-pressed", "true");
    use.focus();
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith(OTHER.id);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Pick a photo" })).toHaveFocus();
  });

  it("says when the library has no photo to pick, and Escape leaves the slot alone", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<PhotoSlot mediaId={null} assets={[CLIP]} kind="photo" onPick={onPick} />);
    await user.click(screen.getByRole("button", { name: "Pick a photo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "No photos in the library yet. Add one from the rail.",
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});

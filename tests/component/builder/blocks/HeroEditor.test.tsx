import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import { MediaEditors } from "@/ui/builder/MediaEditors";
import { OpenEditorProvider } from "@/ui/builder/open-editor";
import { useMediaLibrary } from "@/ui/builder/use-media-library";
import { EditorHarness } from "./harness";
import { CAT, PID, photo } from "../media-fixtures";

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  setFocalPoint: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

// The hero editor (T025; hi-fi 3a; F1): the photo slot with the cat's name over it, and
// only `replace photo` on the label row — no `duplicate`, no `remove` (the hero is
// mandatory and fixed at the top of every profile) — the pick as one `replace_image`
// with no slot.

const HERO = { id: "heroaaaaaaaa", type: "hero", mediaId: null } satisfies Block;
const OTHER = photo("maaaaaae", "cat-2.jpg", {
  alt: { text: "A black cat asleep in a box.", source: "volunteer" },
});

/**
 * The hero inside the builder's wiring for the focal point (F39): the library's
 * `openEditor` provided to the editors, and the library's own editor sheet mounted as
 * the rail mounts it.
 */
function FocalHarness({ mediaId }: { mediaId: string | null }) {
  const library = useMediaLibrary(PID, [CAT]);
  return (
    <OpenEditorProvider open={library.openEditor}>
      <EditorHarness block={{ ...HERO, mediaId }} assets={library.assets} />
      <MediaEditors profileId={PID} library={library} catName="Charlotte" />
    </OpenEditorProvider>
  );
}

describe("HeroEditor", () => {
  it("shows the cat's name over the empty slot and offers no row action while empty (F55 S1)", () => {
    render(<EditorHarness block={HERO} assets={[CAT]} />);
    expect(screen.getByText("Charlotte")).toBeInTheDocument();
    expect(screen.getByText("drop a photo")).toBeInTheDocument();
    // The face's own `Pick a photo` is the one way in: nothing to replace yet.
    expect(screen.getByRole("button", { name: "Pick a photo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "replace photo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "duplicate" })).toBeNull();
    expect(screen.queryByRole("button", { name: "remove" })).toBeNull();
    expect(screen.getByText("HERO · full-bleed photo + name")).toBeInTheDocument();
  });

  it("is full-bleed at the comp's own name size, no body inset (F28 review #10, comp 3a)", () => {
    render(<EditorHarness block={HERO} assets={[CAT]} />);
    const body = document.querySelector("[data-block-body]");
    expect(body).toHaveClass("p-0");
    expect(body).not.toHaveClass("p-16");
    const name = screen.getByText("Charlotte");
    expect(name).toHaveClass("text-hero-card-name");
    expect(name).not.toHaveClass("text-section-head");
  });

  it("places a photo from the keyboard as one replace_image without a slot", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={HERO} assets={[CAT, OTHER]} onApply={(op) => ops.push(op)} />);
    screen.getByRole("button", { name: "Pick a photo" }).focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Pick a photo" });
    within(dialog).getByRole("button", { name: "A black cat asleep in a box., cat-2.jpg" }).focus();
    await user.keyboard("{Enter}");
    within(dialog).getByRole("button", { name: "Use photo" }).focus();
    await user.keyboard("{Enter}");
    expect(ops).toEqual([{ op: "replace_image", blockId: HERO.id, mediaId: OTHER.id }]);
    const img = screen.getByRole("img", { name: "A black cat asleep in a box." });
    expect(img).toHaveAttribute("src", OTHER.cleanUrl);
    expect(screen.getByText("Charlotte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "replace photo" })).toHaveFocus();
  });

  it("hands focus to the label row's replace photo when the slot's own pick button fills the slot", async () => {
    const user = userEvent.setup();
    render(<EditorHarness block={HERO} assets={[CAT, OTHER]} />);
    screen.getByRole("button", { name: "Pick a photo" }).focus();
    await user.keyboard("{Enter}");
    await user.click(
      screen.getByRole("button", { name: "A black cat asleep in a box., cat-2.jpg" }),
    );
    await user.click(screen.getByRole("button", { name: "Use photo" }));
    expect(screen.queryByRole("button", { name: "Pick a photo" })).toBeNull();
    expect(screen.getByRole("button", { name: "replace photo" })).toHaveFocus();
  });

  it("shows the missing state when the placed photo left the library", () => {
    render(<EditorHarness block={{ ...HERO, mediaId: "mgoneaaa" }} assets={[CAT]} />);
    expect(screen.getByText("photo missing — pick another")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("opens the focal point sheet for its own photo from the label row and hands focus back (F39)", async () => {
    const user = userEvent.setup();
    render(<FocalHarness mediaId={CAT.id} />);
    const action = screen.getByRole("button", { name: "focal point" });
    action.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Where should the crop hold on?" });
    const crops = within(dialog).getByRole("group", { name: "Derived crops · live" });
    expect(within(crops).getByText("Charlotte")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(action).toHaveFocus();
  });

  it("offers no focal point while the hero has no photo, nor outside the builder's wiring", () => {
    const { unmount } = render(<FocalHarness mediaId={null} />);
    expect(screen.queryByRole("button", { name: "focal point" })).toBeNull();
    unmount();
    render(<EditorHarness block={{ ...HERO, mediaId: CAT.id }} assets={[CAT]} />);
    expect(screen.queryByRole("button", { name: "focal point" })).toBeNull();
  });
});

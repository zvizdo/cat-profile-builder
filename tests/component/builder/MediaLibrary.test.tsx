import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { EditedAsset } from "@/app/actions/_lib/media";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { LibraryHarness } from "./library-harness";
import {
  CAT,
  CAT_NAME,
  CLIP,
  CLIP_NAME,
  FAILED,
  fileInput,
  LONG,
  PID,
  photo,
} from "./media-fixtures";

// The media rail's tiles and Remove (FR-011, FR-013, FR-073, FR-076; CONTENT.md → Rail,
// Modals): one tile per record in its state, named by description, file and state;
// keyboard throughout — Tab to a tile, Enter opens it, Delete asks first, Escape keeps;
// a save or delete whose call never reaches the server says so and offers Try again.
// Uploads are in MediaLibrary.upload.test.tsx.

const actions = {
  setAltText: vi.fn<(input: unknown) => Promise<ActionResult<EditedAsset>>>(),
  deleteMedia: vi.fn<(input: unknown) => Promise<ActionResult<Record<never, never>>>>(),
};
vi.mock("@/app/actions/media", () => ({
  setAltText: (input: unknown) => actions.setAltText(input),
  deleteMedia: (input: unknown) => actions.deleteMedia(input),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const scrollSpy = vi.fn();

beforeEach(() => {
  actions.setAltText.mockReset();
  actions.deleteMedia.mockReset();
  // The media card scrolls itself into view when it opens; jsdom has no `scrollIntoView`.
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/** The names of the grid's tiles in order — the map that must not move while the card is open. */
function gridNames(): (string | null)[] {
  const isTile = (button: HTMLElement) =>
    button.hasAttribute("aria-expanded") ||
    button.getAttribute("aria-label") === "Add photos or video";
  return within(screen.getByRole("list"))
    .getAllByRole("button")
    .filter(isTile)
    .map((button) => button.getAttribute("aria-label"));
}

describe("MediaLibrary — tiles", () => {
  it("counts the items and renders a tile per record in its state, plus the add tile", () => {
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP, LONG, FAILED]} />);
    const rail = screen.getByRole("complementary", { name: "Media" });
    expect(within(rail).getByRole("heading", { name: "Media · 4 items" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CAT_NAME })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: CLIP_NAME })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "long.mp4, needs a trim" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "blurry.jpg, needs a description" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add photos or video" })).toBeInTheDocument();
    const input = fileInput();
    expect(input).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,video/mp4,video/quicktime",
    );
    expect(input).toHaveAttribute("multiple");
  });

  it("orders tiles oldest first, whatever order the store listed them in", () => {
    const later = photo("maaaaaaz", "later.jpg", { createdAt: "2026-09-11T12:00:00.000Z" });
    render(<LibraryHarness profileId={PID} assets={[later, CAT]} />);
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      CAT_NAME,
      "A tabby cat on a windowsill., later.jpg",
      "Add photos or video",
    ]);
  });

  it("says `1 item` for one and stripes a record still processing", () => {
    render(
      <LibraryHarness
        profileId={PID}
        assets={[photo("maaaaaaa", "x.jpg", { status: "processing" })]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Media · 1 item" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "A tabby cat on a windowsill., x.jpg, processing" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("opens on Enter: the description and Remove appear, and Enter again closes it", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP]} />);
    await user.tab();
    const tile = screen.getByRole("button", { name: CAT_NAME });
    expect(tile).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(tile).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "A tabby cat on a windowsill.",
    );
    expect(screen.getByText("described automatically")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove cat-1.jpg" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("saves an edited description through setAltText and shows the volunteer's note", async () => {
    const user = userEvent.setup();
    const volunteer: AssetView = {
      ...FAILED,
      alt: { text: "Charlotte on the porch.", source: "volunteer" },
      descriptionStatus: "ready",
    };
    actions.setAltText.mockResolvedValueOnce({ ok: true, asset: volunteer });
    render(<LibraryHarness profileId={PID} assets={[FAILED]} />);
    await user.click(screen.getByRole("button", { name: "blurry.jpg, needs a description" }));
    const field = screen.getByRole("textbox", { name: "Description" });
    expect(field).toHaveFocus();
    expect(field).toHaveValue("");
    expect(screen.getByText(/We couldn't write a description/)).toBeInTheDocument();
    await user.type(field, "Charlotte on the porch.{Enter}");
    expect(actions.setAltText).toHaveBeenCalledWith({
      profileId: PID,
      mediaId: "maaaaaad",
      text: "Charlotte on the porch.",
    });
    expect(await screen.findByText("written by a volunteer")).toBeInTheDocument();
    expect(screen.queryByText(/We couldn't write a description/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Charlotte on the porch., blurry.jpg" }),
    ).toBeInTheDocument();
  });

  it("names a tile by its description, then the file, then the state; the image itself stays unnamed", () => {
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP, FAILED]} />);
    expect(screen.getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CLIP_NAME })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "blurry.jpg, needs a description" }),
    ).toBeInTheDocument();
    for (const img of document.querySelectorAll("img")) expect(img).toHaveAttribute("alt", "");
  });

  it("puts the clip length before the file name on the open tile", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CLIP]} />);
    await user.click(screen.getByRole("button", { name: CLIP_NAME }));
    expect(screen.getByText("0:10 · rain-day.mov")).toBeInTheDocument();
  });

  it("says so, with Try again, when the save call itself fails; a second Enter resends", async () => {
    const user = userEvent.setup();
    actions.setAltText
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        asset: { ...CAT, alt: { text: "Asleep.", source: "volunteer" } },
      });
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    await user.click(screen.getByRole("button", { name: CAT_NAME }));
    const field = screen.getByRole("textbox", { name: "Description" });
    await user.clear(field);
    await user.type(field, "Asleep.{Enter}");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't save that.");
    expect(screen.queryByText("written by a volunteer")).not.toBeInTheDocument();
    await user.type(field, "{Enter}");
    expect(actions.setAltText).toHaveBeenCalledTimes(2);
    expect(actions.setAltText).toHaveBeenLastCalledWith({
      profileId: PID,
      mediaId: "maaaaaaa",
      text: "Asleep.",
    });
    // Leaving the field resends nothing; Try again runs the same call once more.
    await user.click(
      within(await screen.findByRole("alert")).getByRole("button", { name: "Try again" }),
    );
    expect(actions.setAltText).toHaveBeenCalledTimes(3);
    expect(await screen.findByText("written by a volunteer")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not resend an unchanged description that was already saved", async () => {
    const user = userEvent.setup();
    actions.setAltText.mockResolvedValue({
      ok: true,
      asset: { ...CAT, alt: { text: "A tabby cat on a windowsill. Asleep.", source: "volunteer" } },
    });
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    await user.click(screen.getByRole("button", { name: CAT_NAME }));
    const field = screen.getByRole("textbox", { name: "Description" });
    await user.type(field, " Asleep.{Enter}");
    await user.tab();
    await user.click(field);
    await user.type(field, "{Enter}");
    expect(actions.setAltText).toHaveBeenCalledTimes(1);
  });

  it("reports a failed save as an error toast in the action's words", async () => {
    const user = userEvent.setup();
    actions.setAltText.mockResolvedValueOnce({
      ok: false,
      error: { code: "upstream", message: "The storage service didn't respond." },
    });
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    await user.click(screen.getByRole("button", { name: CAT_NAME }));
    await user.type(screen.getByRole("textbox", { name: "Description" }), " Asleep.{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The storage service didn't respond.",
    );
  });
});

describe("MediaLibrary — the media card (F38)", () => {
  it("keeps every tile in the grid in its place while one is open; the card sits under the grid", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP, LONG, FAILED]} />);
    const before = gridNames();
    await user.click(screen.getByRole("button", { name: CLIP_NAME }));
    expect(gridNames()).toEqual(before);
    const tile = screen.getByRole("button", { name: CLIP_NAME });
    expect(tile).toHaveAttribute("aria-expanded", "true");
    // The card follows its tile in the document (Tab reaches it next) but is not a tile.
    const card = screen.getByRole("textbox", { name: "Description" }).closest("li");
    expect(card).not.toBeNull();
    expect(card).not.toContainElement(tile);
    expect(tile.closest("li")?.nextElementSibling).toBe(card);
    expect(scrollSpy).toHaveBeenCalledWith({ block: "nearest" });
    expect(card).toContainElement(scrollSpy.mock.contexts[0] as HTMLElement);
  });

  it("names the record in its header, middle-truncating a long file name", async () => {
    const user = userEvent.setup();
    const long = photo("maaaaaaz", "PXL_20260622_022941724.jpg");
    render(<LibraryHarness profileId={PID} assets={[long]} />);
    await user.click(screen.getByRole("button", { name: /PXL_20260622_022941724\.jpg$/ }));
    expect(screen.getByText("PXL_20260622\u2026724.jpg")).toBeInTheDocument();
    // The full name is still there for assistive tech, so the tile and the card agree.
    expect(screen.getByText("PXL_20260622_022941724.jpg")).toBeInTheDocument();
  });

  it("Escape closes the card and puts focus back on its tile", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP]} />);
    const tile = screen.getByRole("button", { name: CAT_NAME });
    await user.click(tile);
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
    await user.tab();
    await user.tab();
    await user.tab();
    // Close is the last stop in the card, after Focal point and Remove.
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(tile).toHaveFocus();
  });

  it("Escape inside the description first leaves the field, then closes the card", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    const tile = screen.getByRole("button", { name: CAT_NAME });
    await user.click(tile);
    const field = screen.getByRole("textbox", { name: "Description" });
    await user.click(field);
    await user.keyboard("{Escape}");
    expect(tile).toHaveFocus();
    expect(tile).toHaveAttribute("aria-expanded", "true");
    expect(field).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(tile).toHaveFocus();
    expect(actions.setAltText).not.toHaveBeenCalled();
  });

  it("Close closes the card and puts focus back on its tile", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    const tile = screen.getByRole("button", { name: CAT_NAME });
    await user.click(tile);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(tile).toHaveFocus();
  });

  it("a pointer-down outside the section closes the card; one inside the section does not", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LibraryHarness profileId={PID} assets={[CAT, CLIP]} />
        <main>
          <p>The canvas</p>
        </main>
      </>,
    );
    const tile = screen.getByRole("button", { name: CAT_NAME });
    await user.click(tile);
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("heading") });
    expect(tile).toHaveAttribute("aria-expanded", "true");
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByText("The canvas") });
    expect(tile).toHaveAttribute("aria-expanded", "false");
    // Focus goes wherever the click put it; the tile does not steal it back.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("a dialog closing does not clear the selection: the tile stays open and keeps focus", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LibraryHarness profileId={PID} assets={[CAT]} />
        <main>
          <p>The canvas</p>
        </main>
      </>,
    );
    const tile = screen.getByRole("button", { name: CAT_NAME });
    await user.click(tile);
    await user.keyboard("{Delete}");
    const dialog = screen.getByRole("dialog", { name: "Remove cat-1.jpg?" });
    // Neither a pointer-down in the dialog nor the Escape that answers it touches the tile.
    await user.pointer({ keys: "[MouseLeft]", target: dialog });
    expect(tile).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tile).toHaveAttribute("aria-expanded", "true");
    expect(tile).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
  });

  it("selecting another tile moves the card to it", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP]} />);
    await user.click(screen.getByRole("button", { name: CAT_NAME }));
    await user.click(screen.getByRole("button", { name: CLIP_NAME }));
    expect(screen.getByRole("button", { name: CAT_NAME })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: CLIP_NAME })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText("0:10 · rain-day.mov")).toBeInTheDocument();
  });
});

describe("MediaLibrary — remove", () => {
  it("Delete on a tile asks first, naming the file; Escape keeps it", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    await user.tab();
    await user.keyboard("{Delete}");
    const dialog = screen.getByRole("dialog", { name: "Remove cat-1.jpg?" });
    expect(dialog).toHaveTextContent(
      "It comes out of the library. Sections using it will show an empty slot until you pick another photo.",
    );
    expect(within(dialog).getByRole("button", { name: "Keep it" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
    expect(actions.deleteMedia).not.toHaveBeenCalled();
  });

  it("removes the tile once deleteMedia answers ok and moves focus to the add tile", async () => {
    const user = userEvent.setup();
    actions.deleteMedia.mockResolvedValueOnce({ ok: true });
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP]} />);
    await user.click(screen.getByRole("button", { name: CAT_NAME }));
    await user.click(screen.getByRole("button", { name: "Remove cat-1.jpg" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(actions.deleteMedia).toHaveBeenCalledWith({ profileId: PID, mediaId: "maaaaaaa" });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: CAT_NAME })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Media · 1 item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add photos or video" })).toHaveFocus();
  });

  it("says so, with Try again, when the delete call itself fails", async () => {
    const user = userEvent.setup();
    actions.deleteMedia
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true });
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    await user.tab();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't remove that.");
    expect(screen.getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(actions.deleteMedia).toHaveBeenCalledTimes(2);
    expect(actions.deleteMedia).toHaveBeenLastCalledWith({ profileId: PID, mediaId: "maaaaaaa" });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: CAT_NAME })).not.toBeInTheDocument();
  });

  it("shows the server's refusal, naming the cat, and keeps the tile (FR-076)", async () => {
    const user = userEvent.setup();
    actions.deleteMedia.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "refused",
        message: "Charlotte's live page uses this photo. Unpublish first.",
      },
    });
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    await user.tab();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Charlotte's live page uses this photo. Unpublish first.",
    );
    expect(screen.getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
  });
});

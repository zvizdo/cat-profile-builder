import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { EditedAsset } from "@/app/actions/_lib/media";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { LibraryHarness } from "./library-harness";
import { CAT, CAT_NAME, CLIP, LONG, PID } from "./media-fixtures";

// The two editors opened from a tile (T023): `Focal point` on a photo's detail opens the
// sheet and a saved point moves the tile's crop; `Trim` / `Re-trim` on a clip opens the
// modal, a chosen stretch sends `trimVideo` and stripes the tile as `processing` until the
// new record lands, `Remove trim` sends `clearTrim`; a call that never reaches the server
// is a toast with `Try again`, and a refusal is shown in the server's words.

type Edit = (input: unknown) => Promise<ActionResult<EditedAsset>>;
const actions = {
  setFocalPoint: vi.fn<Edit>(),
  trimVideo: vi.fn<Edit>(),
  clearTrim: vi.fn<Edit>(),
};
vi.mock("@/app/actions/media", () => ({
  setFocalPoint: (input: unknown) => actions.setFocalPoint(input),
  trimVideo: (input: unknown) => actions.trimVideo(input),
  clearTrim: (input: unknown) => actions.clearTrim(input),
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const TRIMMED: AssetView = {
  ...CLIP,
  id: LONG.id,
  fileName: LONG.fileName,
  originalDurationSeconds: 89,
  durationSeconds: 10,
  trim: { start: 0, end: 10 },
};

beforeEach(() => {
  // The media card scrolls itself into view when it opens; jsdom has no `scrollIntoView`.
  Element.prototype.scrollIntoView = vi.fn();
  actions.setFocalPoint.mockReset();
  actions.trimVideo.mockReset();
  actions.clearTrim.mockReset();
});

async function open(user: ReturnType<typeof userEvent.setup>, name: string, button: string) {
  await user.click(screen.getByRole("button", { name }));
  await user.click(screen.getByRole("button", { name: button }));
  return screen.getByRole("dialog");
}

describe("MediaLibrary — focal point", () => {
  it("opens the sheet from a photo's detail and moves the tile's crop to the saved point", async () => {
    const user = userEvent.setup();
    actions.setFocalPoint.mockResolvedValue({
      ok: true,
      asset: { ...CAT, focal: { x: 51, y: 50 } },
    });
    render(<LibraryHarness profileId={PID} assets={[CAT, LONG]} />);
    const dialog = await open(user, CAT_NAME, "Focal point");
    within(dialog).getByRole("button", { name: "Focal point" }).focus();
    await user.keyboard("{ArrowRight}");
    await user.click(within(dialog).getByRole("button", { name: "Save focal point" }));
    expect(actions.setFocalPoint).toHaveBeenCalledExactlyOnceWith({
      profileId: PID,
      mediaId: CAT.id,
      focal: { x: 51, y: 50 },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    const tile = screen.getByRole("button", { name: CAT_NAME });
    expect(tile.querySelector("img")).toHaveStyle({ objectPosition: "51% 50%" });
  });

  it("Focal point and Trim are reached by Tab from an open tile and open from Enter (keyboard path)", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, LONG]} />);
    await user.tab();
    expect(screen.getByRole("button", { name: CAT_NAME })).toHaveFocus();
    await user.keyboard("{Enter}");
    // The detail: the description first, then the editor's button, then Remove.
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Focal point" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Where should the crop hold on?" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    screen.getByRole("button", { name: "long.mp4, needs a trim" }).focus();
    await user.keyboard(" ");
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Trim" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: /^That clip is/ })).toBeVisible();
  });

  it("offers no focal point on a clip", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[LONG]} />);
    await user.click(screen.getByRole("button", { name: "long.mp4, needs a trim" }));
    expect(screen.queryByRole("button", { name: "Focal point" })).toBeNull();
  });

  it("keeps the sheet open and offers Try again when the save never reached the server", async () => {
    const user = userEvent.setup();
    actions.setFocalPoint.mockRejectedValueOnce(new Error("offline"));
    actions.setFocalPoint.mockResolvedValueOnce({
      ok: true,
      asset: { ...CAT, focal: { x: 60, y: 50 } },
    });
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    const dialog = await open(user, CAT_NAME, "Focal point");
    await user.click(within(dialog).getByRole("button", { name: "Reset to centre" }));
    await user.click(within(dialog).getByRole("button", { name: "Save focal point" }));
    const toast = screen.getByRole("alert");
    expect(toast).toHaveTextContent("We couldn't save that.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(within(toast).getByRole("button", { name: "Try again" }));
    expect(actions.setFocalPoint).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("MediaLibrary — trim", () => {
  it("opens the modal from a clip that needs a trim, stripes the tile while the stretch is cut, then shows the new record", async () => {
    const user = userEvent.setup();
    let land: (result: ActionResult<EditedAsset>) => void = () => {};
    actions.trimVideo.mockReturnValue(new Promise((resolve) => (land = resolve)));
    render(<LibraryHarness profileId={PID} assets={[LONG]} />);
    const dialog = await open(user, "long.mp4, needs a trim", "Trim");
    fireEvent.change(within(dialog).getByRole("slider", { name: "End" }), {
      target: { value: "10" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Use this stretch" }));
    expect(actions.trimVideo).toHaveBeenCalledExactlyOnceWith({
      profileId: PID,
      mediaId: LONG.id,
      start: 0,
      end: 10,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "long.mp4, processing" })).toBeInTheDocument();
    // Focus goes back to the opener, which stays while the cut runs — never to body.
    const opener = screen.getByRole("button", { name: "Trim" });
    expect(opener).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(opener);
    land({ ok: true, asset: TRIMMED });
    const tile = await screen.findByRole("button", {
      name: `${TRIMMED.alt?.text}, long.mp4, 0:10`,
    });
    expect(tile.querySelector("img")).toHaveAttribute("src", TRIMMED.posterUrl);
  });

  it("puts the tile back and shows the server's words when the trim is refused", async () => {
    const user = userEvent.setup();
    actions.trimVideo.mockResolvedValue({
      ok: false,
      error: { code: "unsupported", message: "We couldn't process long.mp4." },
    });
    render(<LibraryHarness profileId={PID} assets={[LONG]} />);
    const dialog = await open(user, "long.mp4, needs a trim", "Trim");
    await user.click(within(dialog).getByRole("button", { name: "Use this stretch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't process long.mp4.");
    expect(screen.getByRole("button", { name: "long.mp4, needs a trim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers Re-trim on a trimmed clip, and Remove trim sends clearTrim once and returns the tile to needing one", async () => {
    const user = userEvent.setup();
    actions.clearTrim.mockResolvedValue({ ok: true, asset: LONG });
    render(<LibraryHarness profileId={PID} assets={[TRIMMED]} />);
    const dialog = await open(user, `${TRIMMED.alt?.text}, long.mp4, 0:10`, "Re-trim");
    expect(within(dialog).getByRole("slider", { name: "End" })).toHaveValue("10");
    await user.click(within(dialog).getByRole("button", { name: "Remove trim" }));
    expect(actions.clearTrim).toHaveBeenCalledExactlyOnceWith({ profileId: PID, mediaId: LONG.id });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(
      await screen.findByRole("button", { name: "long.mp4, needs a trim" }),
    ).toBeInTheDocument();
  });
});

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinalizedUpload } from "@/app/actions/_lib/media";
import { LIMITS } from "@/core/media/validation";
import { LibraryHarness } from "./library-harness";
import { UploadFailure, type UploadFileInput } from "@/ui/builder/upload-client";
import { CAT, CAT_NAME, CLIP, CLIP_NAME, FAILED, fileInput, PID } from "./media-fixtures";

// The media rail's uploads (FR-006, FR-007, FR-008, FR-073; CONTENT.md → Toasts, Modals):
// files are screened before any call, sent one at a time with the progress toast, and
// every refusal is the server's or core's own sentence. `uploadFile` is faked at the
// module boundary so the queue, the toasts and the modal are what is under test.

const actions = { beginUpload: vi.fn() };
vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: (input: unknown) => actions.beginUpload(input),
  finalizeUpload: vi.fn(),
}));

const uploadFile = vi.fn<(input: UploadFileInput) => Promise<FinalizedUpload & { ok: true }>>();
vi.mock("@/ui/builder/upload-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/ui/builder/upload-client")>()),
  uploadFile: (input: UploadFileInput) => uploadFile(input),
}));

beforeEach(() => {
  // The media card scrolls itself into view when it opens; jsdom has no `scrollIntoView`.
  Element.prototype.scrollIntoView = vi.fn();
  actions.beginUpload.mockReset();
  uploadFile.mockReset();
});

describe("MediaLibrary — upload", () => {
  it("refuses an unsupported type with the modal, calling nothing", async () => {
    // user-event honours `accept` unless told not to; a phone or a drag would not.
    const user = userEvent.setup({ applyAccept: false });
    render(<LibraryHarness profileId={PID} assets={[]} />);
    await user.upload(fileInput(), new File(["x"], "IMG_0001.HEIC", { type: "image/heic" }));
    const dialog = screen.getByRole("dialog", { name: "We can't read that file." });
    expect(dialog).toHaveTextContent(
      "Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.",
    );
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Choose another" })).toBeInTheDocument();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(actions.beginUpload).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the picker from the add tile, and again from Choose another", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<LibraryHarness profileId={PID} assets={[]} />);
    const open = vi.spyOn(fileInput(), "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Add photos or video" }));
    expect(open).toHaveBeenCalledTimes(1);
    await user.upload(fileInput(), new File(["x"], "IMG_0001.HEIC", { type: "image/heic" }));
    await user.click(screen.getByRole("button", { name: "Choose another" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("refuses a file over the cap client-side, naming 200MB, without beginUpload (FR-007)", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[]} />);
    const big = new File([""], "long.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: LIMITS.videoBytes + 1 });
    await user.upload(fileInput(), big);
    expect(screen.getByRole("alert")).toHaveTextContent("That video is over 200MB.");
    expect(uploadFile).not.toHaveBeenCalled();
    expect(actions.beginUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Media · 0 items" })).toBeInTheDocument();
  });

  it("uploads one file at a time with the progress toast, then shows the tiles and any warning", async () => {
    const user = userEvent.setup();
    const resolvers: ((value: FinalizedUpload & { ok: true }) => void)[] = [];
    const progress: ((percent: number) => void)[] = [];
    uploadFile.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          progress.push(input.onProgress);
          resolvers.push(resolve);
        }),
    );
    render(<LibraryHarness profileId={PID} assets={[]} />);
    await user.upload(fileInput(), [
      new File(["a"], "cat-1.jpg", { type: "image/jpeg" }),
      new File(["b"], "rain-day.mov", { type: "video/quicktime" }),
    ]);

    // Two striped tiles at once, one upload in flight.
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile.mock.calls[0]?.[0]).toMatchObject({
      profileId: PID,
      file: { name: "cat-1.jpg" },
    });
    expect(screen.getByText("uploading")).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Uploading cat-1.jpg — 1 of 2");
    act(() => progress[0]?.(68));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "68");
    expect(screen.getByRole("status")).toHaveTextContent("68%");
    act(() => progress[0]?.(100));
    expect(screen.getByText("processing")).toBeInTheDocument();

    await act(async () => resolvers[0]?.({ ok: true, asset: CAT, warnings: [] }));
    expect(screen.getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Uploading rain-day.mov — 2 of 2");

    await act(async () =>
      resolvers[1]?.({
        ok: true,
        asset: CLIP,
        warnings: ["That photo is 640px wide — too small for the hero."],
      }),
    );
    expect(screen.getByRole("button", { name: CLIP_NAME })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Media · 2 items" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    const warning = screen.getByRole("status");
    expect(warning).toHaveTextContent("That photo is 640px wide — too small for the hero.");
    await user.click(within(warning).getByRole("button", { name: "Use anyway" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens the tile, empty field focused, when an upload lands with no description (FR-073)", async () => {
    const user = userEvent.setup();
    uploadFile.mockResolvedValueOnce({ ok: true, asset: FAILED, warnings: [] });
    render(<LibraryHarness profileId={PID} assets={[]} />);
    await user.upload(fileInput(), new File(["a"], "blurry.jpg", { type: "image/jpeg" }));
    expect(
      await screen.findByRole("button", { name: "blurry.jpg, needs a description" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
  });

  it("offers Try again when the bytes did not land, and retries that file", async () => {
    const user = userEvent.setup();
    uploadFile
      .mockRejectedValueOnce(new UploadFailure("network", "Upload failed. Nothing was added."))
      .mockResolvedValueOnce({ ok: true, asset: CAT, warnings: [] });
    render(<LibraryHarness profileId={PID} assets={[]} />);
    await user.upload(fileInput(), new File(["a"], "cat-1.jpg", { type: "image/jpeg" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Upload failed. Nothing was added.");
    expect(screen.queryByText("uploading")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: CAT_NAME })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the modal when the server's sniff refuses the bytes, and the sentence for any other refusal", async () => {
    const user = userEvent.setup();
    uploadFile
      .mockRejectedValueOnce(
        new UploadFailure(
          "unsupported",
          "We can't read that file. Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.",
        ),
      )
      .mockRejectedValueOnce(new UploadFailure("too_large", "That photo is over 25MB."));
    render(<LibraryHarness profileId={PID} assets={[]} />);
    await user.upload(fileInput(), new File(["a"], "not-a-video.mp4", { type: "video/mp4" }));
    expect(await screen.findByRole("dialog", { name: "We can't read that file." })).toBeVisible();
    await user.keyboard("{Escape}");
    await user.upload(fileInput(), new File(["a"], "huge.jpg", { type: "image/jpeg" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That photo is over 25MB.");
    expect(within(alert).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

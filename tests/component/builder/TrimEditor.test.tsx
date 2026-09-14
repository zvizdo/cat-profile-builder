import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { checkTrim } from "@/core/media/validation";
import { TrimEditor } from "@/ui/builder/TrimEditor";
import { CLIP, LONG, PID } from "./media-fixtures";

// The trim editor (FR-077, FR-078, FR-079, FR-085; CONTENT.md → Modals, decision Q4): the
// original plays muted and looping over the chosen stretch; two handles set it; every move
// is judged by core's `checkTrim` and its sentence is shown inline — the test compares to
// core's own answer and never restates the rule; `Use this stretch` waits for ok; `Remove
// trim` exists only while a trim does, and calls its action once.

vi.mock("@/core/media/validation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/media/validation")>();
  return { ...original, checkTrim: vi.fn(original.checkTrim) };
});

const TWENTY: AssetView = { ...LONG, originalDurationSeconds: 20 };
const TRIMMED: AssetView = {
  ...CLIP,
  id: "maaaaaae",
  fileName: "walk.mp4",
  originalDurationSeconds: 20,
  durationSeconds: 8,
  trim: { start: 4, end: 12 },
};

function renderEditor(asset: AssetView) {
  const onTrim = vi.fn<(start: number, end: number) => Promise<boolean>>().mockResolvedValue(true);
  const onClearTrim = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const onClose = vi.fn();
  render(
    <TrimEditor
      profileId={PID}
      asset={asset}
      onTrim={onTrim}
      onClearTrim={onClearTrim}
      onClose={onClose}
    />,
  );
  const dialog = screen.getByRole("dialog");
  return {
    onTrim,
    onClearTrim,
    onClose,
    dialog,
    start: within(dialog).getByRole("slider", { name: "Start" }),
    end: within(dialog).getByRole("slider", { name: "End" }),
    use: within(dialog).getByRole("button", { name: "Use this stretch" }),
  };
}

beforeEach(() => {
  vi.mocked(checkTrim).mockClear();
});

describe("TrimEditor", () => {
  it("names the clip's length and the rule in the modal, and plays the original muted and looping", () => {
    const { dialog } = renderEditor(TWENTY);
    expect(dialog).toHaveAccessibleName(
      "That clip is 0:20. A profile plays up to 15 seconds; the carousel shows the first 8.",
    );
    // F55: the body no longer repeats the title's own sentence.
    expect(dialog).toHaveAccessibleDescription(
      "Drag the handles to choose the stretch. Its first frame is the cover.",
    );
    const video = dialog.querySelector("video");
    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video).toHaveAttribute("src", `/api/profiles/${PID}/media/${TWENTY.id}/original`);
    expect(video?.muted).toBe(true);
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(dialog.querySelector("[controls]")).toBeNull();
  });

  it("shortens the title for a clip already inside the limit, and reserves no band under the track (F28 review #13)", () => {
    const { dialog } = renderEditor(CLIP);
    expect(dialog).toHaveAccessibleName("That clip is 0:10. Pick the seconds worth watching.");
    expect(within(dialog).getByRole("status").className).not.toMatch(/min-h/);
    // F55 item 3: the footer is pinned like the focal sheet's (F39) and the preview is
    // capped at 40dvh on the phone, its own height at 50vh from 768px.
    expect(
      within(dialog).getByRole("button", { name: "Use this stretch" }).parentElement,
    ).toHaveClass("sticky", "bottom-0");
    const box = dialog.querySelector("video")?.parentElement;
    expect(box?.className).toMatch(/\[--trim-h:40dvh\]/);
    expect(box?.className).toMatch(/md:\[--trim-h:50vh\]/);
    expect(box).toHaveStyle({ width: "calc(var(--trim-h) * 0.5625)" });
  });

  it("starts an untrimmed clip on its first fifteen seconds and a trimmed one on its trim", () => {
    const first = renderEditor(TWENTY);
    expect(first.start).toHaveValue("0");
    expect(first.end).toHaveValue("15");
    expect(
      within(first.dialog).getByText("0:00 – 0:15 of 0:20 · muted · loops"),
    ).toBeInTheDocument();
    expect(first.use).toBeEnabled();
    expect(within(first.dialog).queryByRole("button", { name: "Remove trim" })).toBeNull();
  });

  it("opens on the stored trim and offers Remove trim, which calls its action once", async () => {
    const user = userEvent.setup();
    const { dialog, start, end, onClearTrim, onClose } = renderEditor(TRIMMED);
    expect(start).toHaveValue("4");
    expect(end).toHaveValue("12");
    expect(within(dialog).getByText("0:04.0 – 0:12.0 of 0:20 · muted · loops")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove trim" }));
    expect(onClearTrim).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks core about every handle move and shows its sentence for a 16 s stretch", () => {
    const { dialog, end, use } = renderEditor(TWENTY);
    const before = vi.mocked(checkTrim).mock.calls.length;
    fireEvent.change(end, { target: { value: "16" } });
    expect(vi.mocked(checkTrim).mock.calls.length).toBeGreaterThan(before);
    expect(checkTrim).toHaveBeenLastCalledWith({ start: 0, end: 16, originalDurationSeconds: 20 });
    const refusal = checkTrim({ start: 0, end: 16, originalDurationSeconds: 20 });
    if (refusal.ok) throw new Error("expected a refusal");
    expect(within(dialog).getByRole("status")).toHaveTextContent(refusal.message);
    expect(use).toBeDisabled();
    expect(within(dialog).getByText("0:00 – 0:16 of 0:20 · muted · loops")).toBeInTheDocument();
  });

  it("shows core's sentence for a half-second stretch and clears it once the stretch is fine", () => {
    const { dialog, start, end, use } = renderEditor(TWENTY);
    fireEvent.change(start, { target: { value: "5" } });
    fireEvent.change(end, { target: { value: "5.5" } });
    const refusal = checkTrim({ start: 5, end: 5.5, originalDurationSeconds: 20 });
    if (refusal.ok) throw new Error("expected a refusal");
    expect(within(dialog).getByRole("status")).toHaveTextContent(refusal.message);
    expect(use).toBeDisabled();
    fireEvent.change(end, { target: { value: "12" } });
    expect(within(dialog).getByRole("status")).toBeEmptyDOMElement();
    expect(use).toBeEnabled();
  });

  it("plays the stretch on a loop: past its end, or before its start, the clip returns to the start", () => {
    const { dialog, start } = renderEditor(TRIMMED);
    const video = dialog.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) throw new Error("no video");
    let time = 0;
    Object.defineProperty(video, "currentTime", {
      get: () => time,
      set: (value: number) => {
        time = value;
      },
    });
    fireEvent.change(start, { target: { value: "5" } });
    expect(time).toBe(5);
    time = 12.2;
    fireEvent.timeUpdate(video);
    expect(time).toBe(5);
    time = 8;
    fireEvent.timeUpdate(video);
    expect(time).toBe(8);
    time = 1;
    fireEvent.timeUpdate(video);
    expect(time).toBe(5);
  });

  it("seeks to the trim's start as soon as the clip's metadata loads, not 0 (F40)", () => {
    // `autoPlay` alone starts a `<video>` at 0: for a stored trim that begins well into the
    // clip, the volunteer would see a flash of the untrimmed opening before the first
    // `timeupdate` correction caught up. `loadedmetadata` fires before that first frame
    // paints, so seeking there means the preview never visibly starts anywhere but the
    // trim's own start.
    const { dialog } = renderEditor(TRIMMED);
    const video = dialog.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) throw new Error("no video");
    let time = 0;
    Object.defineProperty(video, "currentTime", {
      get: () => time,
      set: (value: number) => {
        time = value;
      },
    });
    expect(time).toBe(0);
    fireEvent.loadedMetadata(video);
    expect(time).toBe(4);
  });

  it("keeps the handles from crossing", () => {
    const { start, end } = renderEditor(TWENTY);
    fireEvent.change(start, { target: { value: "18" } });
    expect(start).toHaveValue("15");
    fireEvent.change(end, { target: { value: "10" } });
    expect(end).toHaveValue("15");
  });

  it("moves a handle 0.1 s per arrow and 1 s with Shift", async () => {
    const user = userEvent.setup();
    const { start } = renderEditor(TWENTY);
    start.focus();
    await user.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}");
    expect(start).toHaveValue("2");
    await user.keyboard("{ArrowRight}");
    expect(start).toHaveValue("2.1");
    await user.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}");
    expect(start).toHaveValue("0");
  });

  it("Tab leaves the End handle for the buttons, and Enter on Use this stretch sends it (keyboard path)", async () => {
    const user = userEvent.setup();
    const { dialog, end, use, onTrim, onClose } = renderEditor(TWENTY);
    end.focus();
    await user.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}");
    expect(end).toHaveValue("10");
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(use).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onTrim).toHaveBeenCalledExactlyOnceWith(0, 10);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends the stretch once and closes at once; Cancel and Escape close without sending", async () => {
    const user = userEvent.setup();
    const { dialog, end, use, onTrim, onClose } = renderEditor(TWENTY);
    fireEvent.change(end, { target: { value: "10" } });
    await user.click(use);
    expect(onTrim).toHaveBeenCalledExactlyOnceWith(0, 10);
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onTrim).toHaveBeenCalledTimes(1);
  });
});

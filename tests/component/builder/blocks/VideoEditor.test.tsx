import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import { videoTrim } from "@/ui/builder/blocks/VideoEditor";
import { EditorHarness } from "./harness";
import { CAT, CLIP, LONG } from "../media-fixtures";

// The video editor (T025; hi-fi 3a, CONTENT.md block labels): the clip's poster with the
// `trim 0:04 – 0:12 of 2:07 · muted autoplay + loop` line read from the record — and,
// only while a trim exists, the track showing that stretch inside the clip — `replace
// clip` over the library's clips only, `re-trim` straight into T023's trim editor (a
// media-record edit the helper never touches, FR-093), `duplicate` and `remove`.

const VIDEO = { id: "videoaaaaaaa", type: "video", mediaId: null } satisfies Block;
const TRIMMED = {
  ...CLIP,
  id: "maaaaaaf",
  fileName: "long-walk.mp4",
  originalDurationSeconds: 127,
  durationSeconds: 8,
  trim: { start: 4, end: 12 },
};

describe("VideoEditor", () => {
  it("is striped with `drop a clip` while empty and picks from the library's clips only", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={VIDEO} assets={[CAT, CLIP]} onApply={(op) => ops.push(op)} />);
    expect(screen.getByText("drop a clip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "re-trim" })).toBeNull();
    screen.getByRole("button", { name: "Pick a clip" }).focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Pick a clip" });
    expect(within(dialog).queryByRole("button", { name: /cat-1/ })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /rain-day\.mov/ }));
    await user.click(within(dialog).getByRole("button", { name: "Use clip" }));
    expect(ops).toEqual([{ op: "replace_image", blockId: VIDEO.id, mediaId: CLIP.id }]);
    expect(screen.getByRole("img")).toHaveAttribute("src", CLIP.posterUrl);
    expect(
      screen.getByText("trim 0:00 – 0:10 of 0:10 · muted autoplay + loop"),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-trim-track]")).toBeNull();
  });

  it("reads the trim line from the record and opens the trim editor on re-trim", async () => {
    const user = userEvent.setup();
    const onOpenTrim = vi.fn();
    render(
      <EditorHarness
        block={{ ...VIDEO, mediaId: TRIMMED.id }}
        assets={[TRIMMED]}
        onOpenTrim={onOpenTrim}
      />,
    );
    expect(
      screen.getByText("trim 0:04 – 0:12 of 2:07 · muted autoplay + loop"),
    ).toBeInTheDocument();
    const track = document.querySelector("[data-trim-track]");
    expect(track).toHaveAttribute("aria-hidden", "true");
    expect(track?.firstElementChild).toHaveStyle({ left: `${(4 / 127) * 100}%` });
    expect(track?.firstElementChild).toHaveStyle({ width: `${(8 / 127) * 100}%` });
    expect(screen.getByText("VIDEO · one clip, trimmed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "duplicate" })).toBeInTheDocument();
    screen.getByRole("button", { name: "re-trim" }).focus();
    await user.keyboard("{Enter}");
    expect(onOpenTrim).toHaveBeenCalledWith(TRIMMED.id);
    await user.click(screen.getByRole("button", { name: "replace clip" }));
    expect(screen.getByRole("dialog", { name: "Pick a clip" })).toBeInTheDocument();
  });

  it("shows a clip that still needs a trim as striped, with re-trim on offer", () => {
    render(<EditorHarness block={{ ...VIDEO, mediaId: LONG.id }} assets={[LONG]} />);
    expect(screen.getByText("needs a trim")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "re-trim" })).toBeInTheDocument();
  });

  it("draws no track for a clip without a trim or one not ready to play", () => {
    expect(videoTrim(CLIP)).toBeNull();
    expect(videoTrim(LONG)).toBeNull();
    expect(videoTrim({ ...TRIMMED, status: "processing" })).toBeNull();
    expect(videoTrim(TRIMMED)).toEqual({ range: { start: 4, end: 12 }, max: 127 });
  });

  it("shows the missing state for a clip the library no longer holds", () => {
    render(<EditorHarness block={{ ...VIDEO, mediaId: "mgoneaaa" }} assets={[CLIP]} />);
    expect(screen.getByText("clip missing — pick another")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { EditedAsset } from "@/app/actions/_lib/media";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { applyOperation, describeOperation, type EditOperation } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import { FixedHeroFrame } from "@/ui/builder/BlockFrame";
import { MediaLibrary } from "@/ui/builder/MediaLibrary";
import { MediaPicker } from "@/ui/builder/MediaPicker";
import { useMediaLibrary } from "@/ui/builder/use-media-library";
import { DOC, GALLERY, HERO } from "./canvas-fixtures";
import { HarnessToasts, LibraryHarness } from "./library-harness";
import { CAT, CAT_NAME, PID, photo } from "./media-fixtures";

// The library's side of enhancement (T045; FR-052, FR-054): an enhanced copy's tile is
// marked ENHANCED and its detail names the original; a frame's `enhance` runs
// `enhancePhoto` through the library, which adds the new record and opens the compare —
// a copy the library already holds is reused, a refusal is the library's error toast, and
// a call that never reached the server offers Try again. (F44: the old phone mode's
// per-tile `Enhance in the hero` retired with it; the phone has the same frames now.)

type Enhance = (input: unknown) => Promise<ActionResult<EditedAsset>>;
const actions = { enhancePhoto: vi.fn<Enhance>() };
vi.mock("@/app/actions/media", () => ({
  enhancePhoto: (input: unknown) => actions.enhancePhoto(input),
  setFocalPoint: vi.fn(),
  trimVideo: vi.fn(),
  clearTrim: vi.fn(),
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const ENHANCED: AssetView = photo("menhaaaa", "cat-1.jpg", {
  enhancement: { sourceMediaId: CAT.id, recipe: "auto-v1" },
  revisions: { clean: "f6e5d4c3b2" },
  cleanUrl: `/media/profiles/${PID}/media/menhaaaa/clean.f6e5d4c3b2.jpg`,
  createdAt: "2026-09-10T12:05:00.000Z",
});
const ENHANCED_NAME = "A tabby cat on a windowsill., cat-1.jpg, ENHANCED";

/** The hero on the photo and a gallery holding it too, so one original has two placements. */
const PLACED: ProfileDocument = {
  ...DOC,
  blocks: [
    { id: HERO, type: "hero", mediaId: CAT.id },
    { id: GALLERY, type: "gallery", mediaIds: [CAT.id] },
  ],
};

interface FrameHarnessProps {
  doc: ProfileDocument;
  assets: AssetView[];
  onApply: (op: EditOperation) => void;
}

// The hero's frame and the library over one real `useMediaLibrary`, as the shell wires
// them: the frame's `enhance` is the library's, so the toasts and the new record are
// the library's too; every operation is applied through the core.
function FrameHarness({ doc: initial, assets, onApply }: FrameHarnessProps) {
  const library = useMediaLibrary(PID, assets);
  const [doc, setDoc] = useState(initial);
  const apply = (op: EditOperation) => {
    onApply(op);
    const result = applyOperation(doc, op, { assets: library.assets, newBlockId: () => "b" });
    if (result.ok) setDoc(result.value);
  };
  const hero = doc.blocks[0];
  return (
    <>
      {hero?.type === "hero" ? (
        <FixedHeroFrame
          block={hero}
          assets={library.assets}
          catName="Charlotte"
          describe={(op) => describeOperation(doc, op, library.assets)}
          onApply={apply}
          onOpenTrim={() => undefined}
          onEnhance={library.enhance}
          onAskHelper={() => undefined}
        />
      ) : null}
      <MediaLibrary profileId={PID} library={library} doc={doc} />
      <HarnessToasts library={library} />
    </>
  );
}

beforeEach(() => {
  actions.enhancePhoto.mockReset();
  // The media card scrolls itself into view when it opens; jsdom has no `scrollIntoView`.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("MediaTile — an enhanced copy", () => {
  it("is marked ENHANCED on the closed tile and names its original when open", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, ENHANCED]} />);
    const tile = screen.getByRole("button", { name: ENHANCED_NAME });
    await user.click(tile);
    expect(screen.getByText("ENHANCED", { selector: "[class*='border']" })).toBeInTheDocument();
    expect(screen.getByText("original: A tabby cat on a windowsill.")).toBeInTheDocument();
    // The original's own tile carries neither.
    expect(screen.getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
  });

  it("keeps just the badge when the original has left the library", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[ENHANCED]} />);
    await user.click(screen.getByRole("button", { name: ENHANCED_NAME }));
    expect(screen.getByText("ENHANCED", { selector: "[class*='border']" })).toBeInTheDocument();
    expect(screen.queryByText(/^original:/)).toBeNull();
  });
});

describe("the library's enhance from a frame (a refusal, a retry, a copy already held)", () => {
  it("reuses the copy the library already holds instead of calling the server again (FR-051)", async () => {
    const user = userEvent.setup();
    render(<FrameHarness doc={PLACED} assets={[CAT, ENHANCED]} onApply={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "enhance" }));
    const dialog = screen.getByRole("dialog", { name: "Use the enhanced photo in the hero?" });
    expect(actions.enhancePhoto).not.toHaveBeenCalled();
    expect(dialog.querySelector('img[data-layer="enhanced"]')).toHaveAttribute(
      "src",
      ENHANCED.cleanUrl,
    );
    expect(screen.getAllByRole("button", { name: ENHANCED_NAME })).toHaveLength(1);
  });

  it("shows a refusal as the library's error toast and adds nothing", async () => {
    const user = userEvent.setup();
    actions.enhancePhoto.mockResolvedValue({
      ok: false,
      error: {
        code: "refused",
        message: "That photo is still being processed. Try again in a moment.",
      },
    });
    render(<FrameHarness doc={PLACED} assets={[CAT]} onApply={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "enhance" }));
    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("That photo is still being processed. Try again in a moment.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: ENHANCED_NAME })).toBeNull();
  });

  it("offers Try again when the call never reached the server, and a landed retry opens the compare", async () => {
    const user = userEvent.setup();
    actions.enhancePhoto.mockRejectedValueOnce(new Error("offline"));
    actions.enhancePhoto.mockResolvedValueOnce({ ok: true, asset: ENHANCED });
    render(<FrameHarness doc={PLACED} assets={[CAT]} onApply={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "enhance" }));
    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("We couldn't enhance that.");
    await user.click(within(toast).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("dialog", { name: "Use the enhanced photo in the hero?" }),
    ).toBeInTheDocument();
  });
});

describe("MediaPicker — an enhanced copy", () => {
  it("is marked and named ENHANCED, so it can be told from its original (FR-052)", () => {
    render(
      <MediaPicker
        assets={[CAT, ENHANCED]}
        kind="photo"
        onCancel={() => undefined}
        onPick={() => undefined}
      />,
    );
    const choice = screen.getByRole("button", { name: ENHANCED_NAME });
    expect(choice).toHaveTextContent("ENHANCED");
    expect(screen.getByRole("button", { name: CAT_NAME })).not.toHaveTextContent("ENHANCED");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast, ToastRegion } from "@/ui/shared/Toast";
import { DOC, HERO } from "./canvas-fixtures";
import { LibraryHarness } from "./library-harness";
import { CAT, CAT_NAME, CLIP, CLIP_NAME, PID } from "./media-fixtures";

// The media card's `On the page` line (F39; FR-013: which media are attached) and the
// one way out F39 sharpened — a pointer-down on a toast leaves the selection alone, one
// on any other status line on the page is a click elsewhere. The rest of the rail is in
// MediaLibrary.test.tsx.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const scrollSpy = vi.fn();

beforeEach(() => {
  // The media card scrolls itself into view when it opens; jsdom has no `scrollIntoView`.
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/** The fixture page with the hero holding `mediaId`. */
function withHero(mediaId: string) {
  const blocks = DOC.blocks.map((b) => (b.id === HERO ? { ...b, mediaId } : b));
  return { ...DOC, blocks };
}

describe("MediaLibrary — the media card's On the page line (F39; FR-013)", () => {
  it("names the slot a placed record is in", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP]} doc={withHero(CAT.id)} />);
    await user.click(screen.getByRole("button", { name: CAT_NAME }));
    expect(screen.getByText("On the page · hero")).toBeInTheDocument();
  });

  it("says a record nothing holds is not on the page yet", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT, CLIP]} doc={withHero(CAT.id)} />);
    await user.click(screen.getByRole("button", { name: CLIP_NAME }));
    expect(screen.getByText("Not on the page yet")).toBeInTheDocument();
    expect(screen.queryByText(/^On the page/)).toBeNull();
  });

  it("names the card's row by the record, so the tile expands something named", async () => {
    const user = userEvent.setup();
    render(<LibraryHarness profileId={PID} assets={[CAT]} />);
    await user.click(screen.getByRole("button", { name: CAT_NAME }));
    expect(screen.getByRole("group", { name: "cat-1.jpg" })).toBeInTheDocument();
  });
});

describe("MediaLibrary — a toast is not elsewhere (F39)", () => {
  it("a pointer-down on a toast leaves the card alone; one on any other status line closes it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LibraryHarness profileId={PID} assets={[CAT, CLIP]} />
        <ToastRegion>
          <Toast variant="success">Charlotte is live</Toast>
        </ToastRegion>
        <main>
          <p role="status">contrast check: passes AA</p>
        </main>
      </>,
    );
    const tile = screen.getByRole("button", { name: CAT_NAME });
    await user.click(tile);
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByText("Charlotte is live") });
    expect(tile).toHaveAttribute("aria-expanded", "true");
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByText(/contrast check/) });
    expect(tile).toHaveAttribute("aria-expanded", "false");
  });
});

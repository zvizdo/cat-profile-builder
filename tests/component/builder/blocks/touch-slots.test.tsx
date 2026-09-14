import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import type { Block } from "@/core/profile/schema";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { TOUCH_QUERY } from "@/ui/builder/blocks/use-touch-band";
import { PhotoSlot } from "@/ui/builder/PhotoSlot";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { EditorHarness } from "./harness";
import { CAT, photo } from "../media-fixtures";

// F55 items 1 and 2 (the controller's phone sweep, `runs/2026-09-13-phone-sweep.md`):
// on touch — the phone under 768px and the touch band up to 1179px — a gallery tile's
// controls are one row of the same pills the hero's own row draws (`Move left`, `Move
// right`, `enhance`, `Remove photo`: 44px, fully rounded, the same box), not a cluster
// of unboxed chevrons and white squares of two sizes; and an empty slot reads `Add a
// photo` / `Add a clip` — the whole slot the tap target — since nothing drops on a
// phone. The gallery keeps one spare `Add a photo` cell on touch, not two. From 1180px
// nothing here changes.

const IDS = "abc".split("").map((letter) => `maaaaaa${letter}`);
const LIBRARY: AssetView[] = IDS.map((id, i) =>
  photo(id, `cat-${i + 1}.jpg`, { alt: { text: `Photo ${i + 1}`, source: "model" } }),
);
const GALLERY = { id: "galleryaaaaa", type: "gallery", mediaIds: IDS.slice(0, 2) } satisfies Block;

/** `matchMedia` for a window `width` wide: the phone query under 768, the touch band 768–1179. */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      (query === PHONE_QUERY && width < 768) ||
      (query === TOUCH_QUERY && width >= 768 && width < 1180),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => vi.unstubAllGlobals());

const PILL = /(^|\s)rounded-pill(\s|$)/;

describe("gallery tile controls on touch (F55 item 1)", () => {
  it.each([390, 1024])(
    "at %ipx each tile's four controls are 44px pills on two fixed rows",
    (width) => {
      stubWidth(width);
      render(<EditorHarness block={GALLERY} assets={LIBRARY} />);
      const [first] = screen.getAllByRole("listitem");
      const names = ["Move left", "Move right", "enhance", "Remove photo"];
      const buttons = names.map((name) => within(first!).getByRole("button", { name }));
      for (const button of buttons) {
        expect(button.className).toMatch(PILL);
        expect(button.className).toMatch(/(^|\s)(min-h-44|size-44)(\s|$)/);
      }
      // Two fixed rows (F61): the moves, then the pill and `Remove photo`, in that order.
      const track = buttons[0]!.parentElement!.parentElement;
      const inTrack = Array.from(track!.querySelectorAll("button")).map(
        (b) => b.getAttribute("aria-label") ?? b.textContent,
      );
      expect(inTrack).toEqual(names);
      expect(Array.from(track!.children)).toHaveLength(2);
      // `Remove photo` is the clay outline pill (`destructive`), on its own un-themed chip
      // (F12), not the old white square.
      const remove = within(first!).getByRole("button", { name: "Remove photo" });
      expect(remove).toHaveClass("border-clay");
      expect(remove.parentElement).toHaveClass("theme-chrome", "bg-card", "rounded-pill");
    },
  );

  it("at 390px the pills still move, remove and keep the ends disabled", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={GALLERY} assets={LIBRARY} onApply={(op) => ops.push(op)} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first!).getByRole("button", { name: "Move left" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(within(second!).getByRole("button", { name: "Move left" }));
    const op = ops.at(-1);
    expect(op?.op === "set_field" ? op.value : undefined).toEqual([IDS[1], IDS[0]]);
  });

  it("at 390px Tab walks Move left → Move right → enhance → Remove photo; Enter moves and keeps focus, Space asks before removing (keyboard path)", async () => {
    // T049 part 2 (ADR-012): the touch row is its own component (`GalleryCellTouch`), so
    // the desktop cell's keyboard proof (`GalleryEditor.test.tsx`) does not cover it.
    stubWidth(390);
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<EditorHarness block={GALLERY} assets={LIBRARY} onApply={(op) => ops.push(op)} />);
    const [first] = screen.getAllByRole("listitem");
    within(first!).getByRole("button", { name: "Move left" }).focus();
    await user.tab();
    expect(within(first!).getByRole("button", { name: "Move right" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const op = ops.at(-1);
    expect(op?.op === "set_field" ? op.value : undefined).toEqual([IDS[1], IDS[0]]);
    // The moved photo is now the second tile, and its own Move right still holds focus.
    const [, moved] = screen.getAllByRole("listitem");
    expect(within(moved!).getByRole("img")).toHaveAttribute("alt", "Photo 1");
    expect(within(moved!).getByRole("button", { name: "Move right" })).toHaveFocus();
    await user.tab();
    expect(within(moved!).getByRole("button", { name: "enhance" })).toHaveFocus();
    await user.tab();
    expect(within(moved!).getByRole("button", { name: "Remove photo" })).toHaveFocus();
    await user.keyboard(" ");
    expect(
      screen.getByRole("dialog", { name: "Remove this photo from the gallery?" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(ops).toHaveLength(1);
  });

  it("from 1180px the desktop controls are unchanged", () => {
    stubWidth(1440);
    render(<EditorHarness block={GALLERY} assets={LIBRARY} />);
    const [first] = screen.getAllByRole("listitem");
    expect(within(first!).getByRole("button", { name: "Move left" }).className).not.toMatch(PILL);
    expect(within(first!).getByRole("button", { name: "Remove photo" })).toHaveClass(
      "rounded-control",
    );
  });
});

describe("empty slots on touch (F55 item 2)", () => {
  it.each([390, 1024])(
    "at %ipx an empty slot reads Add a photo and the whole slot opens the picker",
    async (width) => {
      stubWidth(width);
      const user = userEvent.setup();
      render(<PhotoSlot mediaId={null} assets={[CAT]} kind="photo" onPick={() => undefined} />);
      expect(screen.queryByText(/drop a photo/i)).toBeNull();
      expect(screen.queryByRole("button", { name: "Pick a photo" })).toBeNull();
      const add = screen.getByRole("button", { name: "Add a photo" });
      expect(add).toHaveTextContent("Add a photo");
      // The whole striped face is the target, not the label's own width alone.
      expect(add).toHaveClass("absolute", "inset-0");
      await user.click(add);
      expect(screen.getByRole("dialog", { name: "Pick a photo" })).toBeInTheDocument();
    },
  );

  it("names the slot in the button when it is one of several, and says clip for a video", () => {
    stubWidth(390);
    const { unmount } = render(
      <PhotoSlot
        mediaId={null}
        assets={[]}
        kind="photo"
        slotName="scene 2"
        onPick={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Add a photo for scene 2" })).toHaveTextContent(
      "Add a photo",
    );
    unmount();
    render(<PhotoSlot mediaId={null} assets={[]} kind="video" onPick={() => undefined} />);
    expect(screen.getByRole("button", { name: "Add a clip" })).toBeInTheDocument();
  });

  it("from 1180px the slot keeps drop a photo and its Pick a photo button", () => {
    stubWidth(1440);
    render(<PhotoSlot mediaId={null} assets={[CAT]} kind="photo" onPick={() => undefined} />);
    expect(screen.getByText("drop a photo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick a photo" })).toBeInTheDocument();
  });

  it("on touch the gallery keeps one Add a photo cell and no second spare cell", () => {
    stubWidth(390);
    render(<EditorHarness block={GALLERY} assets={LIBRARY} />);
    expect(screen.getAllByRole("button", { name: "Add a photo" })).toHaveLength(1);
    expect(screen.queryByText(/drop a photo/i)).toBeNull();
    // Two photos, one add cell: three cells, no padding.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "add photos" })).toBeInTheDocument();
  });

  it("from 1180px an empty gallery still pads to one row of four", () => {
    stubWidth(1440);
    render(<EditorHarness block={{ ...GALLERY, mediaIds: [] }} assets={LIBRARY} />);
    expect(screen.getAllByText("drop a photo")).toHaveLength(4);
  });
});

// F61 (gallery-many-photos-investigation.md): `"enhance"` (87.8px) and `"revert to
// original"` (139.2px) are the same control at a different width, and the old
// `flex-wrap` row let that difference wrap one tile to a third line while its row
// neighbour stayed at two — the two columns' pill rows ended up 52px apart. The fix is
// two fixed `flex` rows (never `flex-wrap`, so neither can grow a second line of its
// own) plus a touch-only short word for `revert`, so the tile is always exactly two
// rows regardless of the label; jsdom cannot measure the resulting layout, so these
// assert the structure and the label instead of pixels.
describe("a tile's control track is fixed regardless of the enhance/revert label (F61)", () => {
  const ORIGINAL = "mzzzzzza";
  const ENHANCED = "mzzzzzzb";
  const ENHANCE_LIBRARY: AssetView[] = [
    photo(ORIGINAL, "cat-1.jpg"),
    photo(ENHANCED, "cat-1-enhanced.jpg", {
      enhancement: { sourceMediaId: ORIGINAL, recipe: "auto-v1" },
    }),
  ];
  const ENHANCE_GALLERY = {
    id: "gallerybbbbb",
    type: "gallery",
    mediaIds: [ORIGINAL, ENHANCED],
  } satisfies Block;

  /** The tile's outer track — two rows, whichever word its pill wears. */
  function trackOf(tile: HTMLElement): HTMLElement {
    const moveLeft = within(tile).getByRole("button", { name: "Move left" });
    return moveLeft.parentElement!.parentElement as HTMLElement;
  }

  /** Neither row is `flex-wrap`: exactly two rows, and the moves row holds its two icons. */
  function assertTwoFixedRows(track: HTMLElement): void {
    expect(track.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/);
    const rows = Array.from(track.children);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/);
    expect(Array.from(rows[0]?.children ?? [])).toHaveLength(2);
  }

  it.each([390, 1024])(
    "at %ipx the plain tile and its enhanced sibling hold the same fixed two-row track",
    (width) => {
      stubWidth(width);
      render(<EditorHarness block={ENHANCE_GALLERY} assets={ENHANCE_LIBRARY} />);
      const [plainTile, enhancedTile] = screen.getAllByRole("listitem");
      const plainTrack = trackOf(plainTile!);
      const enhancedTrack = trackOf(enhancedTile!);
      // Same track, whichever word the pill wears — not a row whose line count depends
      // on the label's width.
      expect(enhancedTrack.className).toBe(plainTrack.className);
      assertTwoFixedRows(plainTrack);
      assertTwoFixedRows(enhancedTrack);
    },
  );

  it("on touch the revert pill reads `revert`, but its accessible name stays `revert to original`", () => {
    stubWidth(390);
    render(<EditorHarness block={ENHANCE_GALLERY} assets={ENHANCE_LIBRARY} />);
    const [, enhancedTile] = screen.getAllByRole("listitem");
    const revert = within(enhancedTile!).getByRole("button", { name: "revert to original" });
    expect(revert).toHaveTextContent("revert");
    expect(revert.textContent).not.toBe("revert to original");
    expect(revert).toHaveAccessibleName("revert to original");
  });

  it("the revert pill's label sits in a truncating span, and the pill can shrink below its own text", () => {
    stubWidth(390);
    render(<EditorHarness block={ENHANCE_GALLERY} assets={ENHANCE_LIBRARY} />);
    const [, enhancedTile] = screen.getAllByRole("listitem");
    const revert = within(enhancedTile!).getByRole("button", { name: "revert to original" });
    expect(revert.className).toMatch(/(^|\s)min-w-0(\s|$)/);
    const label = revert.querySelector("span");
    expect(label?.className).toMatch(/(^|\s)truncate(\s|$)/);
  });

  /** Asserts one tile's rows: `Move left`/`Move right` on top, `Remove photo` sharing
   * the bottom row with the pill — never grouped with the moves. */
  function assertRowsInOrder(tile: HTMLElement): void {
    const moveLeft = within(tile).getByRole("button", { name: "Move left" });
    const movesRow = Array.from(moveLeft.parentElement?.children ?? []);
    expect(movesRow[0]?.getAttribute("aria-label")).toBe("Move left");
    expect(movesRow[1]?.getAttribute("aria-label")).toBe("Move right");

    const remove = within(tile).getByRole("button", { name: "Remove photo" });
    const pillRow = Array.from(remove.parentElement?.parentElement?.children ?? []);
    expect(pillRow.at(-1)?.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Remove photo",
    );
    expect(pillRow).not.toBe(movesRow);
  }

  it("Move left/Move right hold row 1 and Remove photo shares row 2 with the pill, on every tile", () => {
    stubWidth(390);
    render(<EditorHarness block={ENHANCE_GALLERY} assets={ENHANCE_LIBRARY} />);
    for (const tile of screen.getAllByRole("listitem").slice(0, 2)) assertRowsInOrder(tile);
  });
});

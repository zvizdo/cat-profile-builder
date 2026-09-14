import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { EditedAsset } from "@/app/actions/_lib/media";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { ProfileDocument } from "@/core/profile/schema";
import { Builder } from "@/ui/builder/Builder";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { BIO, DOC, HERO } from "../canvas-fixtures";
import { CAT, CAT_NAME, CLIP, CLIP_NAME, PID, photo } from "../media-fixtures";

// The Media drawer (design 2026-09-13 §5; F45), through the real `Builder` at 390px:
// Full only — the sheet's header carries the count and Close; Upload is the first
// control in the body, a 44px button above the grid; a tile opens the F38/F39 card
// under the grid with `Focal point` / `Trim` / `Enhance…` / `Remove` and the `On the
// page` line; the card closes from its Close, from Escape (the sheet stays), and from
// the tile again; focal and trim open their own sheets over the drawer and hand focus
// back to the card; `Enhance…` opens the compare over the drawer, and its `Use
// enhanced` is one `replace_image` on the photo's placement; a removal the server
// refuses is the builder's one toast.

type Enhance = (input: unknown) => Promise<ActionResult<EditedAsset>>;
type Delete = (input: unknown) => Promise<ActionResult<Record<never, never>>>;
const actions = { enhancePhoto: vi.fn<Enhance>(), deleteMedia: vi.fn<Delete>() };
vi.mock("@/app/actions/media", () => ({
  enhancePhoto: (input: unknown) => actions.enhancePhoto(input),
  deleteMedia: (input: unknown) => actions.deleteMedia(input),
  setFocalPoint: vi.fn(),
  trimVideo: vi.fn(),
  clearTrim: vi.fn(),
  setAltText: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const ENHANCED: AssetView = photo("menhaaaa", "cat-1.jpg", {
  enhancement: { sourceMediaId: CAT.id, recipe: "auto-v1" },
  revisions: { clean: "f6e5d4c3b2" },
  cleanUrl: `/media/profiles/${PID}/media/menhaaaa/clean.f6e5d4c3b2.jpg`,
  createdAt: "2026-09-10T12:05:00.000Z",
});

/** The hero on the photo, a bio, and a clip in the library but not on the page. */
const CAT_DOC: ProfileDocument = {
  ...DOC,
  blocks: [
    { id: HERO, type: "hero", mediaId: CAT.id },
    { id: BIO, type: "bio", content: { paragraphs: [{ runs: [{ text: "Purrs." }] }] } },
  ],
};

const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === PHONE_QUERY,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => Response.json({ updatedAt: "2026-09-11T12:00:00.000Z" }));
  Element.prototype.scrollIntoView = vi.fn();
  actions.enhancePhoto.mockReset();
  actions.deleteMedia.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

async function openDrawer(assets: AssetView[] = [CAT, CLIP]) {
  const user = userEvent.setup();
  render(
    <Builder
      document={CAT_DOC}
      assets={assets}
      publication={{ state: "draft", url: null }}
      now={CAT_DOC.updatedAt}
    />,
  );
  await user.click(
    within(screen.getByRole("navigation", { name: "Drawers" })).getByRole("button", {
      name: "Media",
    }),
  );
  const sheet = screen.getByRole("dialog", { name: /^Media · / });
  return { user, sheet };
}

describe("the Media drawer", () => {
  it("is a Full sheet named by the count, with Upload first in the body, above the grid", async () => {
    const { sheet } = await openDrawer();
    expect(sheet).toHaveAccessibleName("Media · 2 items");
    const upload = within(sheet).getByRole("button", { name: "Add photos or video" });
    const grid = within(sheet).getByRole("list");
    expect(upload.className).toMatch(/(^|\s)min-h-44(\s|$)/);
    expect(grid).not.toContainElement(upload);
    // Before the grid in the document: the first thing after Close.
    expect(upload.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(grid).getAllByRole("button")).toHaveLength(2);
  });

  it("a tile opens the card with its actions and the On the page line; Close, Escape and the tile close it, the sheet stays", async () => {
    const { user, sheet } = await openDrawer();
    const tile = within(sheet).getByRole("button", { name: CAT_NAME });
    await user.click(tile);
    const card = within(sheet).getByRole("group", { name: /cat-1\.jpg/ });
    expect(within(card).getByText("On the page · hero")).toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Focal point", "Enhance…", "Remove", ""]);
    expect(
      within(card).getByRole("button", { name: `Remove ${CAT.fileName}` }),
    ).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Close" }));
    expect(within(sheet).queryByRole("group", { name: /cat-1\.jpg/ })).toBeNull();
    expect(tile).toHaveFocus();

    await user.click(tile);
    expect(within(sheet).getByRole("group", { name: /cat-1\.jpg/ })).toBeInTheDocument();
    // Escape is the card's first (review round 1, finding 1 — the card sits on the
    // dialog stack above the sheet): the card closes, the sheet stays; the next Escape
    // is the sheet's.
    await user.keyboard("{Escape}");
    expect(within(sheet).queryByRole("group", { name: /cat-1\.jpg/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Media · 2 items" })).toBeInTheDocument();
    expect(tile).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "Drawers" })).getByRole("button", {
        name: "Media",
      }),
    ).toHaveFocus();

    await user.click(
      within(screen.getByRole("navigation", { name: "Drawers" })).getByRole("button", {
        name: "Media",
      }),
    );
    const again = within(screen.getByRole("dialog", { name: "Media · 2 items" }));
    await user.click(again.getByRole("button", { name: CAT_NAME }));
    await user.click(again.getByRole("button", { name: CAT_NAME }));
    expect(again.queryByRole("group", { name: /cat-1\.jpg/ })).toBeNull();

    // The clip's card offers Trim, never Enhance.
    await user.click(again.getByRole("button", { name: CLIP_NAME }));
    const clip = again.getByRole("group", { name: /rain-day/ });
    expect(within(clip).getByRole("button", { name: "Trim" })).toBeInTheDocument();
    expect(within(clip).queryByRole("button", { name: "Enhance…" })).toBeNull();
    expect(within(clip).getByText("Not on the page yet")).toBeInTheDocument();
  });

  it("Focal point opens its sheet over the drawer; Escape closes the sheet alone and hands focus back to the card", async () => {
    const { user, sheet } = await openDrawer();
    await user.click(within(sheet).getByRole("button", { name: CAT_NAME }));
    const focal = within(sheet).getByRole("button", { name: "Focal point" });
    await user.click(focal);
    const picker = screen.getByRole("dialog", { name: "Where should the crop hold on?" });
    expect(picker).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Where should the crop hold on?" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Media · 2 items" })).toBeInTheDocument();
    expect(within(sheet).getByRole("group", { name: /cat-1\.jpg/ })).toBeInTheDocument();
    expect(focal).toHaveFocus();
  });

  it("Enhance… runs the library's enhance and opens the compare; Use enhanced replaces the hero's photo", async () => {
    actions.enhancePhoto.mockResolvedValue({ ok: true, asset: ENHANCED });
    const { user, sheet } = await openDrawer([CAT]);
    await user.click(within(sheet).getByRole("button", { name: CAT_NAME }));
    await user.click(within(sheet).getByRole("button", { name: "Enhance…" }));
    const compare = await screen.findByRole("dialog", { name: /enhanced photo in the hero/i });
    expect(actions.enhancePhoto).toHaveBeenCalledWith({ profileId: PID, mediaId: CAT.id });
    await user.click(within(compare).getByRole("button", { name: "Use enhanced" }));
    expect(screen.queryByRole("dialog", { name: /enhanced photo/i })).toBeNull();
    // The hero now shows the copy; the library holds both; the drawer is still up.
    expect(screen.getByRole("dialog", { name: "Media · 2 items" })).toBeInTheDocument();
    const hero = screen.getByRole("region", { name: /^HERO/ });
    expect(within(hero).getByRole("img")).toHaveAttribute("src", ENHANCED.cleanUrl);
  });

  it("Enter on a tile opens the card; Tab reaches Enhance… after Focal point and Enter opens the compare, whose Keep original takes focus (keyboard path)", async () => {
    // T049 part 2 (ADR-012): the drawer's card was only ever clicked above; the rail's
    // own proof (`MediaLibrary.editors.test.tsx`) never reaches `Enhance…`.
    actions.enhancePhoto.mockResolvedValue({ ok: true, asset: ENHANCED });
    const { user, sheet } = await openDrawer([CAT]);
    within(sheet).getByRole("button", { name: CAT_NAME }).focus();
    await user.keyboard("{Enter}");
    const card = within(sheet).getByRole("group", { name: /cat-1\.jpg/ });
    await user.tab();
    expect(within(card).getByRole("textbox", { name: "Description" })).toHaveFocus();
    await user.tab();
    expect(within(card).getByRole("button", { name: "Focal point" })).toHaveFocus();
    await user.tab();
    expect(within(card).getByRole("button", { name: "Enhance…" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const compare = await screen.findByRole("dialog", { name: /enhanced photo in the hero/i });
    expect(actions.enhancePhoto).toHaveBeenCalledTimes(1);
    expect(within(compare).getByRole("button", { name: "Keep original" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /enhanced photo/i })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Media · 2 items" })).toBeInTheDocument();
    const hero = screen.getByRole("region", { name: /^HERO/ });
    expect(within(hero).getByRole("img")).toHaveAttribute("src", CAT.cleanUrl);
  });

  it("a photo not on the page offers no Enhance… (there is no slot for the copy to go to)", async () => {
    const { user, sheet } = await openDrawer([CAT, photo("maaaaaab", "cat-2.jpg")]);
    await user.click(within(sheet).getByRole("button", { name: /cat-2\.jpg/ }));
    const card = within(sheet).getByRole("group", { name: /cat-2\.jpg/ });
    expect(within(card).getByText("Not on the page yet")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Enhance…" })).toBeNull();
  });

  it("a refused removal is the builder's one toast, under the sheet's Escape stack", async () => {
    actions.deleteMedia.mockResolvedValue({
      ok: false,
      error: {
        code: "refused",
        message: "Charlotte's live page uses this photo. Unpublish first.",
      },
    });
    const { user, sheet } = await openDrawer([CAT]);
    await user.click(within(sheet).getByRole("button", { name: CAT_NAME }));
    await user.click(within(sheet).getByRole("button", { name: `Remove ${CAT.fileName}` }));
    const question = screen.getByRole("dialog", { name: /^Remove cat-1/ });
    // Escape on the question answers the question alone: the drawer stays up.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /^Remove cat-1/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Media · 1 item" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: `Remove ${CAT.fileName}` }));
    await user.click(
      within(screen.getByRole("dialog", { name: /^Remove cat-1/ })).getByRole("button", {
        name: "Remove",
      }),
    );
    expect(question).not.toBeInTheDocument();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Charlotte's live page uses this photo. Unpublish first.");
    expect(within(sheet).getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
    // Above the sheet (review round 1, finding 2): the stack's layer outranks the scrim's.
    const layer = (el: Element | null) =>
      Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(el?.className ?? "")?.[1]);
    const stack = alert.closest("[data-toasts]");
    const scrim = sheet.parentElement;
    expect(layer(stack)).toBeGreaterThan(layer(scrim));
  });
});

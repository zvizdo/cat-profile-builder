import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishActionResult } from "@/app/actions/_lib/publishing";
import type { ProfileDocument } from "@/core/profile/schema";
import { Builder } from "@/ui/builder/Builder";
import type { Publication } from "@/ui/builder/use-publishing";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { BIO, DOC, HERO } from "../canvas-fixtures";
import { CAT, CAT_NAME } from "../media-fixtures";

// The phone builder (design 2026-09-13 §1–§2, §6; FR-091 as rewritten): under 768px the
// shell renders the one-column builder — the topbar with the name, undo/redo, Preview
// and Publish; Facts and Theme collapsed at the top of the canvas; the blocks with their
// editors in place and the phone label row; the add tile; and the bottom bar whose two
// tabs open the Media and CATalyst sheets. Nothing read-only, no preview, no
// `CANVAS · phone` label. From 768px the full builder is back, unchanged.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const actions = { publish: vi.fn<() => Promise<PublishActionResult>>() };
vi.mock("@/app/actions/publishing", () => ({
  publish: () => actions.publish(),
  unpublish: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
}));

const OLD_LABEL = "CANVAS · phone 390 · same sections, same order";
const fetchSpy = vi.fn<typeof fetch>();

/** `matchMedia` answering the phone query for a window `width` wide. */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === PHONE_QUERY && width < 768,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const scrollSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => Response.json({ updatedAt: "2026-09-11T12:00:00.000Z" }));
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockReset();
  actions.publish.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/** A hero on the photo and a bio with one paragraph, named, aged and sexed. */
const CAT_DOC: ProfileDocument = {
  ...DOC,
  age: "2 years",
  sex: "male",
  blocks: [
    { id: HERO, type: "hero", mediaId: CAT.id },
    { id: BIO, type: "bio", content: { paragraphs: [{ runs: [{ text: "Purrs." }] }] } },
  ],
};

const URL = "http://localhost:3000/cats/charlotte-abcdefgh";

function renderBuilder(
  doc: ProfileDocument = CAT_DOC,
  publication: Publication = { state: "draft", url: null },
) {
  return render(
    <Builder document={doc} assets={[CAT]} publication={publication} now={doc.updatedAt} />,
  );
}

const bar = () => screen.getByRole("banner");
const bottom = () => screen.getByRole("navigation", { name: "Drawers" });

describe("PhoneBuilder", () => {
  it("at 767px renders the one-column builder: the canvas, the frames, no preview", () => {
    stubWidth(767);
    renderBuilder();
    expect(screen.queryByText(OLD_LABEL)).toBeNull();
    expect(document.querySelector("[data-phone-canvas]")).toBeNull();
    expect(screen.getByRole("region", { name: "Canvas" })).toBeInTheDocument();
    // The frames and their editors are here, in place.
    expect(screen.getByRole("region", { name: /^HERO/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^BIO/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Bio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ add section" })).toBeInTheDocument();
    // The phone label row, never a drag handle.
    expect(screen.getByRole("button", { name: "Move up" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drag to reorder" })).toBeNull();
    // No rail: Add section is the tile's picker; Theme and Media have moved.
    expect(screen.queryByRole("region", { name: "Add section" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Media" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "CATalyst AI Assistant" })).toBeNull();
  });

  it("at 768px renders the full builder and none of the phone chrome", () => {
    stubWidth(768);
    renderBuilder();
    expect(screen.getByRole("region", { name: "Add section" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Drawers" })).toBeNull();
    expect(screen.getByRole("button", { name: "Drag to reorder" })).toBeInTheDocument();
  });

  it("the topbar holds the name, undo and redo, Preview as a page, and Publish", () => {
    stubWidth(390);
    renderBuilder();
    expect(within(bar()).getByRole("heading", { level: 1 })).toHaveTextContent("Charlotte");
    // The way back is the column's first row, not the bar's (the name keeps the bar).
    // F55 item 5: `‹ All cats` — a chevron and the words, no dangling slash with
    // nothing after it (the sweep's finding 5).
    expect(within(bar()).queryByRole("link", { name: /All cats/ })).toBeNull();
    const canvas = screen.getByRole("region", { name: "Canvas" });
    const back = within(canvas).getByRole("link", { name: "All cats" });
    expect(back).toHaveAttribute("href", "/builder");
    expect(back).not.toHaveTextContent("/");
    expect(back.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(canvas.firstElementChild).toContainElement(back);
    expect(within(bar()).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: "Redo" })).toBeInTheDocument();
    expect(within(bar()).getByRole("link", { name: "Preview" })).toHaveAttribute(
      "href",
      "/builder/abcdefgh/preview",
    );
    expect(within(bar()).getByRole("button", { name: "Publish" })).toBeInTheDocument();
    // The save state stays announced, as a status the eye does not see the words of.
    expect(within(bar()).getByRole("status")).toHaveTextContent(/^Draft saved/);
  });

  it("a live cat's menu opens with the save line as its first, plain line", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder(CAT_DOC, { state: "live", url: URL });
    // F55 item 7 amends F44: the trigger is `● Live` — the dot and one short word a
    // first-timer can read — no longer the dot alone (the sweep's finding 7). The
    // menu is named the same.
    const trigger = within(bar()).getByRole("button", { name: "Live" });
    expect(trigger).toHaveTextContent(/^Live$/);
    expect(trigger.className).not.toMatch(/(^|\s)size-44(\s|$)/);
    expect(trigger.querySelector("[aria-hidden]")).toHaveClass("bg-blue");
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Live" });
    const popup = menu.parentElement as HTMLElement;
    expect(popup.firstElementChild).toHaveTextContent(/^Draft saved/);
    expect(popup.firstElementChild).not.toHaveAttribute("role", "menuitem");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["View page", "Republish", "Unpublish", "Archive"]);
  });

  it("an archived cat's trigger reads ● Archived on the phone (F55 item 7)", () => {
    stubWidth(390);
    renderBuilder(CAT_DOC, { state: "archived", url: null });
    const trigger = within(bar()).getByRole("button", { name: "Archived" });
    expect(trigger).toHaveTextContent(/^Archived$/);
    expect(trigger.querySelector("[aria-hidden]")).toHaveClass("bg-meta");
  });

  it("Facts and Theme sit collapsed at the top of the stack, each one line; a press opens the fields", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder();
    const facts = screen.getByRole("region", { name: "Facts" });
    const theme = screen.getByRole("region", { name: "Theme" });
    expect(within(facts).getByRole("button", { name: /Facts/ })).toHaveTextContent(
      "Charlotte · 2 years · male",
    );
    expect(within(theme).getByRole("button", { name: /Theme/ })).toHaveTextContent(
      "Paper · warmth 0.50 · contrast 0.50",
    );
    expect(within(facts).queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Preset" })).toBeNull();
    // Facts before Theme before the hero.
    const canvas = screen.getByRole("region", { name: "Canvas" });
    const order = Array.from(canvas.querySelectorAll("section")).map(
      (s) => s.getAttribute("aria-label") ?? s.getAttribute("aria-labelledby"),
    );
    expect(order.indexOf(facts.getAttribute("aria-labelledby"))).toBeLessThan(
      order.indexOf(theme.getAttribute("aria-labelledby")),
    );

    await user.click(within(facts).getByRole("button", { name: /Facts/ }));
    const name = within(facts).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Mabel{Enter}");
    expect(within(bar()).getByRole("heading", { level: 1 })).toHaveTextContent("Mabel");
    expect(within(facts).getByRole("button", { name: /Facts/ })).toHaveTextContent(
      "Mabel · 2 years · male",
    );

    await user.click(within(theme).getByRole("button", { name: /Theme/ }));
    await user.click(screen.getByRole("radio", { name: "Sand" }));
    expect(within(theme).getByRole("button", { name: /Theme/ })).toHaveTextContent(
      "Sand · warmth 0.50 · contrast 0.50",
    );
    expect(
      screen.getAllByRole("status").some((el) => /contrast check/.test(el.textContent ?? "")),
    ).toBe(true);
  });

  it("opens Facts for a brand-new cat", () => {
    stubWidth(390);
    renderBuilder({ ...CAT_DOC, name: "" });
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Facts/ })).toHaveTextContent(
      "Unnamed cat · 2 years · male",
    );
  });

  it("a refused publish opens the collapsed Facts and reveals the gap", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    actions.publish.mockResolvedValue({
      ok: false,
      error: { code: "refused", message: "" },
      problems: [],
    });
    renderBuilder({ ...CAT_DOC, age: undefined });
    expect(screen.queryByRole("textbox", { name: "Age" })).toBeNull();
    await user.click(within(bar()).getByRole("button", { name: "Publish" }));
    const panel = await screen.findByRole("alert");
    expect(panel).toHaveTextContent("Add his age.");
    expect(screen.getByRole("textbox", { name: "Age" })).toHaveFocus();
  });

  it("the bottom bar's tabs open the Media and CATalyst sheets, swap, and close with Escape back to the tab", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder();
    const media = within(bottom()).getByRole("button", { name: "Media" });
    const catalyst = within(bottom()).getByRole("button", { name: "CATalyst" });

    await user.click(media);
    const mediaSheet = screen.getByRole("dialog", { name: "Media · 1 item" });
    expect(within(mediaSheet).getByRole("complementary", { name: "Media" })).toBeInTheDocument();
    expect(within(mediaSheet).getByRole("button", { name: CAT_NAME })).toBeInTheDocument();
    expect(media).toHaveAttribute("aria-expanded", "true");
    expect(media).toHaveAttribute("aria-controls", mediaSheet.id);
    // The bar stays under the sheet (covered, and inert behind `aria-modal`): it is what
    // focus goes back to.
    expect(mediaSheet).toHaveAttribute("aria-modal", "true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(bottom()).getByRole("button", { name: "Media" })).toHaveFocus();

    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    const helperSheet = screen.getByRole("dialog", { name: "CATalyst AI Assistant" });
    // The sheet is the one landmark: the panel inside it is no `aside` of the same name.
    expect(within(helperSheet).queryByRole("complementary")).toBeNull();
    expect(within(helperSheet).getByPlaceholderText("Ask for a change…")).toBeInTheDocument();
    await user.click(within(helperSheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(catalyst).toHaveFocus();
    expect(catalyst).toHaveAttribute("aria-expanded", "false");
  });

  // F45: a bio chip sends from the canvas and the drawer peeks (design §4) — the sheet
  // opened from the peek hands focus back to the peek on Escape, the way any opener gets
  // it back (its state machine is `catalyst-drawer.test.tsx`).
  it("a bio chip sends into the peek; Full opened from the peek hands focus back to it", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder();
    const rewrite = within(screen.getByRole("region", { name: /^BIO/ })).getByRole("button", {
      name: "rewrite",
    });
    await user.click(rewrite);
    expect(screen.queryByRole("dialog")).toBeNull();
    const peek = screen.getByRole("button", { name: "open CATalyst" });
    await user.click(peek);
    expect(screen.getByRole("dialog", { name: "CATalyst AI Assistant" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "open CATalyst" })).toHaveFocus();
  });

  it("the Media sheet's title counts the library", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder();
    await user.click(within(bottom()).getByRole("button", { name: "Media" }));
    expect(screen.getByRole("heading", { level: 2, name: "Media · 1 item" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /^Media · / })).toHaveLength(1);
  });

  it("↓ moves a section and keeps focus on the button that moved it", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder({
      ...CAT_DOC,
      blocks: [...CAT_DOC.blocks, { id: "galleryaaaaa", type: "gallery", mediaIds: [] }],
    });
    const bio = screen.getByRole("region", { name: /^BIO/ });
    await user.click(within(bio).getByRole("button", { name: "Move down" }));
    const types = Array.from(document.querySelectorAll("[data-block-type]")).map((el) =>
      el.getAttribute("data-block-type"),
    );
    expect(types).toEqual(["hero", "gallery", "bio"]);
    const down = within(screen.getByRole("region", { name: /^BIO/ })).getByRole("button", {
      name: "Move down",
    });
    expect(down).toHaveFocus();
    // The moved section must stay in view: a moved sibling leaves the pressed button
    // where it was in the DOM, so a plain `focus()` scrolls nothing (review, finding 4).
    expect(scrollSpy).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollSpy.mock.instances.at(-1)).toBe(down);
  });

  it("remove asks first, in the modal, and the section leaves", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder();
    await user.click(
      within(screen.getByRole("region", { name: /^BIO/ })).getByRole("button", { name: "remove" }),
    );
    const question = screen.getByRole("dialog", { name: /^Remove/ });
    await user.click(within(question).getByRole("button", { name: "Remove section" }));
    expect(screen.queryByRole("region", { name: /^BIO/ })).toBeNull();
  });

  // F56: the focal sheet's body names the cat by pronoun (`bodyFor` in FocalPicker.tsx,
  // read from `useCatSex()`) wherever `MediaEditors` mounts it on the phone — from the
  // hero's own `focal point` chip on the canvas (`PhoneMain`'s copy, up while the Media
  // sheet is down) and from a tile's `Focal point` card inside the Media sheet
  // (`PhoneMediaDrawer`'s copy, mounted by `FullDrawers`). Both must sit under the same
  // `CatSexProvider` the rest of the phone tree reads pronouns from (`BioEditor`,
  // `NeedsEditor`, `QuoteEditor`) — CAT_DOC records `sex: "male"`.
  it("the hero's focal point sheet says 'his', from the canvas chip and from the Media drawer's card", async () => {
    stubWidth(390);
    const user = userEvent.setup();
    renderBuilder();
    const wantsHis =
      "Tap his face. Every crop on the site, the phone and the carousel is derived from this one point.";

    // The canvas: the hero's `focal point` chip, while the Media sheet is down.
    await user.click(
      within(screen.getByRole("region", { name: /^HERO/ })).getByRole("button", {
        name: "focal point",
      }),
    );
    const canvasSheet = screen.getByRole("dialog", { name: "Where should the crop hold on?" });
    expect(canvasSheet).toHaveAccessibleDescription(wantsHis);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    // The Media drawer: the tile's card, `Focal point`, while the sheet is up.
    await user.click(within(bottom()).getByRole("button", { name: "Media" }));
    const mediaSheet = screen.getByRole("dialog", { name: "Media · 1 item" });
    await user.click(within(mediaSheet).getByRole("button", { name: CAT_NAME }));
    await user.click(within(mediaSheet).getByRole("button", { name: "Focal point" }));
    const drawerSheet = screen.getByRole("dialog", { name: "Where should the crop hold on?" });
    expect(drawerSheet).toHaveAccessibleDescription(wantsHis);
  });

  it("every control carries the 44px floor", () => {
    stubWidth(390);
    renderBuilder();
    const TAP = /(^|\s)(min-h-44|size-44|py-12|aspect-square|aspect-\[4\/3\])(\s|$)/;
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"),
    ).filter((el) => !(el instanceof HTMLInputElement && el.type === "file"));
    expect(controls.length).toBeGreaterThan(8);
    for (const el of controls) {
      expect(el.className, `${el.tagName} "${el.textContent}"`).toMatch(TAP);
    }
  });
});

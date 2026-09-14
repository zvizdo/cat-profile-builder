import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishActionResult } from "@/app/actions/_lib/publishing";
import type { ProfileDocument } from "@/core/profile/schema";
import { Builder } from "@/ui/builder/Builder";
import type { Publication } from "@/ui/builder/use-publishing";
import { BIO, DOC, HERO } from "./canvas-fixtures";
import { CAT } from "./media-fixtures";

// Publishing from the builder (FR-031, FR-056, FR-058, FR-060, FR-086, FR-087; CONTENT.md
// → Toasts, Modals, Publish validation): the readiness panel lists the server's problems
// and scrolls to the first gap; the contrast question's `Restore to passing` is exactly
// the `set_theme` core's `restoreToPassing` gives, recorded so ⌘Z brings the theme back;
// the state menu offers the ways on for a live and an archived cat; unpublish asks first
// and offers Undo. The Server Actions are fakes; the draft PUT is a stubbed fetch.

const actions = {
  publish: vi.fn<() => Promise<PublishActionResult>>(),
  unpublish: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
};
vi.mock("@/app/actions/publishing", () => ({
  publish: () => actions.publish(),
  unpublish: () => actions.unpublish(),
  archive: () => actions.archive(),
  restore: () => actions.restore(),
}));

const URL = "http://localhost:3000/cats/charlotte-abcdefgh";
const LIVE: PublishActionResult = { ok: true, url: URL, warnings: [] };
const fetchSpy = vi.fn<typeof fetch>();
const scrollSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => Response.json({ updatedAt: "2026-09-11T12:00:00.000Z" }));
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockReset();
  for (const action of Object.values(actions)) action.mockReset();
  actions.publish.mockResolvedValue(LIVE);
  actions.unpublish.mockResolvedValue({ ok: true });
  actions.archive.mockResolvedValue({ ok: true });
  actions.restore.mockResolvedValue({ ok: true, url: URL });
});
afterEach(() => vi.unstubAllGlobals());

const DRAFT: Publication = { state: "draft", url: null };

/** A document with nothing missing, so only the contrast can stand in the way. Its hero's
 *  photo is `CAT` — pass `[CAT]` as `renderBuilder`'s assets so the library resolves it. */
const READY: ProfileDocument = {
  ...DOC,
  age: "3 years",
  sex: "female",
  blocks: [
    { id: HERO, type: "hero", mediaId: CAT.id },
    { id: BIO, type: "bio", content: { paragraphs: [{ runs: [{ text: "Purrs." }] }] } },
  ],
};

function renderBuilder(
  doc: ProfileDocument = DOC,
  publication: Publication = DRAFT,
  assets: (typeof CAT)[] = [],
) {
  return render(
    <Builder document={doc} assets={assets} publication={publication} now={doc.updatedAt} />,
  );
}

const publishButton = () => screen.getByRole("button", { name: "Publish" });

describe("readiness", () => {
  it("lists what is missing as a lead and buttons, and scrolls to and focuses the first gap", async () => {
    const user = userEvent.setup();
    actions.publish.mockResolvedValue({
      ok: false,
      error: { code: "refused", message: "Two things missing: …" },
      problems: ["Give the cat a name.", "The bio is empty."],
    });
    renderBuilder(
      {
        ...DOC,
        name: "",
        age: "3 years",
        sex: "female",
        blocks: [
          { id: HERO, type: "hero", mediaId: CAT.id },
          { id: BIO, type: "bio", content: { paragraphs: [] } },
        ],
      },
      DRAFT,
      [CAT],
    );
    await user.click(publishButton());
    const panel = await screen.findByRole("alert");
    expect(panel).toHaveAccessibleName("Two things missing:");
    const items = within(panel)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(items).toEqual(["Give the cat a name.", "The bio is empty."]);
    // The first gap is the name field: scrolled to and focused without a click.
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();

    await user.click(within(panel).getByRole("button", { name: "The bio is empty." }));
    expect(scrollSpy).toHaveBeenCalledTimes(2);
    const frame = document.getElementById(`block-${BIO}`);
    expect(frame).not.toBeNull();
    expect(frame).toContainElement(document.activeElement as HTMLElement);

    await user.click(within(panel).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a problem's button is reached by Tab and Enter reveals its gap; Dismiss closes from the keyboard (keyboard path)", async () => {
    const user = userEvent.setup();
    actions.publish.mockResolvedValue({
      ok: false,
      error: { code: "refused", message: "…" },
      problems: ["Give the cat a name.", "The bio is empty."],
    });
    renderBuilder(
      {
        ...DOC,
        name: "",
        age: "3 years",
        sex: "female",
        blocks: [
          { id: HERO, type: "hero", mediaId: CAT.id },
          { id: BIO, type: "bio", content: { paragraphs: [] } },
        ],
      },
      DRAFT,
      [CAT],
    );
    publishButton().focus();
    await user.keyboard("{Enter}");
    const panel = await screen.findByRole("alert");
    // The refusal focused the first gap, the name; Shift+Tab walks back into the panel.
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
    within(panel).getByRole("button", { name: "Give the cat a name." }).focus();
    await user.tab();
    expect(within(panel).getByRole("button", { name: "The bio is empty." })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(document.getElementById(`block-${BIO}`)).toContainElement(
      document.activeElement as HTMLElement,
    );
    within(panel).getByRole("button", { name: "Dismiss" }).focus();
    await user.keyboard(" ");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("focuses the editor's own control, never the drag handle: the photo picker, the hero's photo", async () => {
    const user = userEvent.setup();
    actions.publish.mockResolvedValue({
      ok: false,
      error: { code: "refused", message: "…" },
      problems: ["The hero has no photo.", "The photo section has no photo."],
    });
    renderBuilder({
      ...DOC,
      age: "3 years",
      sex: "female",
      blocks: [
        { id: HERO, type: "hero", mediaId: null },
        { id: "photoaaaaaaa", type: "photo", mediaId: null },
      ],
    });
    await user.click(publishButton());
    const panel = await screen.findByRole("alert");
    // The first gap, revealed on refusal: the hero's own picker, inside the hero frame.
    expect(document.activeElement).toHaveAccessibleName("Pick a photo");
    expect(document.getElementById(`block-${HERO}`)).toContainElement(
      document.activeElement as HTMLElement,
    );
    await user.click(
      within(panel).getByRole("button", { name: "The photo section has no photo." }),
    );
    expect(document.activeElement).toHaveAccessibleName("Pick a photo");
    expect(document.getElementById("block-photoaaaaaaa")).toContainElement(
      document.activeElement as HTMLElement,
    );
    expect(document.activeElement).not.toHaveAccessibleName(/Drag|Move/);
  });

  it("follows the live document: a fixed item leaves the list, and the panel goes when nothing is missing", async () => {
    const user = userEvent.setup();
    actions.publish.mockResolvedValue({
      ok: false,
      error: { code: "refused", message: "…" },
      problems: ["Give the cat a name."],
    });
    renderBuilder({ ...READY, name: "" }, DRAFT, [CAT]);
    await user.click(publishButton());
    const panel = await screen.findByRole("alert");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(1);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Charlotte{Enter}");
    expect(screen.queryByRole("alert")).toBeNull();
    // A revealed gap is revealed once per refusal, not on every edit.
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("sends the pending draft before asking the server to publish", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.type(screen.getByRole("textbox", { name: "Age" }), "3{Enter}");
    await user.click(publishButton());
    await waitFor(() => expect(actions.publish).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as ProfileDocument;
    expect(body.age).toBe("3");
    expect(fetchSpy.mock.invocationCallOrder[0]).toBeLessThan(
      actions.publish.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("shows a failed save as the error and does not publish", async () => {
    const user = userEvent.setup();
    fetchSpy.mockImplementation(async () =>
      Response.json(
        { error: { code: "invalid", message: "The name is too long." } },
        { status: 400 },
      ),
    );
    renderBuilder();
    await user.type(screen.getByRole("textbox", { name: "Age" }), "3{Enter}");
    await user.click(publishButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("The name is too long.");
    expect(actions.publish).not.toHaveBeenCalled();
  });
});

describe("the contrast question (FR-031)", () => {
  const FAILING: ProfileDocument = {
    ...READY,
    theme: { preset: "sand", warmth: 0.5, contrast: 0 },
  };

  it("names what fails; Restore to passing is one undoable set_theme to 0.5/0.5, then publishes", async () => {
    const user = userEvent.setup();
    renderBuilder(FAILING, DRAFT, [CAT]);
    await user.click(publishButton());
    const dialog = screen.getByRole("dialog", { name: "The text may be hard to read." });
    expect(dialog).toHaveAccessibleDescription(
      "Sand at this contrast is 3.0:1; the floor is 4.5:1.",
    );
    expect(actions.publish).not.toHaveBeenCalled();
    // Restore to passing is the primary answer; Publish anyway and Not now are outlines.
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Not now",
      "Publish anyway",
      "Restore to passing",
    ]);
    expect(buttons[2]).toHaveClass("bg-blue");
    expect(buttons[1]).not.toHaveClass("bg-blue");

    await user.click(within(dialog).getByRole("button", { name: "Restore to passing" }));
    const slider = (name: string) => screen.getByRole("slider", { name });
    expect(slider("contrast")).toHaveValue("0.5");
    expect(slider("warmth")).toHaveValue("0.5");
    await waitFor(() => expect(actions.publish).toHaveBeenCalledTimes(1));
    // The published draft carries the restored theme, sent before the call.
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as ProfileDocument;
    expect(body.theme).toEqual({ preset: "sand", warmth: 0.5, contrast: 0.5 });
    expect(
      await screen.findByText(`Charlotte is live at ${URL.replace("http://", "")}.`),
    ).toBeVisible();

    await user.keyboard("{Meta>}z{/Meta}");
    expect(slider("contrast")).toHaveValue("0");
  });

  it("Publish anyway publishes over the warning; Not now and Escape publish nothing", async () => {
    const user = userEvent.setup();
    renderBuilder(FAILING, DRAFT, [CAT]);
    await user.click(publishButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(publishButton());
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(actions.publish).not.toHaveBeenCalled();
    await user.click(publishButton());
    await user.click(screen.getByRole("button", { name: "Publish anyway" }));
    await waitFor(() => expect(actions.publish).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("slider", { name: "contrast" })).toHaveValue("0");
    expect(await screen.findByRole("button", { name: "Published" })).toBeInTheDocument();
  });
});

describe("the topbar's size", () => {
  it("Publish and the Published trigger are dense chrome buttons; the trigger's dot is 6px", () => {
    const { unmount } = renderBuilder();
    expect(publishButton()).toHaveClass("text-ui-dense", "min-h-44");
    expect(publishButton()).not.toHaveClass("text-ui");
    unmount();
    renderBuilder(DOC, { state: "live", url: URL });
    const trigger = screen.getByRole("button", { name: "Published" });
    expect(trigger).toHaveClass("text-ui-dense", "min-h-44");
    const dot = trigger.querySelector("[aria-hidden]");
    expect(dot).toHaveClass("size-6", "bg-blue");
    expect(dot).not.toHaveClass("size-8");
  });
});

describe("the state menu", () => {
  const LIVE_CAT: Publication = { state: "live", url: URL };

  it("offers the page, republish, unpublish and archive for a live cat, by keyboard", async () => {
    const user = userEvent.setup();
    renderBuilder(DOC, LIVE_CAT);
    const trigger = screen.getByRole("button", { name: "Published" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Published" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "View page",
      "Republish",
      "Unpublish",
      "Archive",
    ]);
    expect(items[0]).toHaveAttribute("href", URL);
    expect(items[0]).toHaveAttribute("target", "_blank");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(items[3]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[3]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    // Tab closes too, so focus never lands behind an open menu.
    await user.click(trigger);
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("opens from Enter on the trigger and Enter on an item runs it — Republish publishes (keyboard path)", async () => {
    const user = userEvent.setup();
    renderBuilder(DOC, LIVE_CAT);
    const trigger = screen.getByRole("button", { name: "Published" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = screen.getByRole("menu", { name: "Published" });
    expect(within(menu).getByRole("menuitem", { name: "View page" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(within(menu).getByRole("menuitem", { name: "Republish" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(actions.publish).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      await screen.findByText(`Charlotte is live at ${URL.replace("http://", "")}.`),
    ).toBeVisible();
  });

  it("unpublish asks first in CONTENT.md's words, then offers Undo, which publishes again", async () => {
    const user = userEvent.setup();
    renderBuilder({ ...DOC, sex: "female" }, LIVE_CAT);
    await user.click(screen.getByRole("button", { name: "Published" }));
    await user.click(screen.getByRole("menuitem", { name: "Unpublish" }));
    const dialog = screen.getByRole("dialog", { name: "Take Charlotte off the site?" });
    expect(dialog).toHaveAccessibleDescription(
      "Her page stops working and she leaves the event carousel. Everything you wrote is kept as a draft.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Keep her live" }));
    expect(actions.unpublish).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Published" }));
    await user.click(screen.getByRole("menuitem", { name: "Unpublish" }));
    await user.click(screen.getByRole("button", { name: "Move to draft" }));
    await waitFor(() => expect(actions.unpublish).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Publish" })).toBeInTheDocument();
    const toast = screen.getByText(
      "Charlotte is back to draft. She's off the site and off the carousel.",
    );
    expect(toast).toBeVisible();
    const region = toast.closest('[role="status"]');
    if (!(region instanceof HTMLElement)) throw new Error("no toast region");
    await user.click(within(region).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(actions.publish).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Published" })).toBeInTheDocument();
  });

  it("archive asks first, then offers Restore and Unpublish; Restore brings the page back", async () => {
    const user = userEvent.setup();
    renderBuilder({ ...DOC, sex: "male" }, LIVE_CAT);
    await user.click(screen.getByRole("button", { name: "Published" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    const dialog = screen.getByRole("dialog", { name: "Archive Charlotte?" });
    expect(dialog).toHaveAccessibleDescription(
      "His page comes down and he leaves the carousel. Everything is kept exactly as it was.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(actions.archive).toHaveBeenCalledTimes(1));
    const archived = await screen.findByRole("button", { name: "Archived" });
    await user.click(archived);
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Restore", "Unpublish"]);
    await user.click(screen.getByRole("menuitem", { name: "Unpublish" }));
    const ask = screen.getByRole("dialog", { name: "Take Charlotte off the site?" });
    expect(ask).toHaveAccessibleDescription(
      "He's archived now; this makes him a plain draft again.",
    );
    await user.click(within(ask).getByRole("button", { name: "Keep him archived" }));
    await user.click(archived);
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    await waitFor(() => expect(actions.restore).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Published" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View page" })).toBeInTheDocument();
  });

  it("shows an action's refusal as an error toast and changes nothing", async () => {
    const user = userEvent.setup();
    actions.archive.mockResolvedValue({
      ok: false,
      error: { code: "refused", message: "Only a live profile can be archived." },
    });
    renderBuilder(DOC, LIVE_CAT);
    await user.click(screen.getByRole("button", { name: "Published" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only a live profile can be archived.",
    );
    expect(screen.getByRole("button", { name: "Published" })).toBeInTheDocument();
  });

  it("the live toast opens the page in a new tab and goes away by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderBuilder();
    await user.click(publishButton());
    const view = await screen.findByRole("button", { name: "View page" });
    await user.click(view);
    expect(open).toHaveBeenCalledWith(URL, "_blank", "noopener,noreferrer");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.queryByRole("button", { name: "View page" })).toBeNull();
    vi.useRealTimers();
  });
});

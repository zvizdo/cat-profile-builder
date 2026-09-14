import type { LanguageModelV3, LanguageModelV3Prompt } from "@ai-sdk/provider";
import type { EditOperation } from "@/core/profile/operations";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callPart,
  finishPart,
  hasResult,
  resultCount,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
  userTurnCount,
} from "@/adapters/fake/scenarios/_shared";
import { Builder } from "@/ui/builder/Builder";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { HELPER_PANEL_ID } from "@/ui/builder/working-lock";
import { photoAsset } from "../../../unit/core/media/builders";
import { BIO_ID, bio, document, hero } from "../../../unit/core/profile/builders";
import { fakeChatFetch } from "../../helper/support";

// The CATalyst drawer's state machine on the phone (design 2026-09-13 §4; F45), driven
// through the real `Builder` tree at 390px over the real `createHelperStream` pipeline
// (`support.ts`): Full is the modal sheet; a send drops it to Peek — a 48px bar on the
// bottom bar with the working sentence — so the canvas is in view and follows the
// changes; a card, or a turn ending in a question, raises Half — a plain region, the
// canvas above it still reachable — with the card or the proposal and the composer;
// Apply / Not this and the sheet's Close drop back to Peek; the turn's end writes the
// receipt on the peek line; a tap on the peek is Full again. The one conversation
// survives every state and a resize across 768px (F11 — the old `surface-switch.test.tsx`
// case, folded in here).

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const HELPER = { name: "CATalyst AI Assistant" };
const PEEK = { name: "open CATalyst" };

/** A controllable `matchMedia`: the phone query flips with `goPhone`/`goFull` and fires
 * the `change` event `useSurface` listens for; every other query never matches. */
function stubMatchMedia(phone: boolean) {
  let matches = phone;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === PHONE_QUERY && matches;
    },
    media: query,
    addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
  }));
  const go = (to: boolean) =>
    act(() => {
      matches = to;
      listeners.forEach((cb) => cb());
    });
  return { goPhone: () => go(true), goFull: () => go(false) };
}

/** Calls `remove_block` on the bio (destructive, so it cards — FR-043), then says Done —
 * once per request when `everyTurn`, so a declined card can be asked for again. */
function removeBioModel(everyTurn = false): LanguageModelV3 {
  const asked = (prompt: LanguageModelV3Prompt) =>
    everyTurn
      ? resultCount(prompt, "remove_block") >= userTurnCount(prompt)
      : hasResult(prompt, "remove_block");
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "remove-bio",
    doStream: async ({ prompt }) => {
      if (!asked(prompt)) {
        // `everyTurn` also paces the card 200ms apart, so the peek before it can be seen.
        return {
          stream: scriptedStream(
            [
              STREAM_START,
              callPart("call-remove", "remove_block", { op: "remove_block", blockId: BIO_ID }),
              finishPart(TOOL_CALLS),
            ],
            everyTurn ? 200 : 0,
          ),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("done", "Done."), finishPart(STOP)]),
      };
    },
  });
}

const PROPOSAL = "A bio and a gallery, on the Sand theme. Want me to build this now?";

/** Answers every request with the proposal question (text only, `STOP`). */
function proposalModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "proposal",
    doStream: async () => ({
      stream: scriptedStream([STREAM_START, ...textParts("p", PROPOSAL), finishPart(STOP)]),
    }),
  });
}

/** Adds a photo section (additive: lands at once, no card), then says Done. */
function addPhotoModel(): LanguageModelV3 {
  const block = { type: "photo" as const, mediaId: null, caption: "" };
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "add-photo",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "add_block")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-add", "add_block", { op: "add_block", block }),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("done", "Done."), finishPart(STOP)]),
      };
    },
  });
}

type SetField = Extract<EditOperation, { op: "set_field" }>;

/** One destructive `set_field` (a card), then Done. */
function setFieldModel(op: SetField): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "set-field",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "set_field")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-set", "set_field", op),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("done", "Done."), finishPart(STOP)]),
      };
    },
  });
}

/** Shortens the bio to one line: a card that draws the word diff. */
function shortenBioModel(): LanguageModelV3 {
  const value = { paragraphs: [{ runs: [{ text: "A calm, curious cat who loves a lap." }] }] };
  return setFieldModel({
    op: "set_field",
    target: { kind: "block", blockId: BIO_ID },
    path: "content",
    value,
  });
}

/** Renames Charlotte to Marmalade: a pair short enough to read on the ledger line, so
 * the card draws no block. */
function renameModel(): LanguageModelV3 {
  return setFieldModel({
    op: "set_field",
    target: { kind: "profile" },
    path: "name",
    value: "Marmalade",
  });
}

function renderBuilder(model: LanguageModelV3, phone = true, bioText = "Charlotte is a lap cat.") {
  const doc = document({ blocks: [hero(), bio(bioText)] });
  const media = stubMatchMedia(phone);
  vi.stubGlobal("fetch", vi.fn(fakeChatFetch(model)));
  render(
    <Builder
      document={doc}
      assets={[photoAsset()]}
      publication={{ state: "draft", url: null }}
      now="2026-09-12T12:00:00.000Z"
    />,
  );
  return media;
}

const bottom = () => screen.getByRole("navigation", { name: "Drawers" });
const peek = () => screen.getByRole("button", PEEK);

describe("the CATalyst drawer's state machine", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("has no peek before a first send; a send from Full drops to Peek with the working line", async () => {
    renderBuilder(addPhotoModel());
    const user = userEvent.setup();
    expect(screen.queryByRole("button", PEEK)).toBeNull();
    expect(screen.queryByRole("region", HELPER)).toBeNull();

    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    const full = screen.getByRole("dialog", HELPER);
    await user.type(within(full).getByPlaceholderText("Ask for a change…"), "Add a photo.{Enter}");

    // Full is gone; the peek is a 48px bar reading the working sentence, and it is what
    // the read-only lock hands focus to.
    expect(screen.queryByRole("dialog")).toBeNull();
    const bar = peek();
    expect(bar).toHaveAttribute("id", HELPER_PANEL_ID);
    expect(bar).toHaveClass("h-peek");
    expect(bar).toHaveTextContent("CATalyst is working…");
    expect(within(bottom()).getByRole("button", { name: "CATalyst" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // The turn ends: the receipt on the line; the canvas got the section behind it. A
    // turn the peek shows is seen: the tab's disc does not light for it (review round 1,
    // finding 5).
    await waitFor(() => expect(peek()).toHaveTextContent("Applied — added photo section."));
    expect(screen.getByRole("region", { name: /^PHOTO/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    expect(
      within(bottom()).getByRole("button", { name: "CATalyst" }).querySelector("[data-disc]"),
    ).toBeNull();

    // A tap on the peek is Full again, with the conversation in it.
    await user.click(peek());
    const again = screen.getByRole("dialog", HELPER);
    expect(within(again).getByText("Add a photo.")).toBeInTheDocument();
    expect(within(again).getByRole("button", { name: "Undo these" })).toBeInTheDocument();
    // Close from Full is Peek, not nothing: the conversation has started.
    await user.click(within(again).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(peek()).toHaveTextContent("Applied — added photo section.");
  });

  it("a card raises Half with the card, the canvas still reachable; Apply drops to Peek; the receipt follows", async () => {
    renderBuilder(removeBioModel());
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(
      screen.getByPlaceholderText("Ask for a change…"),
      "Remove the bio, please.{Enter}",
    );

    // The card arrives: Half — a region, not a dialog — with the card and the composer.
    const region = await screen.findByRole("region", HELPER);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", PEEK)).toBeNull();
    expect(within(region).getByText("Proposed · 1 operation")).toBeInTheDocument();
    // One landmark, not two nested ones of the same name (review round 1, finding 6).
    expect(within(region).queryByRole("complementary")).toBeNull();
    expect(screen.getAllByRole("region", HELPER)).toHaveLength(1);
    expect(within(region).getByPlaceholderText("Ask for a change…")).toBeInTheDocument();
    expect(within(bottom()).getByRole("button", { name: "CATalyst" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // The canvas above is not inert: the bio is still there to read and reach.
    expect(screen.getByRole("textbox", { name: "Bio" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas" })).not.toHaveAttribute("aria-hidden");

    await user.click(within(region).getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    await waitFor(() => expect(peek()).toHaveTextContent("Applied — removed bio."));
    expect(screen.queryByRole("textbox", { name: "Bio" })).toBeNull();
  });

  // F58 (design §4): a card that draws a change block — one whose change would put Apply
  // under the Half sheet's fold — opens the drawer to Full, the change and Apply both in
  // reach without scrolling; a card without one (the remove-bio card above, the one-line
  // rename below) stays Half. Apply drops to Peek either way.
  it("a card that draws a change block opens Full, not Half; Apply drops to Peek", async () => {
    const long = `${Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ")}.`;
    renderBuilder(shortenBioModel(), true, long);
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(
      screen.getByPlaceholderText("Ask for a change…"),
      "Make the bio shorter{Enter}",
    );

    const full = await screen.findByRole("dialog", HELPER);
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    expect(within(full).getByText("Proposed · 1 operation")).toBeInTheDocument();
    expect(within(full).getByText("Shorten the bio.")).toBeInTheDocument();
    expect(within(full).getByRole("button", { name: "Show the full text" })).toBeInTheDocument();

    await user.click(within(full).getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(peek()).toHaveTextContent(/^Applied — /));
  });

  it("a card whose pair reads on the ledger line opens Half, as before F58", async () => {
    renderBuilder(renameModel());
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Rename her{Enter}");
    const region = await screen.findByRole("region", HELPER);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(region).getByText("Change the name.")).toBeInTheDocument();
    expect(within(region).getByText("Charlotte → Marmalade")).toBeInTheDocument();
    expect(region.querySelector("del")).toBeNull();
  });

  it("Not this drops to Peek too, and the sheet's Close on Half is Peek", async () => {
    renderBuilder(removeBioModel());
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(
      screen.getByPlaceholderText("Ask for a change…"),
      "Remove the bio, please.{Enter}",
    );
    const region = await screen.findByRole("region", HELPER);
    await user.click(within(region).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    // The card is still pending behind the peek: its sentence is the line.
    expect(peek()).toHaveTextContent("Remove the");
    await user.click(peek());
    await user.click(
      within(screen.getByRole("dialog", HELPER)).getByRole("button", { name: "Not this" }),
    );
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(peek()).toHaveTextContent("Done."));
    expect(screen.getByRole("textbox", { name: "Bio" })).toBeInTheDocument();
  });

  it("a turn ending in a question raises Half with the proposal and the composer", async () => {
    renderBuilder(proposalModel());
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Build the page{Enter}");
    const region = await screen.findByRole("region", HELPER);
    expect(within(region).getByText(PROPOSAL)).toBeInTheDocument();
    expect(within(region).getByPlaceholderText("Ask for a change…")).toBeEnabled();
    await user.click(within(region).getByRole("button", { name: "Close" }));
    expect(peek()).toHaveTextContent(PROPOSAL);
  });

  it("a bio chip sends from the canvas straight into Peek, and the lock parks focus on it", async () => {
    renderBuilder(addPhotoModel());
    const user = userEvent.setup();
    const rewrite = within(screen.getByRole("region", { name: /^BIO/ })).getByRole("button", {
      name: "rewrite",
    });
    await user.click(rewrite);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(peek()).toHaveTextContent("CATalyst is working…");
    expect(peek()).toHaveFocus();
    await waitFor(() => expect(peek()).toHaveTextContent("Applied — added photo section."));
  });

  it("a card raised at full width is answerable from the phone's Half, and back (F11)", async () => {
    const media = renderBuilder(removeBioModel(), false);
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("Ask for a change…"),
      "Remove the bio, please.{Enter}",
    );
    expect(await screen.findByText("Proposed · 1 operation")).toBeInTheDocument();

    media.goPhone();
    const region = await screen.findByRole("region", HELPER);
    expect(within(region).getByText("Proposed · 1 operation")).toBeInTheDocument();
    const onError = vi.fn();
    window.addEventListener("error", onError);
    await user.click(within(region).getByRole("button", { name: "Not this" }));
    window.removeEventListener("error", onError);
    expect(onError).not.toHaveBeenCalled();
    await waitFor(() => expect(peek()).toHaveTextContent("Done."));

    media.goFull();
    expect(screen.getByText("Remove the bio, please.")).toBeInTheDocument();
    expect(screen.getByText("Done.")).toBeInTheDocument();
  });

  // F45 addendum: the peek is dismissible — its chevron (`Hide CATalyst`) or a swipe down
  // closes the drawer; the next turn brings the peek back on its own, and a card raises
  // Half from closed as it would from Peek. A turn that ends behind a hidden peek is
  // unseen: the tab's disc lights for it.
  it("Hide CATalyst closes the peek; a send brings it back; a card raises Half from closed", async () => {
    renderBuilder(removeBioModel(true));
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Remove the bio.{Enter}");
    const region = await screen.findByRole("region", HELPER);
    await user.click(within(region).getByRole("button", { name: "Not this" }));
    await waitFor(() => expect(peek()).toHaveTextContent("Done."));

    await user.click(screen.getByRole("button", { name: "Hide CATalyst" }));
    expect(screen.queryByRole("button", PEEK)).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide CATalyst" })).toBeNull();
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    // Focus does not fall to the body: the CATalyst tab takes it.
    expect(within(bottom()).getByRole("button", { name: "CATalyst" })).toHaveFocus();

    // Closed + send (a bio chip): the peek is back, then the card raises Half.
    await user.click(
      within(screen.getByRole("region", { name: /^BIO/ })).getByRole("button", {
        name: "shorten",
      }),
    );
    expect(screen.getByRole("button", PEEK)).toBeInTheDocument();
    await screen.findByRole("region", HELPER);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Hide CATalyst" }));
    expect(screen.queryByRole("button", PEEK)).toBeNull();
    // The card is still waiting behind the closed peek: the disc stands still.
    expect(
      within(bottom()).getByRole("button", { name: "CATalyst" }).querySelector("[data-disc]"),
    ).not.toBeNull();
  });

  it("the peek's two controls sit before the bar in the Tab order; Enter opens Full, Space on the chevron hides it (keyboard path)", async () => {
    // T049 part 2 (ADR-012): `PeekBar` was only ever clicked above.
    renderBuilder(removeBioModel(true));
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Remove the bio.{Enter}");
    const region = await screen.findByRole("region", HELPER);
    await user.click(within(region).getByRole("button", { name: "Not this" }));
    await waitFor(() => expect(peek()).toHaveTextContent("Done."));

    // Shift+Tab from the bar's first tab reaches the chevron, then the line itself.
    within(bottom()).getByRole("button", { name: "Media" }).focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Hide CATalyst" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(peek()).toHaveFocus();
    await user.keyboard("{Enter}");
    const full = screen.getByRole("dialog", HELPER);
    expect(within(full).getByText("Remove the bio.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(peek()).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Hide CATalyst" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.queryByRole("button", PEEK)).toBeNull();
    expect(within(bottom()).getByRole("button", { name: "CATalyst" })).toHaveFocus();
  });

  it("a swipe down on the peek closes it, and a turn ending behind it lights the disc", async () => {
    renderBuilder(addPhotoModel());
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Add a photo.{Enter}");
    const bar = peek().parentElement as HTMLElement;
    fireEvent.pointerDown(bar, { clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: 760, pointerId: 1 });
    expect(screen.queryByRole("button", PEEK)).toBeNull();
    await waitFor(() =>
      expect(
        within(bottom()).getByRole("button", { name: "CATalyst" }).querySelector("[data-disc]"),
      ).not.toBeNull(),
    );
    // The tab opens Full with the receipt; Close from Full is Peek again.
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    const full = screen.getByRole("dialog", HELPER);
    expect(within(full).getByRole("button", { name: "Undo these" })).toBeInTheDocument();
    await user.click(within(full).getByRole("button", { name: "Close" }));
    expect(peek()).toHaveTextContent("Applied — added photo section.");
  });
});

import type { LanguageModelV3 } from "@ai-sdk/provider";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callPart,
  finishPart,
  hasResult,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
} from "@/adapters/fake/scenarios/_shared";
import type { ProfileDocument } from "@/core/profile/schema";
import { useDocument } from "@/ui/builder/use-document";
import { CollapsedTab, tabLabel } from "@/ui/helper/CollapsedTab";
import { HelperPanel } from "@/ui/helper/HelperPanel";
import { useHelper } from "@/ui/helper/use-helper";
import { photoAsset } from "../../unit/core/media/builders";
import { BIO_ID, bio, document as profile, hero } from "../../unit/core/profile/builders";
import { fakeChatFetch } from "./support";

// F27 (audit §3.9): collapsed, the docked column is a 52px tab — the toggle at its top,
// named "open CATalyst", and the name run down the column — and the landmark stays the
// same `aside`, so nothing that looks the panel up by name has to know which state it is
// in. A card that arrives behind the closed tab is counted on it; opening shows the card.

const HELPER = { name: "CATalyst AI Assistant" };
const OPEN = { name: "open CATalyst" };
const CLOSE = { name: "collapse CATalyst" };

// One stable list: a fresh array each render would re-run every effect keyed on it.
const ASSETS = [photoAsset()];

function Harness({ doc }: { doc: ProfileDocument }) {
  const session = useDocument(doc, ASSETS);
  const helper = useHelper({ session, assets: ASSETS });
  return <HelperPanel session={session} helper={helper} />;
}

function readyDoc() {
  return profile({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
}

/** Calls `remove_block` on the bio (destructive, so it cards), then stops. */
function removeBioModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "remove-bio",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "remove_block")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-remove", "remove_block", { op: "remove_block", blockId: BIO_ID }),
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

/** Adds one bio block (applied at once, no card), then a plain-text reply. */
function addBioModel(): LanguageModelV3 {
  const block = { type: "bio" as const, content: { paragraphs: [] } };
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "add-bio",
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
        stream: scriptedStream([STREAM_START, ...textParts("t", "Added a bio."), finishPart(STOP)]),
      };
    },
  });
}

/** The disc inside the tab's toggle. */
function disc() {
  return screen.getByRole("button", OPEN).firstElementChild;
}

describe("tabLabel", () => {
  it("is the name alone with nothing waiting, and counts suggestions in words", () => {
    expect(tabLabel(0)).toBe("CATalyst");
    expect(tabLabel(1)).toBe("CATalyst · 1 suggestion");
    expect(tabLabel(2)).toBe("CATalyst · 2 suggestions");
  });
});

describe("CollapsedTab", () => {
  it("sizes the disc from the helperDisc token, not the arbitrary pixel literal (F28 review #18)", () => {
    render(<CollapsedTab suggestions={0} unread={false} onOpen={() => undefined} />);
    const disc = screen.getByRole("button", { name: "open CATalyst" }).querySelector("span");
    expect(disc).toHaveClass("size-helper-disc");
    expect(disc?.className).not.toMatch(/size-\[26px\]/);
  });
});

describe("HelperPanel collapsed to the tab", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("collapses to a tab whose toggle opens it, keeping the landmark and the thread", async () => {
    const user = userEvent.setup();
    render(<Harness doc={readyDoc()} />);
    const aside = screen.getByRole("complementary", HELPER);
    expect(aside).toHaveClass("w-helper");
    expect(screen.getByRole("button", CLOSE)).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", CLOSE));

    // The same landmark, now at the tab's width; the composer is off the accessibility
    // tree, not torn down (the conversation must survive, F11).
    expect(screen.getByRole("complementary", HELPER)).toBe(aside);
    expect(aside).toHaveClass("w-helper-tab");
    const open = screen.getByRole("button", OPEN);
    expect(open).toHaveAttribute("aria-expanded", "false");
    expect(open).toHaveAccessibleDescription("CATalyst");
    // The label is the mono voice at the 10px floor (audit §3.9), never the 11px label
    // size beside it — the two font-size utilities would compete and the 11px wins.
    const label = screen.getByText("CATalyst");
    expect(label).toHaveClass("font-label", "text-mono-floor", "uppercase", "text-vertical");
    expect(label).not.toHaveClass("text-mono-label");
    expect(screen.queryByRole("button", CLOSE)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Ask for a change…")).not.toBeVisible();
    expect(screen.queryByText("sees this page · cannot publish")).not.toBeVisible();

    await user.click(open);
    expect(aside).toHaveClass("w-helper");
    expect(screen.getByPlaceholderText("Ask for a change…")).toBeVisible();
    expect(screen.getByRole("button", CLOSE)).toHaveAttribute("aria-expanded", "true");
  });

  it("keyboard path: focus follows the press to the tab; Tab reaches it and Enter opens", async () => {
    const user = userEvent.setup();
    render(<Harness doc={readyDoc()} />);

    // The composer claims focus on mount (its own rule); the toggle is two stops back,
    // past the conversation log (a scroll region in the tab order).
    expect(screen.getByPlaceholderText("Ask for a change…")).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("log", { name: "Conversation" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", CLOSE)).toHaveFocus();
    await user.keyboard("{Enter}");

    // The pressed toggle unmounted; its replacement holds focus, so the next Tab does
    // not fall to the body. Then from nowhere: one Tab reaches it (the hidden body has
    // nothing tabbable), Enter opens, and the header's toggle takes focus in turn.
    expect(screen.getByRole("button", OPEN)).toHaveFocus();
    screen.getByRole("button", OPEN).blur();
    expect(document.body).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", OPEN)).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", CLOSE)).toHaveFocus();
    expect(screen.getByRole("button", CLOSE)).toHaveAttribute("aria-expanded", "true");
  });

  it("a pointer press keeps focus inside the landmark without ringing the new toggle", async () => {
    const user = userEvent.setup();
    render(<Harness doc={readyDoc()} />);
    const aside = screen.getByRole("complementary", HELPER);

    // A mouse press: the pressed toggle unmounts, and focus goes to the `aside` itself
    // (not to `body`, and not to a control nobody keyed to), so a later Tab still starts
    // inside the panel — at the tab's own disc.
    await user.click(screen.getByRole("button", CLOSE));
    expect(aside).toHaveFocus();
    expect(screen.getByRole("button", OPEN)).not.toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", OPEN)).toHaveFocus();

    await user.click(screen.getByRole("button", OPEN));
    expect(aside).toHaveFocus();
    expect(screen.getByRole("button", CLOSE)).not.toHaveFocus();
  });

  it("counts a card that arrives behind the closed tab, and opening shows the card", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const user = userEvent.setup();
    render(<Harness doc={readyDoc()} />);

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Remove the bio{Enter}");
    await user.click(screen.getByRole("button", CLOSE));

    await screen.findByText("CATalyst · 1 suggestion");
    expect(screen.getByRole("button", OPEN)).toHaveAccessibleDescription("CATalyst · 1 suggestion");
    // The card is in the tree but not reachable while the tab is closed.
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", OPEN));
    expect(screen.getByRole("button", { name: "Apply" })).toBeVisible();
    expect(screen.getByText("Proposed · 1 operation")).toBeVisible();
    expect(screen.queryByText("CATalyst · 1 suggestion")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Not this" }));
    await waitFor(() =>
      expect(screen.queryByText("Proposed · 1 operation")).not.toBeInTheDocument(),
    );
  });

  it("lights the disc when a turn ends behind the closed tab, and opening clears it", async () => {
    // The reply is held until the tab has closed, so the turn ends behind it for sure.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const answer = fakeChatFetch(addBioModel());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        await gate;
        return answer(url, init);
      }),
    );
    const user = userEvent.setup();
    render(<Harness doc={profile({ blocks: [hero()] })} />);

    // Nothing waits: a quiet outline, no glyph.
    await user.click(screen.getByRole("button", CLOSE));
    expect(disc()).not.toHaveClass("bg-blue");
    expect(disc()).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", OPEN));

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Write a bio.{Enter}");
    await user.click(screen.getByRole("button", CLOSE));
    release();
    // The turn applies its edit and ends while the tab is closed: the disc lights, but
    // there is no card to count — the label stays the name.
    await waitFor(() => expect(disc()).toHaveClass("bg-blue"));
    expect(screen.getByText("CATalyst")).toBeInTheDocument();
    expect(screen.queryByText(/suggestion/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", OPEN));
    expect(screen.getByText("Added a bio.")).toBeVisible();
    await user.click(screen.getByRole("button", CLOSE));
    expect(disc()).not.toHaveClass("bg-blue");
  });
});

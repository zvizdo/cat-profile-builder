import type { LanguageModelV3 } from "@ai-sdk/provider";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockLanguageModelV3 } from "ai/test";
import { useEffect } from "react";
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
import type { MediaAsset } from "@/core/media/schema";
import type { PendingCard } from "@/core/helper/reducer";
import type { ProfileDocument } from "@/core/profile/schema";
import { useDocument, type DocumentSession } from "@/ui/builder/use-document";
import { HelperPanel } from "@/ui/helper/HelperPanel";
import { useHelper } from "@/ui/helper/use-helper";
import { photoAsset } from "../../unit/core/media/builders";
import { BIO_ID, bio, document, hero } from "../../unit/core/profile/builders";
import { CARD, renderCard } from "./card-harness";
import { fakeChatFetch } from "./support";

// T038 "Tests first": keyboard order (Tab reaches Apply, then Not this), Escape = Not
// this, Apply dispatches `onApply` exactly once even under a rapid double click, and the
// consequence notice shows only when the caller's own `describe(card.op)` says the
// operation is destructive — the component never guesses that from the operation's shape.
// The last test drives the real reducer through `HelperPanel` (as the T036 tests do) to
// check the one thing that isn't a `ProposalCard`-only concern: the document stays the
// exact same object, by reference, for as long as the card is open.

describe("ProposalCard", () => {
  // F26 (audit §3.5): the ledger row carries the summary's first sentence next to a
  // mono key; the destructive second sentence appears once, as the notice's heading —
  // never twice — so the whole summary is no longer one text node.
  it("shows the mono header, the ledger row (key + first sentence), and one undo, lowercase", () => {
    renderCard();
    expect(screen.getByText("Proposed · 1 operation")).toBeInTheDocument();
    expect(screen.getByText("section")).toBeInTheDocument();
    expect(screen.getByText("Remove the video.")).toBeInTheDocument();
    expect(screen.queryByText(CARD.summary)).not.toBeInTheDocument();
    expect(screen.getByText("one undo")).toBeInTheDocument();
    expect(screen.getByText("one undo")).not.toHaveClass("uppercase");
  });

  it("shows the whole summary in the row when the operation is not destructive", () => {
    const card: PendingCard = {
      toolCallId: "call-2",
      op: { op: "reorder_blocks", order: [] },
      summary: "Move the quote above the bio.",
    };
    renderCard({ card, destructive: false });
    expect(screen.getByText("order")).toBeInTheDocument();
    expect(screen.getByText("Move the quote above the bio.")).toBeInTheDocument();
  });

  it("shows describe()'s readout after the sentence, with its unit once", () => {
    renderCard({ readout: { before: "41", after: "9", unit: "words" } });
    expect(screen.getByText("41 → 9 words")).toBeInTheDocument();
  });

  it("paints a swatch pair for a theme readout, from the two themes it carries", () => {
    const paper = { preset: "paper" as const, warmth: 0.5, contrast: 0.5 };
    const sand = { preset: "sand" as const, warmth: 0.5, contrast: 0.5 };
    const { container } = renderCard({
      card: {
        toolCallId: "call-3",
        op: { op: "set_theme", preset: "sand" },
        summary: "Set the theme to Sand.",
      },
      destructive: false,
      readout: { before: "Paper", after: "Sand", themes: { before: paper, after: sand } },
    });
    expect(screen.getByText("theme")).toBeInTheDocument();
    expect(screen.getByText("Paper → Sand")).toBeInTheDocument();
    const swatches = container.querySelectorAll<HTMLElement>(".theme-swatch");
    expect(swatches).toHaveLength(2);
    expect(swatches[0]?.style.getPropertyValue("--profile-bg-a")).toBe("#F6F4F0");
    expect(swatches[1]?.style.getPropertyValue("--profile-bg-a")).toBe("#EFE6D8");
  });

  it("shows the clay consequence notice with its heading (period dropped) and describe()'s own detail", () => {
    renderCard({ destructive: true });
    // T038 review, finding 3: the heading is the summary's own last sentence, without its
    // trailing period — CONTENT.md and the hi-fi both show it that way.
    expect(
      screen.getByText("Removing the video takes the clip off Charlotte's page"),
    ).toBeInTheDocument();
    // T038 review, finding 2: the notice renders whatever `describe(card.op).detail` says —
    // never a constant of its own — so a distinct string here proves the plumbing, not a
    // coincidence with a hardcoded default.
    expect(screen.getByText("Detail text for the notice.")).toBeInTheDocument();
  });

  it("shows no consequence notice when the operation is not destructive", () => {
    renderCard({ destructive: false });
    expect(screen.queryByText("Detail text for the notice.")).not.toBeInTheDocument();
  });

  it("keyboard: Tab reaches Apply, then Not this", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.tab();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Not this" })).toHaveFocus();
  });

  it("Escape declines, from anywhere in the card", async () => {
    const user = userEvent.setup();
    const { onDecline, onApply } = renderCard();
    await user.tab();
    await user.keyboard("{Escape}");
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("Apply fires from Enter and Not this from Space, once each (keyboard path)", async () => {
    const user = userEvent.setup();
    const { onApply, onDecline } = renderCard();
    await user.tab();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
    // A second Enter on the same card is the double-click guard's keyboard twin.
    await user.keyboard("{Enter}");
    expect(onApply).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "Not this" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("Apply dispatches onApply exactly once, even under a rapid double click", async () => {
    const user = userEvent.setup();
    const { onApply } = renderCard();
    const apply = screen.getByRole("button", { name: "Apply" });
    await user.click(apply);
    await user.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});

// The document, wired through the real reducer via `HelperPanel` (T036's own pattern):
// the one assertion above doesn't cover on its own — reference equality of the document
// object while a card sits open, waiting on Apply or Not this.

interface Latest {
  session: DocumentSession | null;
}

function Harness(props: {
  doc: ProfileDocument;
  assets: MediaAsset[];
  onSession: (session: DocumentSession) => void;
}) {
  const { doc, assets, onSession } = props;
  const session = useDocument(doc, assets);
  const helper = useHelper({ session, assets });
  useEffect(() => {
    onSession(session);
  });
  return <HelperPanel session={session} helper={helper} />;
}

function renderHelper(doc: ProfileDocument, assets: MediaAsset[] = [photoAsset()]): Latest {
  const latest: Latest = { session: null };
  render(<Harness doc={doc} assets={assets} onSession={(session) => (latest.session = session)} />);
  return latest;
}

/** Calls `remove_block` on the bio (non-empty text: a destructive removal), then stops. */
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

describe("ProposalCard — wired through the panel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("leaves the document the exact same object while the card is open", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Tidy the order{Enter}");
    await screen.findByText("Proposed · 1 operation");

    expect(latest.session?.state.doc).toBe(doc);
  });
});

describe("DismissedCard — wired through the panel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  // T038 review, finding 1: Not this used to leave the card's slot empty once the turn
  // ended with nothing applied — CONTENT.md's own "Left as it was." sentence was
  // unreachable. `cardResolution` (reducer.ts) now drives this straight from the
  // `declined` result, so it shows as soon as the choice is made, not just at turn's end.
  it("shows the dismissed sentence with a reopen button that re-sends, leaving the document untouched", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Tidy the order{Enter}");
    await screen.findByText("Proposed · 1 operation");
    await user.click(screen.getByRole("button", { name: "Not this" }));

    expect(
      await screen.findByText("Left as it was. Nothing on your page changed."),
    ).toBeInTheDocument();
    const reopen = screen.getByRole("button", { name: "show the suggestion again" });
    expect(latest.session?.state.doc).toBe(doc);

    // "again" re-sends the volunteer's last request, exactly as TurnSummary's own "Try
    // again" does — `regenerate()` re-runs the whole assistant turn from that same user
    // message, so `removeBioModel`'s script proposes the same card again from scratch
    // (proof of a real re-send, not just a no-op): the dismissed line is superseded.
    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));
    await user.click(reopen);
    await waitFor(() =>
      expect(
        screen.queryByText("Left as it was. Nothing on your page changed."),
      ).not.toBeInTheDocument(),
    );
    expect(latest.session?.state.doc).toBe(doc);
  });
});

/** Adds a quote (additive: applies at once), then calls `remove_block` on the bio (a
 * card), then stops — the one-applied-one-carded shape of `edit-proposals`, in two steps. */
function addQuoteThenRemoveBioModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "add-then-remove",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "add_block")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-add", "add_block", {
              op: "add_block",
              block: { type: "quote", mediaId: null, text: "She purrs at the kettle." },
            }),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
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

describe("declined after an applied edit — wired through the panel (F26)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  // The audit's §1 finding: the dismissed card used to say "Nothing on your page changed."
  // over an edit the same turn had just applied, and hid its "Undo these". Now the turn
  // reports both — the applied summary with its undo, and the decline as a one-line note.
  it("reports the applied edit with Undo these and the declined card as 'Not applied', never 'Left as it was'", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(addQuoteThenRemoveBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Tidy the page{Enter}");
    await screen.findByText("Proposed · 1 operation");
    expect(latest.session?.state.doc.blocks).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Not this" }));

    expect(await screen.findByText("Not applied: removing the bio.")).toBeInTheDocument();
    expect(
      screen.queryByText("Left as it was. Nothing on your page changed."),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Applied — added quote.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo these" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "show the suggestion again" })).toBeInTheDocument();
    expect(latest.session?.state.doc.blocks).toHaveLength(3);

    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));
    await user.click(screen.getByRole("button", { name: "Undo these" }));
    expect(latest.session?.state.doc).toBe(doc);
  });

  it("shows 'Applied — …' with a full stop after Apply on a card that was the turn's only edit", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    renderHelper(doc);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Tidy the order{Enter}");
    await screen.findByText("Proposed · 1 operation");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Applied — removed bio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo these" })).toBeInTheDocument();
  });
});

/** A malformed `reorder_blocks` (`bad-operation`'s own shape), then an apology in text —
 * exercises `RefusedNotice`, which the panel shows at once, before that apology arrives. */
function badReorderModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "bad-reorder",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "reorder_blocks")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-bad", "reorder_blocks", {
              op: "reorder_blocks",
              order: ["baaaaaaaaaab"],
            }),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([
          STREAM_START,
          ...textParts("apology", "Sorry — that didn't take."),
          finishPart(STOP),
        ]),
      };
    },
  });
}

describe("RefusedNotice — wired through the panel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("names the reason at once for a rejected tool call, leaves the document untouched, and Try again re-sends", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(badReorderModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Tidy the order{Enter}");

    // F28 review #15: sentence case after the dash — `reason` keeps its own capital
    // everywhere it stands alone; only this joined clause lowers it.
    expect(
      await screen.findByText(
        "I couldn't apply that — the new order must name every section on the page exactly once. Nothing on your page changed.",
      ),
    ).toBeInTheDocument();
    expect(latest.session?.state.doc).toBe(doc);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));
    expect(latest.session?.state.doc).toBe(doc);
  });
});

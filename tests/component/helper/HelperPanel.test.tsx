import type { LanguageModelV3 } from "@ai-sdk/provider";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockLanguageModelV3 } from "ai/test";
import { useEffect } from "react";
import { renderToString } from "react-dom/server";
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
import type { ProfileDocument } from "@/core/profile/schema";
import { useDocument, type DocumentSession } from "@/ui/builder/use-document";
import { HELPER_OVERLAY_QUERY, HelperPanel, type HelperLayout } from "@/ui/helper/HelperPanel";
import { useHelper } from "@/ui/helper/use-helper";
import { photoAsset } from "../../unit/core/media/builders";
import { bio, document, hero } from "../../unit/core/profile/builders";
import { fakeChatFetch } from "./support";

// T036 brief → "Tests first": the locked panel sends nothing; `onToolCall` for
// `read_outline` answers from the current document without a separate network call; an
// `add_block` tool part applies and highlights. Driven against the real `useDocument`
// reducer and the real `createHelperStream` pipeline over a scripted `MockLanguageModelV3`
// (`support.ts`'s `fakeChatFetch`) — the same server code `POST /api/helper/chat` runs,
// so the client sees exactly the message shapes a real turn produces.

interface Latest {
  session: DocumentSession | null;
}

function Harness(props: {
  doc: ProfileDocument;
  assets: MediaAsset[];
  layout?: HelperLayout;
  onSession: (session: DocumentSession) => void;
}) {
  const { doc, assets, layout, onSession } = props;
  const session = useDocument(doc, assets);
  const helper = useHelper({ session, assets });
  useEffect(() => {
    onSession(session);
  });
  return <HelperPanel session={session} helper={helper} layout={layout} />;
}

function renderHelper(
  doc: ProfileDocument,
  assets: MediaAsset[] = [photoAsset()],
  layout?: HelperLayout,
): Latest {
  const latest: Latest = { session: null };
  render(
    <Harness
      doc={doc}
      assets={assets}
      layout={layout}
      onSession={(session) => (latest.session = session)}
    />,
  );
  return latest;
}

/** A `matchMedia` answering the overlay query (F46) for a window `width` wide. */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === HELPER_OVERLAY_QUERY && width < 1180,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

/** Answers `read_outline` once, then a plain-text reply — the shortest real turn with a
 * browser-answered read in it. */
function readOutlineOnceModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "read-outline-once",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "read_outline")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-1", "read_outline", {}),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("t1", "Got it."), finishPart(STOP)]),
      };
    },
  });
}

/** Asks a question and stops (`STOP`, text only) — an empty page, mid-interview. */
function askingQuestionModel(question: string): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "asking-question",
    doStream: async () => ({
      stream: scriptedStream([STREAM_START, ...textParts("q", question), finishPart(STOP)]),
    }),
  });
}

/** Adds one bio block, then a plain-text reply. */
function addBioOnceModel(): LanguageModelV3 {
  const block = { type: "bio" as const, content: { paragraphs: [] } };
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "add-bio-once",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "add_block")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-2", "add_block", { op: "add_block", block }),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([
          STREAM_START,
          ...textParts("t2", "Added a bio."),
          finishPart(STOP),
        ]),
      };
    },
  });
}

describe("HelperPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the locked sentence and sends nothing while there is no ready photo", () => {
    renderHelper(document({ blocks: [hero(null)] }), []);
    expect(screen.getByText("Add one photo and I can help.")).toBeInTheDocument();
    expect(screen.getByText("CATalyst locked")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Ask for a change…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write a bio" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("while ready, the header's sub-line says what the helper sees and cannot do", () => {
    renderHelper(document({ blocks: [hero(), bio("Charlotte is a lap cat.")] }));
    expect(screen.getByText("sees this page · cannot publish")).toBeInTheDocument();
    expect(screen.queryByText("CATalyst is working…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write a bio" })).toBeEnabled();
  });

  // F55 item 6 (the phone sweep, finding 6): the empty thread is not a blank page. One
  // greeting line sits above the composer until the first request — pronoun-free, the
  // cat's name or `this cat`, naming the `Build the page` chip only while that chip is
  // there (the page is just the hero) — on both layouts, and gone once anything is said.
  describe("the greeting above the composer while the thread is empty", () => {
    it("names the cat and the Build the page chip on an empty page", () => {
      renderHelper(document({ blocks: [hero()] }));
      const greeting = screen.getByText("Tell me about Charlotte, or start with Build the page.");
      expect(greeting.tagName).toBe("P");
      // Directly above the composer, in the same stack.
      expect(greeting.parentElement).toContainElement(
        screen.getByPlaceholderText("Ask for a change…"),
      );
      expect(
        greeting.compareDocumentPosition(screen.getByPlaceholderText("Ask for a change…")),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      // Not in the conversation log: nothing to announce.
      expect(screen.getByRole("log")).not.toContainElement(greeting);
    });

    it("asks for a change once the page has sections, and says this cat while unnamed", () => {
      renderHelper(document({ blocks: [hero(), bio("Charlotte is a lap cat.")] }));
      expect(screen.getByText("Tell me what to change on Charlotte's page.")).toBeInTheDocument();
      expect(screen.queryByText(/Build the page\./)).toBeNull();
      cleanup();
      renderHelper(document({ name: "", blocks: [hero()] }));
      expect(
        screen.getByText("Tell me about this cat, or start with Build the page."),
      ).toBeInTheDocument();
    });

    it("is the same line in the phone sheet, and leaves once the first request is sent", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", vi.fn(fakeChatFetch(readOutlineOnceModel())));
      const latest = renderHelper(document({ blocks: [hero()] }), [photoAsset()], "sheet");
      expect(
        screen.getByText("Tell me about Charlotte, or start with Build the page."),
      ).toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("Ask for a change…"), "Tidy the order{Enter}");
      await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));
      expect(screen.queryByText(/Tell me about/)).toBeNull();
    });
  });

  it("onToolCall answers read_outline from the current document, with no separate network call", async () => {
    const user = userEvent.setup();
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(readOutlineOnceModel())));
    const latest = renderHelper(doc);

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Tidy the order{Enter}");
    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));

    // Exactly the turn a browser-answered read needs: the request, then the one
    // continuation carrying the answer — never a call to any other endpoint.
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(fetch).mock.calls) expect(call[0]).toBe("/api/helper/chat");
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)) as {
      messages: { parts: { type: string; output?: unknown }[] }[];
    };
    const lastMessage = secondBody.messages[secondBody.messages.length - 1];
    const toolPart = lastMessage?.parts.find((part) => part.type === "tool-read_outline");
    expect(String(toolPart?.output)).toContain("Sections:");
    expect(String(toolPart?.output)).toContain("hero");
    // A read never changes anything.
    expect(latest.session?.state.doc).toBe(doc);
  });

  it("an add_block tool call applies immediately and records it for the canvas to highlight", async () => {
    const user = userEvent.setup();
    const doc = document({ blocks: [hero()] });
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(addBioOnceModel())));
    const latest = renderHelper(doc);

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Write a bio.{Enter}");
    await waitFor(() => expect(latest.session?.state.doc.blocks).toHaveLength(2));

    expect(latest.session?.state.doc.blocks[1]?.type).toBe("bio");
    const applied = latest.session?.state.helper.turn.applied ?? [];
    expect(applied).toHaveLength(1);
    // FR-042: the applied edit names the block the canvas is to flash.
    expect(applied[0]?.blockIds).toEqual([latest.session?.state.doc.blocks[1]?.id]);
  });

  // F33: no "Build it now" button anywhere — the interview ends in conversation, with a
  // proposal the helper writes as a normal reply, not a special control.
  it("has no Build it now button, on an empty page or mid-interview, and a proposal renders as a normal reply", async () => {
    const user = userEvent.setup();
    const doc = document({ blocks: [hero()] });
    const proposal = "Here's what I'll build: a bio and a gallery. Want me to build this now?";
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(askingQuestionModel(proposal))));
    renderHelper(doc);

    expect(screen.queryByRole("button", { name: "Build it now" })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Build the page{Enter}");
    expect(await screen.findByText(proposal)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build it now" })).not.toBeInTheDocument();
  });

  // F46 (F28 review #1; comp 7b "opens as overlay", 7c "helper as bubble"): CATalyst is
  // reachable at every builder width. From 768 to 1179 the column starts as the 52px tab
  // and opens as an overlay over the canvas; from 1180 it docks open, as before.
  it("at 1024 starts as the tab, opens over the canvas on `open CATalyst`, and Escape closes it back to the tab", async () => {
    stubWidth(1024);
    const user = userEvent.setup();
    renderHelper(document({ blocks: [hero(), bio("Charlotte is a lap cat.")] }));
    const aside = screen.getByRole("complementary", { name: "CATalyst AI Assistant" });
    expect(screen.getByPlaceholderText("Ask for a change…")).not.toBeVisible();
    const open = screen.getByRole("button", { name: "open CATalyst" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    // The tab is the column at this width: it never takes the docked width.
    expect(aside).not.toHaveClass("w-helper");
    expect(aside).toHaveClass("w-helper-tab");

    await user.click(open);
    const composer = screen.getByPlaceholderText("Ask for a change…");
    expect(composer).toBeVisible();
    // The open body lies over the canvas (absolute, lifted), not beside it: the aside
    // itself keeps the tab's width.
    const body = composer.closest("[data-helper-body]");
    expect(body).toHaveClass("absolute", "shadow-lifted", "w-helper");
    expect(aside).toHaveClass("w-helper-tab");

    await user.keyboard("{Escape}");
    expect(screen.getByPlaceholderText("Ask for a change…")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "open CATalyst" })).toHaveFocus();
  });

  it("at 1440 the column is docked open by default, and collapsing it docks the tab in flow", async () => {
    stubWidth(1440);
    const user = userEvent.setup();
    renderHelper(document({ blocks: [hero(), bio("Charlotte is a lap cat.")] }));
    const aside = screen.getByRole("complementary", { name: "CATalyst AI Assistant" });
    expect(screen.getByPlaceholderText("Ask for a change…")).toBeVisible();
    expect(aside).toHaveClass("w-helper");
    const body = screen.getByPlaceholderText("Ask for a change…").closest("[data-helper-body]");
    expect(body).not.toHaveClass("absolute");
    await user.click(screen.getByRole("button", { name: "collapse CATalyst" }));
    expect(aside).toHaveClass("w-helper-tab");
    expect(screen.getByRole("button", { name: "open CATalyst" })).toBeInTheDocument();
  });

  // F45 review round 1, finding 4: the server has no window, so its markup carries the
  // shape a 768–1179 window needs in CSS alone — the tab's width and a hidden body under
  // `wide` — and hydration removes the CSS guard once the window is known; nothing jumps.
  it("the server's markup folds the column under 1180 by CSS alone; the hydrated client drops the guard", () => {
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    function Server() {
      const session = useDocument(doc, [photoAsset()]);
      const helper = useHelper({ session, assets: [photoAsset()] });
      return <HelperPanel session={session} helper={helper} />;
    }
    const html = renderToString(<Server />);
    expect(html).toContain("max-wide:w-helper-tab");
    expect(html).toContain("max-wide:hidden");
    stubWidth(1440);
    renderHelper(doc);
    const aside = screen.getByRole("complementary", { name: "CATalyst AI Assistant" });
    expect(aside).not.toHaveClass("max-wide:w-helper-tab");
    expect(aside.querySelector("[data-helper-body]")).not.toHaveClass("max-wide:hidden");
  });

  // Design 2026-09-13 §4: inside the phone's sheet the panel is the sheet's content —
  // no toggle, no tab, no docked width, never hidden; the sheet's own Close is the way out.
  it('`layout="sheet"` draws no toggle and no tab and takes no column width', () => {
    stubWidth(390);
    renderHelper(
      document({ blocks: [hero(), bio("Charlotte is a lap cat.")] }),
      undefined,
      "sheet",
    );
    // No landmark of its own: the sheet around it is the named one (review round 1, finding 6).
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    const aside = screen.getByPlaceholderText("Ask for a change…").closest("[data-helper-body]")!
      .parentElement as HTMLElement;
    expect(screen.queryByRole("button", { name: "collapse CATalyst" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "open CATalyst" })).not.toBeInTheDocument();
    expect(aside).not.toHaveClass("w-helper");
    expect(aside).not.toHaveClass("w-helper-tab");
    expect(screen.getByPlaceholderText("Ask for a change…")).toBeVisible();
    // The sheet's chips are 44px pills in one scrolling row (§4).
    const chip = screen.getByRole("button", { name: "Write a bio" });
    expect(chip).toHaveClass("min-h-44");
    expect(chip.parentElement).toHaveClass("overflow-x-auto");
  });
});

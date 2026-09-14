import type { LanguageModelV3 } from "@ai-sdk/provider";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
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
import { abortMidTurn } from "@/adapters/fake/scenarios/abort-mid-turn";
import { truncated } from "@/adapters/fake/scenarios/truncated";
import type { MediaAsset } from "@/core/media/schema";
import type { ProfileDocument } from "@/core/profile/schema";
import { useDocument, type DocumentSession } from "@/ui/builder/use-document";
import { HelperPanel } from "@/ui/helper/HelperPanel";
import { canSend, useHelper } from "@/ui/helper/use-helper";
import { photoAsset } from "../../unit/core/media/builders";
import { BIO_ID, bio, document, hero } from "../../unit/core/profile/builders";
import { fakeChatFetch } from "./support";

// The rest of the T036 brief's Browser check, exercised as component tests rather than
// only by eye: a destructive edit cards first and waits for Apply/Not this (FR-043), and
// a turn that is cut off — mid-stream error, or `finishReason: "length"` — keeps whatever
// it already applied and offers "Undo these" and "Try again" (FR-046/047). The abort and
// truncated scenarios are the project's own scripted fakes
// (`src/adapters/fake/scenarios/*.ts`), reused as-is so this exercises the exact scripts
// the manual Browser check drives too.

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

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Ask for a change…"), `${text}{Enter}`);
}

describe("HelperPanel — cards and cut-off turns", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("cards a destructive remove_block and leaves the document untouched until Apply", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);

    await send("Tidy the order");
    expect(await screen.findByText("Proposed · 1 operation")).toBeInTheDocument();
    // The card names what it would remove; the document has not moved yet.
    expect(latest.session?.state.doc.blocks).toHaveLength(2);
    // The turn is still working while the card waits (helper-protocol.md → Client state):
    // the header says so in the panel itself (visible copy; the topbar's `WorkingBar` is
    // the one announcer, F25 §3.8). The composer and chips stay open, though: nothing is
    // streaming any more — the model's turn ended on the card — and a new message is the
    // volunteer's own "Not this" (F35, the unanswered-card rule; the case below).
    expect(screen.getByText("CATalyst is working…")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("sees this page · cannot publish")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write a bio" })).toBeEnabled();
    expect(screen.getByPlaceholderText("Ask for a change…")).toBeEnabled();

    await userEvent.setup().click(screen.getByRole("button", { name: "Not this" }));
    await waitFor(() =>
      expect(screen.queryByText("Proposed · 1 operation")).not.toBeInTheDocument(),
    );
    expect(latest.session?.state.doc.blocks).toHaveLength(2);
    expect(latest.session?.state.helper.status).toBe("ready");
  });

  // F49 (F28 review #8; §3.1 kept the slot's own order — after the list, before the
  // composer stack — and only closed the void the list's `flex-1` opened up below it):
  // the list must not carry `flex-1` any more (it would grow to fill the panel and push
  // the card down to the composer on a short thread), and the card's own wrapper must
  // still be the very next thing after the list in the DOM — nothing sized to soak up
  // free space sits between them. jsdom does no layout, so this is the structural half of
  // the brief's own test note ("a jsdom layout stub or … an e2e assertion"); the pixel
  // distance is proven for real in tests/e2e/helper.spec.ts.
  it("the message list has no flex-1 grow, so the card's wrapper follows it directly, not the composer", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    renderHelper(doc);

    await send("Tidy the order");
    const card = await screen.findByText("Proposed · 1 operation");
    const log = screen.getByRole("log", { name: "Conversation" });

    expect(log.className).not.toMatch(/(?:^|\s)flex-1(?:\s|$)/);
    expect(log.className).toMatch(/(?:^|\s)shrink(?:\s|$)/);
    expect(log.className).toMatch(/(?:^|\s)min-h-0(?:\s|$)/);

    const cardFrame = card.closest('[class*="rounded-panel"]');
    expect(cardFrame).not.toBeNull();
    expect(log.nextElementSibling).toBe(cardFrame?.parentElement);
  });

  // F35, the unanswered-card rule (contracts/helper-protocol.md → Results): typing the next
  // message while a card waits declines it — the next request carries the card's tool call
  // answered `declined`, never an open call the server would 400 on — the card gives way
  // to "Left as it was.", and the new reply arrives.
  it("a new message while a card is pending declines the card, is accepted, and gets a reply", async () => {
    const route = fakeChatFetch(removeBioModel());
    const posted: UIMessage[][] = [];
    const statuses: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        posted.push((JSON.parse(String(init?.body)) as { messages: UIMessage[] }).messages);
        const response = await route(url, init);
        statuses.push(response.status);
        return response;
      }),
    );
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);

    await send("Tidy the order");
    await screen.findByText("Proposed · 1 operation");
    await send("Actually, leave the bio and make the tagline shorter");

    expect(await screen.findByText("Done.")).toBeInTheDocument();
    await waitFor(() => expect(statuses).toEqual([200, 200]));
    expect(screen.queryByText("Proposed · 1 operation")).not.toBeInTheDocument();
    expect(screen.getByText("Left as it was. Nothing on your page changed.")).toBeInTheDocument();
    expect(latest.session?.state.doc.blocks).toHaveLength(2);
    // What the second request actually carried: the card's call, answered `declined`.
    const card = posted[1]?.flatMap((m) => m.parts).find((p) => p.type === "tool-remove_block");
    expect(card).toMatchObject({ state: "output-available", output: { status: "declined" } });
    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));
  });

  // F35 review, finding 1: the card is created mid-stream (`onToolCall`), and the same step
  // can go on — a second call, a server-executed read, closing text. The composer must not
  // open until the SDK's stream has actually ended, or a send would race the live stream.
  it("with a card pending, the composer stays closed until the stream ends, then a send goes through", async () => {
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "card-then-slow-text",
      doStream: async ({ prompt }) => {
        if (!hasResult(prompt, "remove_block")) {
          return {
            stream: scriptedStream(
              [
                STREAM_START,
                callPart("call-remove", "remove_block", { op: "remove_block", blockId: BIO_ID }),
                ...textParts("after", "Still thinking about the rest."),
                finishPart(STOP),
              ],
              150,
            ),
          };
        }
        return {
          stream: scriptedStream([STREAM_START, ...textParts("done", "Done."), finishPart(STOP)]),
        };
      },
    });
    const posted: UIMessage[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        posted.push((JSON.parse(String(init?.body)) as { messages: UIMessage[] }).messages);
        return fakeChatFetch(model)(url, init);
      }),
    );
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    renderHelper(doc);
    const composer = screen.getByPlaceholderText("Ask for a change…");

    await send("Tidy the order");
    await screen.findByText("Proposed · 1 operation");
    // The card is up but the stream is still delivering text: nothing may be sent.
    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", { name: "Write a bio" })).toBeDisabled();
    expect(screen.queryByText("Still thinking about the rest.")).not.toBeInTheDocument();
    expect(posted).toHaveLength(1);

    // The stream ends (its closing text lands): the composer opens, the card still waits.
    await screen.findByText("Still thinking about the rest.");
    await waitFor(() => expect(composer).toBeEnabled());
    expect(screen.getByText("Proposed · 1 operation")).toBeInTheDocument();

    await send("Leave it, thanks");
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(screen.getByText("Left as it was. Nothing on your page changed.")).toBeInTheDocument();
    expect(posted).toHaveLength(2);
    const card = posted[1]?.flatMap((m) => m.parts).find((p) => p.type === "tool-remove_block");
    expect(card).toMatchObject({ state: "output-available", output: { status: "declined" } });
  });

  it("Apply on the card removes the block and offers Undo these", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);

    await send("Tidy the order");
    await screen.findByText("Proposed · 1 operation");
    await userEvent.setup().click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(latest.session?.state.doc.blocks).toHaveLength(1));
    const undo = await screen.findByRole("button", { name: "Undo these" });
    await userEvent.setup().click(undo);
    expect(latest.session?.state.doc.blocks).toHaveLength(2);
  });

  // F26 review, finding 1: "Applied — … / Undo these" must not outlive its own undo. Once
  // the turn's entry has been undone the block reads "Undone." with "Redo these"; a second
  // "Undo these" is not there to click, so the volunteer's own edit beneath it survives.
  it("after Undo these, the block reads Undone. with Redo these — the volunteer's own edit survives", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeBioModel())));
    const doc = document({ blocks: [hero(), bio("Charlotte is a lap cat.")] });
    const latest = renderHelper(doc);
    const user = userEvent.setup();

    // The volunteer's own edit first: one history entry under whatever the helper does.
    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));
    latest.session?.apply(
      { op: "set_field", target: { kind: "profile" }, path: "name", value: "Mabel" },
      "Set the name.",
    );
    await waitFor(() => expect(latest.session?.state.doc.name).toBe("Mabel"));

    await send("Tidy the order");
    await screen.findByText("Proposed · 1 operation");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Applied — removed bio.");
    expect(latest.session?.state.doc.blocks).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Undo these" }));
    expect(latest.session?.state.doc.blocks).toHaveLength(2);
    expect(latest.session?.state.doc.name).toBe("Mabel");
    expect(await screen.findByText("Undone.")).toBeInTheDocument();
    expect(screen.queryByText("Applied — removed bio.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo these" })).not.toBeInTheDocument();

    // "Redo these" puts the turn's edit back; Undo these returns with it.
    await user.click(screen.getByRole("button", { name: "Redo these" }));
    expect(latest.session?.state.doc.blocks).toHaveLength(1);
    expect(await screen.findByText("Applied — removed bio.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo these" }));
    expect(latest.session?.state.doc.blocks).toHaveLength(2);
    expect(latest.session?.state.doc.name).toBe("Mabel");

    // A second undo (the topbar's) takes the volunteer's edit; the block then says nothing
    // about a turn whose entry is no longer where its links would act.
    latest.session?.undo();
    await waitFor(() => expect(latest.session?.state.doc.name).toBe("Charlotte"));
    expect(screen.queryByText("Undone.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redo these" })).not.toBeInTheDocument();
  });

  it("abort-mid-turn keeps the two sections it managed to add and names the count", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(abortMidTurn())));
    const doc = document({ blocks: [hero()] });
    const latest = renderHelper(doc);

    await send("Build the page");
    await waitFor(() => expect(latest.session?.state.doc.blocks).toHaveLength(3));
    expect(
      await screen.findByText(
        "I added 2 sections before I was cut off. Undo these, or ask me to continue.",
      ),
    ).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Undo these" }));
    expect(latest.session?.state.doc.blocks).toHaveLength(1);
  });

  it("truncated (finishReason length) keeps its three sections and offers Try again", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(truncated())));
    const doc = document({ blocks: [hero()] });
    const latest = renderHelper(doc);

    await send("Build the page");
    await waitFor(() => expect(latest.session?.state.doc.blocks).toHaveLength(4));
    expect(
      await screen.findByText(
        "I added 3 sections before I was cut off. Undo these, or ask me to continue.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

// F35 review, finding 1: the rule the composer, the chips and `send` all share.
describe("canSend", () => {
  const card = {
    toolCallId: "c1",
    op: { op: "remove_block" as const, blockId: BIO_ID },
    summary: "Remove the bio.",
  };
  const turn = (pending: boolean) => ({
    applied: [],
    touched: [],
    card: pending ? card : null,
    results: {},
    outcome: null,
    entry: null,
  });

  it.each([
    ["ready, no card, stream idle", "ready", false, "ready", true],
    ["working, card pending, stream ended", "working", true, "ready", true],
    ["working, card pending, still streaming", "working", true, "streaming", false],
    ["working, card pending, request submitted", "working", true, "submitted", false],
    ["working, no card", "working", false, "ready", false],
    ["locked", "locked", false, "ready", false],
  ] as const)("%s → %s", (_label, status, pending, chatStatus, expected) => {
    expect(canSend({ status, turn: turn(pending) }, chatStatus)).toBe(expected);
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isToolUIPart, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishPart,
  scriptedStream,
  STREAM_START,
  TOOL_CALLS,
} from "@/adapters/fake/scenarios/_shared";
import { cardThenApply, CLOSING } from "@/adapters/fake/scenarios/card-then-apply";
import { bio, document, hero } from "../../unit/core/profile/builders";
import { renderHelper, send } from "./harness";
import { fakeChatFetch } from "./support";

// F42 — the build never stalls on a carded edit, as the panel sees it. The deployed build
// stalled because a step carded one call and applied another, the applied edit dismissed
// the card, and the reducer sat `working` with the composer disabled for ever
// (build-stall-investigation.md). Three things must now be true: a card and an applied
// edit in one step both stand (`card-then-apply`), a stream that ends with a call nobody
// will answer closes the turn with "The helper stopped mid-step." and Try again within a
// tick, and a disconnect whose `finish` chunk already arrived closes it too — never
// "working…" with a disabled composer.

/** Every tool part of every message, with its state — what the next request will carry. */
function toolStates(messages: UIMessage[]): { type: string; state: string }[] {
  return messages
    .flatMap((message) => message.parts)
    .filter(isToolUIPart)
    .map((part) => ({ type: part.type, state: part.state }));
}

/** Records every request's `messages` on the way to `route`. */
function recording(route: (url: string, init?: RequestInit) => Promise<Response>) {
  const posted: UIMessage[][] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    posted.push((JSON.parse(String(init?.body)) as { messages: UIMessage[] }).messages);
    return route(url, init);
  });
  return { posted, fetch };
}

describe("F42: a card and an applied edit in one step", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("card-then-apply: the card is visible with the bio already on the canvas; Not this sends the next request with every call answered, and the build goes on", async () => {
    const { posted, fetch } = recording(fakeChatFetch(cardThenApply()));
    vi.stubGlobal("fetch", fetch);
    const doc = document({ name: "Charlotte", blocks: [hero(), bio("A lap cat.")] });
    const latest = renderHelper(doc);

    await send("Build the page");
    // The destructive rename cards; the additive bio applied in the same step and stands.
    expect(await screen.findByText("Proposed · 1 operation")).toBeInTheDocument();
    await waitFor(() => expect(latest.session?.state.doc.blocks).toHaveLength(3));
    expect(latest.session?.state.doc.name).toBe("Charlotte");
    expect(latest.session?.state.helper.turn.card?.toolCallId).toBe("name-1");
    // Only one request so far: the SDK is waiting on the card, not stalled and not looping.
    await waitFor(() => expect(screen.getByRole("button", { name: "Not this" })).toBeEnabled());
    expect(posted).toHaveLength(1);

    await userEvent.setup().click(screen.getByRole("button", { name: "Not this" }));
    expect(await screen.findByText(CLOSING.declined ?? "")).toBeInTheDocument();
    expect(posted).toHaveLength(2);
    // What the second request carried: every tool part answered, none left open.
    const states = toolStates(posted[1] ?? []);
    expect(states).toEqual([
      { type: "tool-set_field", state: "output-available" },
      { type: "tool-add_block", state: "output-available" },
    ]);
    expect(latest.session?.state.doc.name).toBe("Charlotte");
    expect(latest.session?.state.doc.blocks).toHaveLength(3);
    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));
    expect(screen.getByText("Applied — added bio.")).toBeInTheDocument();
  });
});

describe("F42: the stall guard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  /** A step whose only call is cut off mid-input (`tool-input-start`, never the call): the
   * browser is never asked to answer it, and nothing ever will. */
  function cutOffModel(): MockLanguageModelV3 {
    return new MockLanguageModelV3({
      provider: "fake",
      modelId: "cut-off",
      doStream: async () => ({
        stream: scriptedStream([
          STREAM_START,
          { type: "tool-input-start", id: "cut-1", toolName: "read_outline" },
          finishPart(TOOL_CALLS),
        ]),
      }),
    });
  }

  it("a tool-calls finish with a call nobody can answer and no card closes the turn: the failure box and Try again, never working… with a disabled composer", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(cutOffModel())));
    const doc = document({ blocks: [hero(), bio("A lap cat.")] });
    const latest = renderHelper(doc);

    await send("Tidy the order");
    expect(
      await screen.findByText("The helper stopped mid-step. Nothing on your page changed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("CATalyst is working…")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask for a change…")).toBeEnabled();
    expect(latest.session?.state.helper.status).toBe("ready");
    expect(latest.session?.state.helper.turn.outcome).toEqual({
      kind: "error",
      applied: 0,
      message: "The helper stopped mid-step.",
    });
  });

  it("the cut-off call is closed in the transcript, so the volunteer's next message carries no open call", async () => {
    const { posted, fetch } = recording(fakeChatFetch(cutOffModel()));
    vi.stubGlobal("fetch", fetch);
    renderHelper(document({ blocks: [hero(), bio("A lap cat.")] }));

    await send("Tidy the order");
    await screen.findByText("The helper stopped mid-step. Nothing on your page changed.");
    await send("Try once more");
    await waitFor(() => expect(posted).toHaveLength(2));
    const states = toolStates(posted[1] ?? []);
    expect(states).toEqual([{ type: "tool-read_outline", state: "output-error" }]);
  });

  it("a disconnect whose finish chunk (tool-calls) already arrived reads 'The connection dropped.' with Try again", async () => {
    const route = fakeChatFetch(cutOffModel());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const response = await route(url, init);
        // The whole body arrives, then the connection goes: a network TypeError mid-read.
        const body = response.body?.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            flush() {
              throw new TypeError("network error");
            },
          }),
        );
        return new Response(body, { status: 200, headers: response.headers });
      }),
    );
    const latest = renderHelper(document({ blocks: [hero(), bio("A lap cat.")] }));

    await send("Tidy the order");
    expect(
      await screen.findByText("The connection dropped. Nothing on your page changed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(latest.session?.state.helper.status).toBe("ready");
  });
});

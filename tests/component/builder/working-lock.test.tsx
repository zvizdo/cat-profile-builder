import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider";
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
} from "@/adapters/fake/scenarios/_shared";
import { Builder } from "@/ui/builder/Builder";
import { fakeChatFetch } from "../helper/support";
import { DOC, frameOrder } from "./canvas-fixtures";
import { CAT } from "./media-fixtures";

// F9: while the helper is mid-turn the whole profile is read-only, and the canvas shows
// it. Driven end to end through `Builder` (real session, real reducer) rather than a
// mocked `working` flag, so this proves the actual gate `helper.status === "working"`
// locks — the same gate T036 already refuses `apply`/`undo`/`redo` on.
//
// The stream is manually controlled (a `ReadableStream` this file holds the controller
// of, rather than a scripted, pre-timed one) so "still mid-turn" and "the turn just
// ended" are exact points this file chooses, never a race against a fixed delay.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const HELPER_CHAT = "/api/helper/chat";

function stamped() {
  return Response.json({ updatedAt: "2026-09-12T12:00:00.000Z" });
}

/** A `ReadableStream` this test pushes provider parts into on its own schedule. */
function controlledStream() {
  let live: ReadableStreamDefaultController<LanguageModelV3StreamPart> | null = null;
  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start: (controller) => {
      live = controller;
    },
  });
  return {
    stream,
    push: (part: LanguageModelV3StreamPart) => live?.enqueue(part),
    end: () => live?.close(),
  };
}

/** `add_block quote` on the first request, then the plain finish the second one waits for. */
function addQuoteModel(control: ReturnType<typeof controlledStream>): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "add-quote",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "add_block")) return { stream: control.stream };
      return { stream: scriptedStream([STREAM_START, finishPart(STOP)]) };
    },
  });
}

const fetchSpy = vi.fn<typeof fetch>();
const scrollSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function renderBuilder() {
  return render(
    <Builder
      document={DOC}
      assets={[CAT]}
      publication={{ state: "draft", url: null }}
      now={DOC.updatedAt}
    />,
  );
}

async function send(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Ask for a change…"), `${text}{Enter}`);
}

function canvasRegion(): HTMLElement {
  return screen.getByRole("region", { name: "Canvas" });
}

function nameField(): HTMLElement {
  return screen.getByLabelText("Name");
}

function bioTextbox(): HTMLElement {
  return screen.getByRole("textbox", { name: "Bio" });
}

function quoteFrame(): Element {
  const el = document.querySelector('[data-block-type="quote"]');
  if (el === null) throw new Error("no quote frame");
  return el;
}

describe("working lock (F9)", () => {
  it("locks every edit control while the helper works, then releases them all when the turn ends", async () => {
    const control = controlledStream();
    fetchSpy.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : ((input as Request).url ?? String(input));
      if (url.includes(HELPER_CHAT)) return fakeChatFetch(addQuoteModel(control))(url, init);
      return stamped();
    });

    renderBuilder();
    await send("Add a quote.");

    // The helper's own edit still lands and highlights while everything else is locked —
    // pushed mid-stream, before the turn's own `finish` (still `status: "working"`).
    control.push(STREAM_START);
    control.push(
      callPart("call-quote", "add_block", {
        op: "add_block",
        block: { type: "quote", mediaId: null, text: "" },
      }),
    );

    await waitFor(() => expect(frameOrder()).toContain("quote"));

    // The canvas is dimmed and marked busy.
    expect(canvasRegion()).toHaveAttribute("aria-busy", "true");
    // The helper's own add_block landed: the canvas followed it (F34) — scrolled the new
    // frame to the centre, blinked its ring, and tagged it.
    expect(scrollSpy).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(quoteFrame().querySelector("[data-pulse-ring]")).not.toBeNull();
    expect(quoteFrame().textContent).toContain("CATalyst · just now");

    // Every edit control is a real `disabled`, not merely styled — a facts field…
    expect(nameField()).toBeDisabled();
    // …the bio's Tiptap editor…
    expect(bioTextbox()).toHaveAttribute("contenteditable", "false");
    // …and the add-section tile.
    expect(screen.getByRole("button", { name: "+ add section" })).toBeDisabled();

    // ⌘Z is ignored outright — the keyboard handler must not even dispatch it.
    await userEvent.setup().keyboard("{Meta>}z{/Meta}");
    expect(frameOrder()).toContain("quote");

    // The turn ends: `streamEnded` fires, and every control is enabled again at once.
    control.push(finishPart(STOP));
    control.end();

    await waitFor(() => expect(nameField()).not.toBeDisabled());
    expect(canvasRegion()).not.toHaveAttribute("aria-busy", "true");
    expect(bioTextbox()).toHaveAttribute("contenteditable", "true");
    expect(screen.getByRole("button", { name: "+ add section" })).not.toBeDisabled();
  });
});

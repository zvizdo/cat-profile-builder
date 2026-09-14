import { act, render, screen, waitFor, within } from "@testing-library/react";
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
import { Builder } from "@/ui/builder/Builder";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { bio, document, hero, quote } from "../../../unit/core/profile/builders";
import { fakeChatFetch } from "../../helper/support";
import { photo as assetView } from "../media-fixtures";

// F59, split out of `catalyst-drawer.test.tsx` (review round 1, S3 — that file was
// already over the 400-line ceiling before this task and grew further): the rule is the
// block's, not the field's — a photo swap or a removal's face is a change block exactly
// the way a long bio diff is, so both open the CATalyst drawer to Full, not Half
// (`PhoneBuilder.tsx`'s `useOpensFull`). `stubMatchMedia`/`HELPER`/`PEEK` are duplicated
// from `catalyst-drawer.test.tsx` rather than shared, per the review's own suggestion —
// each is a few lines.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const HELPER = { name: "CATalyst AI Assistant" };

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

/** Swaps the hero's photo for `afterId`: a `replace_image` card with two faces. */
function replaceHeroModel(afterId: string) {
  const op = { op: "replace_image", blockId: hero().id, mediaId: afterId };
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "replace-hero",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "replace_image")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-replace", "replace_image", op),
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

/** Removes the quote (destructive, so it cards — FR-043): its own struck line with the
 * face its photo draws. */
function removeQuoteModel() {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "remove-quote",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "remove_block")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-remove", "remove_block", { op: "remove_block", blockId: quote().id }),
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

const bottom = () => screen.getByRole("navigation", { name: "Drawers" });
const peek = () => screen.getByRole("button", { name: "open CATalyst" });

describe("the CATalyst drawer's state machine — image cards (F59)", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a replace_image card (a photo swap) opens Full, not Half", async () => {
    const before = assetView("media2aa", "cat-1.jpg");
    const after = assetView("media2ab", "cat-2.jpg");
    const doc = document({ blocks: [hero(before.id), bio("Charlotte is a lap cat.")] });
    stubMatchMedia(true);
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(replaceHeroModel(after.id))));
    render(
      <Builder
        document={doc}
        assets={[before, after]}
        publication={{ state: "draft", url: null }}
        now="2026-09-12T12:00:00.000Z"
      />,
    );
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(
      screen.getByPlaceholderText("Ask for a change…"),
      "Give her a better hero photo{Enter}",
    );

    const full = await screen.findByRole("dialog", HELPER);
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    expect(within(full).getAllByRole("img")).toHaveLength(2);

    await user.click(within(full).getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(peek()).toHaveTextContent(/^Applied — /));
  });

  it("a remove_block card with a face (a quote's photo) opens Full, not Half", async () => {
    const asset = assetView("media2aa", "cat-1.jpg");
    const doc = document({
      blocks: [hero(), bio("Charlotte is a lap cat."), quote(asset.id, "She purrs.")],
    });
    stubMatchMedia(true);
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(removeQuoteModel())));
    render(
      <Builder
        document={doc}
        assets={[asset]}
        publication={{ state: "draft", url: null }}
        now="2026-09-12T12:00:00.000Z"
      />,
    );
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Remove the quote{Enter}");

    const full = await screen.findByRole("dialog", HELPER);
    expect(screen.queryByRole("region", HELPER)).toBeNull();
    expect(full.querySelector("del")).toHaveTextContent("She purrs.");
    expect(within(full).getByRole("img")).toBeInTheDocument();

    await user.click(within(full).getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(peek()).toHaveTextContent(/^Applied — /));
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MARKDOWN_REPLY_TEXT } from "@/adapters/fake/scenarios/markdown-reply";
import { Markdown } from "@/ui/helper/Markdown";

// F31 brief → "Tests first", the streaming case: `useChat` re-renders `MessageList` with a
// longer prefix of the assistant's text on every chunk (helper-protocol.md's streaming
// contract), so `Markdown` must render every incomplete prefix of a reply — an unclosed
// heading marker, an unclosed emphasis, a link with no closing paren, a raw HTML tag cut in
// half — without ever throwing. `renderToStaticMarkup` proves this in plain Node, the same
// environment every other `tests/contract/**` case runs in, with no jsdom needed.

describe("contract tests (helper-protocol.md) — the helper's Markdown never throws mid-stream", () => {
  it("renders every prefix of a scripted Markdown reply, including every partial construct", () => {
    for (let end = 1; end <= MARKDOWN_REPLY_TEXT.length; end += 1) {
      const prefix = MARKDOWN_REPLY_TEXT.slice(0, end);
      expect(() => renderToStaticMarkup(Markdown({ text: prefix }))).not.toThrow();
    }
  });

  it("renders an empty reply and a reply that is only an unclosed emphasis marker", () => {
    expect(() => renderToStaticMarkup(Markdown({ text: "" }))).not.toThrow();
    expect(() => renderToStaticMarkup(Markdown({ text: "**" }))).not.toThrow();
    expect(() =>
      renderToStaticMarkup(Markdown({ text: "[link text with no close" })),
    ).not.toThrow();
  });
});

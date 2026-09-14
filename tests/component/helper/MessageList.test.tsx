import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { MessageList } from "@/ui/helper/MessageList";

// F31 brief → "Tests first": the helper's replies render a safe Markdown subset; the
// volunteer's own messages never do (helper-protocol.md's rule that the volunteer's words
// are data, not markup, in reverse — here it is the model's words that must not become
// unescaped HTML, constitution Principle VI). Every case below is one of the brief's own
// component test cases.

// F27 addendum: the thread scrolls once it is long, and a scroll region a keyboard cannot
// reach fails axe's `scrollable-region-focusable` (WCAG SCR29). The list is a named `log`
// in the tab order, still `aria-live="polite"` so replies are announced.

function message(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("MessageList", () => {
  it("renders an assistant reply's paragraphs, bold and italic", () => {
    render(
      <MessageList
        messages={[message("1", "assistant", "One line.\n\nAnother **bold** and *italic* line.")]}
      />,
    );
    expect(screen.getAllByText((_, node) => node?.tagName === "P").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getByText("bold", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("italic", { selector: "em" })).toBeInTheDocument();
  });

  it("renders an assistant reply's bulleted and numbered lists", () => {
    render(
      <MessageList messages={[message("1", "assistant", "- first\n- second\n\n1. one\n2. two")]} />,
    );
    const lists = screen.getAllByRole("list");
    expect(lists.some((list) => list.tagName === "UL")).toBe(true);
    expect(lists.some((list) => list.tagName === "OL")).toBe(true);
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
  });

  it("renders a link opening in a new tab with rel=noopener noreferrer", () => {
    render(
      <MessageList
        messages={[message("1", "assistant", "See [the site](https://example.com/cats).")]}
      />,
    );
    const link = screen.getByRole("link", { name: "the site" });
    expect(link).toHaveAttribute("href", "https://example.com/cats");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"])(
    "drops a link whose scheme is not http(s) or mailto (%s) — plain text, no <a> at all",
    (url) => {
      const { container } = render(
        <MessageList messages={[message("1", "assistant", `Click [here](${url}).`)]} />,
      );
      expect(screen.queryByRole("link", { name: "here" })).not.toBeInTheDocument();
      expect(container.querySelector("a")).toBeNull();
      expect(container.textContent).toContain("Click here.");
    },
  );

  it("drops Markdown image syntax — no <img>, even for an allowed https URL", () => {
    render(
      <MessageList
        messages={[
          message("1", "assistant", "Before ![a cat](https://example.com/cat.jpg) after."),
        ]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("escapes raw HTML — an <img onerror> never becomes an image", () => {
    render(
      <MessageList
        messages={[message("1", "assistant", "Before <img src=x onerror=alert(1)> after.")]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("escapes a raw <script> tag — it never becomes an executable element", () => {
    render(
      <MessageList
        messages={[message("1", "assistant", "Before <script>alert(1)</script> after.")]}
      />,
    );
    expect(document.querySelector("script")).toBeNull();
  });

  it("does not break the bubble on an unclosed emphasis marker", () => {
    render(<MessageList messages={[message("1", "assistant", "This **never closes")]} />);
    expect(screen.getByText(/This/)).toBeInTheDocument();
  });

  it("renders a short heading modestly — not the page's display serif", () => {
    render(<MessageList messages={[message("1", "assistant", "### A quick update")]} />);
    const heading = screen.getByRole("heading", { name: "A quick update" });
    expect(heading).not.toHaveClass("font-display");
  });

  it("leaves the volunteer's own message as literal text, Markdown syntax untouched", () => {
    render(<MessageList messages={[message("1", "user", "**hello** there")]} />);
    expect(screen.getByText("**hello** there")).toBeInTheDocument();
    expect(screen.queryByText("hello", { selector: "strong" })).not.toBeInTheDocument();
  });
});

describe("MessageList accessibility", () => {
  it("is a named, focusable, polite log the keyboard can reach", async () => {
    const user = userEvent.setup();
    render(
      <MessageList
        messages={[message("m1", "user", "Write a bio."), message("m2", "assistant", "Done.")]}
      />,
    );
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveAttribute("tabindex", "0");
    expect(log).toHaveTextContent("Write a bio.");
    expect(log).toHaveTextContent("Done.");

    await user.tab();
    expect(log).toHaveFocus();
  });
});

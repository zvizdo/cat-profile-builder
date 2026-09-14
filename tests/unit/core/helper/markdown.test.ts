import { describe, expect, it } from "vitest";
import { isAllowedMarkdownUrl } from "@/core/helper/markdown";

// F31 brief → "Security": a helper reply's Markdown link may only point at `http:`,
// `https:` or `mailto:` — never `javascript:`, `data:`, a bare relative path, or anything
// the renderer (`src/ui/helper/Markdown.tsx`) cannot classify. Framework-free so the
// allow-list is provable at the core's 95%/95% bar (constitution, Principle III).

describe("isAllowedMarkdownUrl", () => {
  it.each(["http://example.com", "https://example.com/page", "mailto:someone@example.com"])(
    "allows %s",
    (url) => {
      expect(isAllowedMarkdownUrl(url)).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/relative/path",
    "ftp://example.com/file",
    "not a url at all",
    "",
  ])("rejects %s", (url) => {
    expect(isAllowedMarkdownUrl(url)).toBe(false);
  });
});

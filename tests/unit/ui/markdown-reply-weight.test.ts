import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// F28 review #14: DESIGN.md §2 puts 500 as the heaviest weight the tools use — a helper
// reply's own `h3` / `strong` (`react-markdown`'s output, styled entirely by this one
// `@utility` in globals.css, per `Markdown.tsx`'s own file comment) must never reach 600.
// A component test cannot see this: jsdom never loads `globals.css`, so the rule is
// asserted directly off the stylesheet text instead — the same reasoning `check-dead-
// spacing`'s tests use for another Tailwind-only class of bug.

const CSS_PATH = new URL("../../../src/app/globals.css", import.meta.url).pathname;

/** The `@utility markdown-reply { … }` block, isolated from the rest of the stylesheet. */
function markdownReplyBlock(css: string): string {
  const start = css.indexOf("@utility markdown-reply");
  if (start === -1) throw new Error("markdown-reply utility not found in globals.css");
  let depth = 0;
  let end = start;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return css.slice(start, end);
}

describe("markdown-reply heading and strong weight", () => {
  it("caps h3 and strong (and every heading) at 500 — the tools' own ceiling, not 600", () => {
    const block = markdownReplyBlock(readFileSync(CSS_PATH, "utf8"));
    const rule = /&\s*strong,[\s\S]*?&\s*h6\s*\{\s*font-weight:\s*(\d+);/;
    const match = block.match(rule);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("500");
  });
});

import { describe, expect, it } from "vitest";
import {
  firstSentence,
  fromTiptap,
  HttpUrlSchema,
  plainText,
  RichTextSchema,
  toTiptap,
  type RichText,
} from "@/core/profile/rich-text";

describe("HttpUrlSchema", () => {
  it("accepts an http URL", () => {
    expect(HttpUrlSchema.parse("http://example.com/cats")).toBe("http://example.com/cats");
  });

  it("accepts an https URL", () => {
    expect(HttpUrlSchema.parse("https://example.com/cats")).toBe("https://example.com/cats");
  });

  it("rejects a javascript: URL", () => {
    expect(() => HttpUrlSchema.parse("javascript:alert(1)")).toThrow();
  });

  it("rejects a data: URL", () => {
    expect(() => HttpUrlSchema.parse("data:text/plain,hi")).toThrow();
  });

  it("rejects a mailto: URL", () => {
    expect(() => HttpUrlSchema.parse("mailto:foster@example.com")).toThrow();
  });

  it("rejects a relative string", () => {
    expect(() => HttpUrlSchema.parse("/cats/charlotte")).toThrow();
  });
});

describe("RichTextSchema", () => {
  it("accepts a run with bold: true", () => {
    const doc: RichText = { paragraphs: [{ runs: [{ text: "hi", bold: true }] }] };
    expect(RichTextSchema.parse(doc)).toEqual(doc);
  });

  it("rejects bold: false (only true is a valid mark value)", () => {
    const doc = { paragraphs: [{ runs: [{ text: "hi", bold: false }] }] };
    expect(() => RichTextSchema.parse(doc)).toThrow();
  });

  it("rejects italic: false (only true is a valid mark value)", () => {
    const doc = { paragraphs: [{ runs: [{ text: "hi", italic: false }] }] };
    expect(() => RichTextSchema.parse(doc)).toThrow();
  });

  it("rejects more than 40 paragraphs", () => {
    const doc = {
      paragraphs: Array.from({ length: 41 }, () => ({ runs: [{ text: "x" }] })),
    };
    expect(() => RichTextSchema.parse(doc)).toThrow();
  });

  it("accepts exactly 40 paragraphs", () => {
    const doc = {
      paragraphs: Array.from({ length: 40 }, () => ({ runs: [{ text: "x" }] })),
    };
    expect(() => RichTextSchema.parse(doc)).not.toThrow();
  });

  it("rejects run text longer than 2000 characters", () => {
    const doc = { paragraphs: [{ runs: [{ text: "a".repeat(2001) }] }] };
    expect(() => RichTextSchema.parse(doc)).toThrow();
  });

  it("accepts run text of exactly 2000 characters", () => {
    const doc = { paragraphs: [{ runs: [{ text: "a".repeat(2000) }] }] };
    expect(() => RichTextSchema.parse(doc)).not.toThrow();
  });

  it("rejects more than 200 runs in a paragraph", () => {
    const doc = {
      paragraphs: [{ runs: Array.from({ length: 201 }, () => ({ text: "x" })) }],
    };
    expect(() => RichTextSchema.parse(doc)).toThrow();
  });

  it("rejects an href that is not http or https", () => {
    const doc = { paragraphs: [{ runs: [{ text: "hi", href: "javascript:alert(1)" }] }] };
    expect(() => RichTextSchema.parse(doc)).toThrow();
  });
});

describe("RichTextSchema: run count bound", () => {
  it("accepts exactly 200 runs in a paragraph", () => {
    const doc = {
      paragraphs: [{ runs: Array.from({ length: 200 }, () => ({ text: "x" })) }],
    };
    expect(() => RichTextSchema.parse(doc)).not.toThrow();
  });
});

/** A one-run, one-paragraph Tiptap doc, for tests that only care about a single mark. */
function tiptapRun(text: string, marks?: unknown[]): unknown {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text, ...(marks && { marks }) }] }],
  };
}

describe("fromTiptap: empty input", () => {
  it("converts an empty doc to an empty RichText", () => {
    expect(fromTiptap({ type: "doc" })).toEqual({ paragraphs: [] });
  });

  it("converts an empty doc with an empty content array to an empty RichText", () => {
    expect(fromTiptap({ type: "doc", content: [] })).toEqual({ paragraphs: [] });
  });

  it("drops empty text runs", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "" },
            { type: "text", text: "kept" },
          ],
        },
      ],
    };
    expect(fromTiptap(json)).toEqual({ paragraphs: [{ runs: [{ text: "kept" }] }] });
  });

  it("turns a paragraph with no runs left into { runs: [] }", () => {
    const json = { type: "doc", content: [{ type: "paragraph" }] };
    expect(fromTiptap(json)).toEqual({ paragraphs: [{ runs: [] }] });
  });
});

describe("fromTiptap: conversions", () => {
  it("converts plain paragraphs and runs", () => {
    const json = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello." }] },
        { type: "paragraph", content: [{ type: "text", text: "World." }] },
      ],
    };
    expect(fromTiptap(json)).toEqual({
      paragraphs: [{ runs: [{ text: "Hello." }] }, { runs: [{ text: "World." }] }],
    });
  });

  it("converts a bold mark", () => {
    expect(fromTiptap(tiptapRun("bold", [{ type: "bold" }]))).toEqual({
      paragraphs: [{ runs: [{ text: "bold", bold: true }] }],
    });
  });

  it("converts an italic mark", () => {
    expect(fromTiptap(tiptapRun("italic", [{ type: "italic" }]))).toEqual({
      paragraphs: [{ runs: [{ text: "italic", italic: true }] }],
    });
  });

  it("converts a link mark", () => {
    const json = tiptapRun("link", [{ type: "link", attrs: { href: "https://example.com" } }]);
    expect(fromTiptap(json)).toEqual({
      paragraphs: [{ runs: [{ text: "link", href: "https://example.com" }] }],
    });
  });
});

describe("fromTiptap: rejects invalid marks and links", () => {
  it("rejects an unknown mark type", () => {
    expect(() => fromTiptap(tiptapRun("hi", [{ type: "underline" }]))).toThrow();
  });

  it("rejects a link mark with a javascript: href", () => {
    const json = tiptapRun("hi", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]);
    expect(() => fromTiptap(json)).toThrow();
  });

  it("rejects a link mark with a mailto: href", () => {
    const json = tiptapRun("hi", [{ type: "link", attrs: { href: "mailto:foster@example.com" } }]);
    expect(() => fromTiptap(json)).toThrow();
  });

  it("rejects a link mark whose attrs has no href", () => {
    expect(() => fromTiptap(tiptapRun("hi", [{ type: "link", attrs: {} }]))).toThrow();
  });

  it("rejects a link mark with no attrs at all", () => {
    expect(() => fromTiptap(tiptapRun("hi", [{ type: "link" }]))).toThrow();
  });
});

describe("fromTiptap: rejects invalid structure", () => {
  it("rejects an unknown node type", () => {
    const json = { type: "doc", content: [{ type: "heading", content: [] }] };
    expect(() => fromTiptap(json)).toThrow();
  });

  it("rejects a document with more than 40 paragraphs", () => {
    const json = {
      type: "doc",
      content: Array.from({ length: 41 }, () => ({
        type: "paragraph",
        content: [{ type: "text", text: "x" }],
      })),
    };
    expect(() => fromTiptap(json)).toThrow();
  });

  it("rejects run text longer than 2000 characters", () => {
    expect(() => fromTiptap(tiptapRun("a".repeat(2001)))).toThrow();
  });

  it("rejects input that is not a doc at all", () => {
    expect(() => fromTiptap({ foo: "bar" })).toThrow();
    expect(() => fromTiptap(null)).toThrow();
    expect(() => fromTiptap("hello")).toThrow();
  });
});

describe("toTiptap", () => {
  it("converts an empty RichText to a doc with no content key", () => {
    expect(toTiptap({ paragraphs: [] })).toEqual({ type: "doc" });
  });

  it("emits a paragraph with no content key for an empty paragraph", () => {
    const rt: RichText = { paragraphs: [{ runs: [] }] };
    expect(toTiptap(rt)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("converts plain paragraphs and runs", () => {
    const rt: RichText = {
      paragraphs: [{ runs: [{ text: "Hello." }] }, { runs: [{ text: "World." }] }],
    };
    expect(toTiptap(rt)).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello." }] },
        { type: "paragraph", content: [{ type: "text", text: "World." }] },
      ],
    });
  });
});

describe("toTiptap: marks", () => {
  it("converts bold, italic and link runs to marks", () => {
    const rt: RichText = {
      paragraphs: [
        {
          runs: [
            { text: "bold", bold: true },
            { text: "italic", italic: true },
            { text: "link", href: "https://example.com" },
          ],
        },
      ],
    };
    expect(toTiptap(rt)).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    });
  });
});

describe("round trip", () => {
  it("is identity from RichText through toTiptap and back", () => {
    const rt: RichText = {
      paragraphs: [
        { runs: [] },
        {
          runs: [
            { text: "plain " },
            { text: "bold", bold: true },
            { text: " and ", italic: true },
            { text: "a link", href: "https://example.com/cats" },
          ],
        },
      ],
    };
    expect(fromTiptap(toTiptap(rt))).toEqual(rt);
  });

  it("is identity from a Tiptap doc through fromTiptap and back", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " plain" },
          ],
        },
        { type: "paragraph" },
      ],
    };
    expect(toTiptap(fromTiptap(json))).toEqual(json);
  });
});

describe("round trip: a run with bold, italic and a link together", () => {
  it("is identity from RichText through toTiptap and back", () => {
    const rt: RichText = {
      paragraphs: [
        {
          runs: [{ text: "all three", bold: true, italic: true, href: "https://example.com/cats" }],
        },
      ],
    };
    expect(fromTiptap(toTiptap(rt))).toEqual(rt);
  });

  it("is identity from a canonical Tiptap doc (marks in bold, italic, link order) and back", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "all three",
              marks: [
                { type: "bold" },
                { type: "italic" },
                { type: "link", attrs: { href: "https://example.com/cats" } },
              ],
            },
          ],
        },
      ],
    };
    expect(toTiptap(fromTiptap(json))).toEqual(json);
  });
});

describe("plainText", () => {
  it("joins runs with nothing and paragraphs with a blank line", () => {
    const rt: RichText = {
      paragraphs: [
        { runs: [{ text: "Hello, " }, { text: "world.", bold: true }] },
        { runs: [{ text: "Second paragraph." }] },
      ],
    };
    expect(plainText(rt)).toBe("Hello, world.\n\nSecond paragraph.");
  });

  it("returns an empty string for an empty RichText", () => {
    expect(plainText({ paragraphs: [] })).toBe("");
  });
});

describe("firstSentence", () => {
  it("returns the text up to and including the first period followed by a space", () => {
    const rt: RichText = {
      paragraphs: [{ runs: [{ text: "She showed up quietly. Then all at once." }] }],
    };
    expect(firstSentence(rt)).toBe("She showed up quietly.");
  });

  it("returns the text up to and including a ! or ? terminator", () => {
    const rt: RichText = { paragraphs: [{ runs: [{ text: "Look at her go! Amazing." }] }] };
    expect(firstSentence(rt)).toBe("Look at her go!");
  });

  it("stops at a terminator at the very end of the text", () => {
    const rt: RichText = { paragraphs: [{ runs: [{ text: "Is she friendly?" }] }] };
    expect(firstSentence(rt)).toBe("Is she friendly?");
  });

  it("does not split on a period with no following space (e.g. an abbreviation or decimal)", () => {
    const rt: RichText = { paragraphs: [{ runs: [{ text: "She weighs 3.5kg today" }] }] };
    expect(firstSentence(rt)).toBe("She weighs 3.5kg today");
  });

  it("returns the whole first paragraph, trimmed, when there is no terminator", () => {
    const rt: RichText = { paragraphs: [{ runs: [{ text: "  No terminator here  " }] }] };
    expect(firstSentence(rt)).toBe("No terminator here");
  });

  it("joins runs across a paragraph before searching for a terminator", () => {
    const rt: RichText = {
      paragraphs: [{ runs: [{ text: "She is " }, { text: "very sweet.", bold: true }] }],
    };
    expect(firstSentence(rt)).toBe("She is very sweet.");
  });

  it("returns an empty string for an empty RichText", () => {
    expect(firstSentence({ paragraphs: [] })).toBe("");
  });
});

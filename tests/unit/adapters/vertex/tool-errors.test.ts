import { InvalidToolInputError, JSONParseError, NoSuchToolError } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GENERIC_ERROR_TEXT, issuePaths, toolErrorText } from "@/adapters/vertex/tool-errors";

// F42: the text a refused tool call carries — the tool, the failing paths, Zod's own
// words — and the one fixed sentence for everything else. Never a value the model sent,
// never a provider's message.

const SECRET = "SECRET-INPUT-VALUE";

function invalid(cause: unknown): InvalidToolInputError {
  return new InvalidToolInputError({
    toolName: "add_block",
    toolInput: JSON.stringify({ block: { type: SECRET } }),
    cause,
  });
}

describe("toolErrorText", () => {
  it("names the tool and each failing path with Zod's message, and no value", () => {
    const schema = z.strictObject({
      op: z.literal("add_block"),
      block: z.strictObject({ mediaIds: z.array(z.string()) }),
    });
    const parsed = schema.safeParse({ block: { type: SECRET } });
    if (parsed.success) throw new Error("expected the fixture to fail");
    // The SDK nests the ZodError under a TypeValidationError; any depth of `cause` works.
    const text = toolErrorText(invalid({ cause: parsed.error }));
    expect(text).toMatch(/^add_block — /);
    expect(text).toContain("op:");
    expect(text).toContain("block.mediaIds:");
    expect(text).not.toContain(SECRET);
    expect(issuePaths(invalid({ cause: parsed.error }))).toEqual(["op", "block.mediaIds", "block"]);
  });

  it("an input that was not JSON at all says so, with no paths", () => {
    const cause = new JSONParseError({ text: "{oops", cause: new SyntaxError("bad") });
    expect(toolErrorText(invalid(cause))).toBe("add_block: the input was not valid JSON.");
    expect(issuePaths(invalid(cause))).toEqual([]);
  });

  it("an issue at the root is named `input`; a message that is not a string reads `invalid`", () => {
    const text = toolErrorText(invalid({ issues: [{ path: [], message: 7 }, "not an issue"] }));
    expect(text).toBe("add_block — input: invalid");
  });

  it("a tool that does not exist is named, with the tools that do when known", () => {
    expect(
      toolErrorText(new NoSuchToolError({ toolName: "publish", availableTools: ["a", "b"] })),
    ).toBe("publish: no such tool. The tools are: a, b.");
    expect(toolErrorText(new NoSuchToolError({ toolName: "publish" }))).toBe(
      "publish: no such tool.",
    );
  });

  it("anything else — a provider's error, a string, nothing — is the one fixed sentence", () => {
    expect(toolErrorText(new Error(`provider said ${SECRET}`))).toBe(GENERIC_ERROR_TEXT);
    expect(toolErrorText(`provider said ${SECRET}`)).toBe(GENERIC_ERROR_TEXT);
    expect(toolErrorText(undefined)).toBe(GENERIC_ERROR_TEXT);
    expect(issuePaths(new Error("x"))).toEqual([]);
  });
});

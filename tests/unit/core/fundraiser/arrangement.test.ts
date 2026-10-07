import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  arrangementOf,
  heldRatio,
  HOLD_SIDE_RATIO,
  HOLD_STACK_RATIO,
  STACK_BELOW,
} from "@/core/fundraiser/arrangement";

// The arrangement rule (display-layout.md, "Two arrangements, one switch" and the soft keyboard's
// "Known risk"): the stage is a centred stack below a width-to-height ratio and side by side at or
// above it. The stylesheet decides it with a container query; the page reads it once, when a
// session opens, with this function, so the two must name the same ratio.

describe("arrangementOf", () => {
  it.each([
    [390, 844, "stack"],
    [320, 568, "stack"],
    [1080, 1920, "stack"],
    [1000, 1000, "stack"],
    [1099, 1000, "stack"],
    [1100, 1000, "side"],
    [1920, 1080, "side"],
    [1024, 768, "side"],
    [844, 390, "side"],
    [2560, 1080, "side"],
  ] as const)("a %i x %i stage is %s", (width, height, expected) => {
    expect(arrangementOf(width, height)).toBe(expected);
  });

  it("says the keyboard's shrunken 320 x 250 phone is side by side, which is why the page holds the answer", () => {
    expect(arrangementOf(320, 568)).toBe("stack");
    expect(arrangementOf(320, 250)).toBe("side");
  });

  it("has nothing to say about a box with no size (a page not yet laid out)", () => {
    expect(arrangementOf(0, 0)).toBeUndefined();
    expect(arrangementOf(390, 0)).toBeUndefined();
    expect(arrangementOf(0, 844)).toBeUndefined();
    expect(arrangementOf(Number.NaN, 844)).toBeUndefined();
  });
});

describe("the ratio the stylesheet switches on", () => {
  const css = readFileSync(
    new URL("../../../../src/ui/fundraiser/fundraiser.module.css", import.meta.url),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("is the same number in the container query as in core", () => {
    const queries = [...css.matchAll(/@container\s*\(aspect-ratio\s*<\s*([\d.]+)\)/g)].map(
      (match) => Number(match[1]),
    );
    expect(queries.length).toBeGreaterThan(0);
    expect(new Set(queries)).toEqual(new Set([STACK_BELOW]));
  });
});

describe("heldRatio", () => {
  it.each([
    ["stack", 390, 844],
    ["stack", 1000, 935],
    ["stack", 1099, 1000],
    ["side", 1920, 1080],
    ["side", 1100, 917],
    ["side", 1100, 1000],
  ] as const)(
    "never bites on the stage a %s session opened on (%i x %i): the box is as it was",
    (held, width, height) => {
      const ratio = heldRatio(held, width, height);
      if (held === "stack") expect(height * ratio).toBeGreaterThanOrEqual(width - 1e-9);
      else expect(width / ratio).toBeGreaterThanOrEqual(height - 1e-9);
      expect(arrangementOf(width, height)).toBe(held);
    },
  );

  it("keeps a held stack under the threshold and a held side by side over it, however the stage turns", () => {
    for (const [held, w, h] of [
      ["stack", 390, 844],
      ["stack", 1099, 1000],
      ["side", 1920, 1080],
      ["side", 1100, 1000],
    ] as const) {
      const ratio = heldRatio(held, w, h);
      expect(ratio).toBeGreaterThan(0);
      expect(arrangementOf(ratio, 1)).toBe(held);
    }
    expect(HOLD_STACK_RATIO).toBeLessThan(STACK_BELOW);
    expect(HOLD_SIDE_RATIO).toBeGreaterThan(STACK_BELOW);
  });
});

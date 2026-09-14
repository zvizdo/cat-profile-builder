import { describe, expect, it } from "vitest";
import { parseHold } from "@/core/carousel/hold";

// The `hold` clamp (FR-089): 4-20 seconds, default 8, garbage falls back rather than refusing.

describe("parseHold", () => {
  it("defaults to 8 with no value", () => {
    expect(parseHold(undefined)).toBe(8);
  });

  it("clamps a value over the ceiling to 20", () => {
    expect(parseHold("99")).toBe(20);
  });

  it("clamps a value under the floor to 4", () => {
    expect(parseHold("2")).toBe(4);
  });

  it("falls back to 8 for anything unparsable", () => {
    expect(parseHold("abc")).toBe(8);
  });

  it("passes an in-range value through unchanged", () => {
    expect(parseHold("12")).toBe(12);
  });

  it("takes the first value of a repeated query key", () => {
    expect(parseHold(["15", "3"])).toBe(15);
  });

  it("defaults to 8 for an empty repeated key", () => {
    expect(parseHold([])).toBe(8);
  });
});

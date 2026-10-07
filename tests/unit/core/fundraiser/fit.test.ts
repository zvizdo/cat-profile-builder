import { describe, expect, it } from "vitest";
import { AMOUNT_FIT, HEADLINE_FIT, TAG_FIT, codePointLength, fitStep } from "@/core/fundraiser/fit";

// Fit steps (data-model.md): the display sets `data-fit` from `fitStep` and the stylesheet
// picks a type size per step. A length equal to a breakpoint still fits that step, so the
// off-by-one at each edge is the behaviour worth pinning.

describe("codePointLength", () => {
  it("is 0 for empty text", () => {
    expect(codePointLength("")).toBe(0);
  });

  it("counts plain characters one each", () => {
    expect(codePointLength("Whiskers")).toBe(8);
  });

  it("counts an emoji outside the basic plane as one, not two UTF-16 units", () => {
    expect("🐱".length).toBe(2);
    expect(codePointLength("🐱")).toBe(1);
    expect(codePointLength("Mo🐱")).toBe(3);
  });

  it("counts a combining sequence per its code points", () => {
    // "e" plus a combining acute accent is two code points, however it looks on screen.
    expect(codePointLength("e\u0301")).toBe(2);
    // Family emoji: four people joined by three zero-width joiners is seven code points.
    expect(codePointLength("👨‍👩‍👧‍👦")).toBe(7);
  });
});

describe("fitStep", () => {
  const breakpoints = [24, 40];

  it("is step 0 for empty text", () => {
    expect(fitStep(0, breakpoints)).toBe(0);
  });

  it.each([
    [23, 0],
    [24, 0],
    [25, 1],
    [39, 1],
    [40, 1],
    [41, 2],
  ])("puts a length of %i at step %i", (length, step) => {
    expect(fitStep(length, breakpoints)).toBe(step);
  });

  it("returns breakpoints.length for a length far past the last breakpoint", () => {
    expect(fitStep(10_000, breakpoints)).toBe(breakpoints.length);
    expect(fitStep(10_000, AMOUNT_FIT)).toBe(AMOUNT_FIT.length);
  });

  it("is always step 0 when there are no breakpoints", () => {
    expect(fitStep(0, [])).toBe(0);
    expect(fitStep(99, [])).toBe(0);
  });

  it.each([
    ["HEADLINE_FIT", HEADLINE_FIT],
    ["AMOUNT_FIT", AMOUNT_FIT],
    ["TAG_FIT", TAG_FIT],
  ])("never steps back as the text grows (%s)", (_name, points) => {
    let previous = 0;
    for (let length = 0; length <= 60; length += 1) {
      const step = fitStep(length, points);
      expect(step).toBeGreaterThanOrEqual(previous);
      previous = step;
    }
    expect(previous).toBe(points.length);
  });
});

describe("the fit constants", () => {
  it("hold the starting breakpoints", () => {
    expect(HEADLINE_FIT).toEqual([24, 40]);
    expect(AMOUNT_FIT).toEqual([6, 8, 10, 12]);
    expect(TAG_FIT).toEqual([9, 11]);
  });

  it.each([
    ["HEADLINE_FIT", HEADLINE_FIT],
    ["AMOUNT_FIT", AMOUNT_FIT],
    ["TAG_FIT", TAG_FIT],
  ])("%s is strictly increasing, so every step is reachable", (_name, points) => {
    points.forEach((point, index) => {
      expect(point).toBeGreaterThan(points[index - 1] ?? 0);
    });
  });

  it.each([
    ["HEADLINE_FIT", HEADLINE_FIT],
    ["AMOUNT_FIT", AMOUNT_FIT],
    ["TAG_FIT", TAG_FIT],
  ])("%s is frozen at runtime", (_name, points) => {
    expect(Object.isFrozen(points)).toBe(true);
  });
});

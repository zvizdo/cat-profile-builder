import { describe, expect, it } from "vitest";
import { fitStage } from "@/core/carousel/stage-fit";

// The device-pixel-snapped stage fit (F64 in specs/001-cat-profile-builder/tasks.md):
// the stage's scale and offsets must land on whole device pixels on
// every side, or the frame's `overflow: hidden` clip flickers under the media layers'
// compositor animation (the drift). `n = floor(min(width·dpr/1920, height·dpr/1080) ·
// 120)` is the largest count of 1/120-device-pixel steps that fits the box; `scale = n /
// (120·dpr)` keeps both 1920·scale·dpr (= 16n) and 1080·scale·dpr (= 9n) whole for every
// dpr, so the frame's width and height are always a whole number of device pixels too.

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;

/** True within floating-point noise of a whole number. */
function isWhole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9;
}

describe("fitStage", () => {
  it("390×844 at dpr 3 (an iPhone-class phone): scale 73/360, offsets snapped to the grid", () => {
    const fit = fitStage({ width: 390, height: 844, dpr: 3 });
    expect(fit.scale).toBeCloseTo(73 / 360, 10);
    expect(fit.left * 3).toBeCloseTo(1, 10);
    expect(fit.top * 3).toBeCloseTo(937, 10);
    expect(FRAME_WIDTH * fit.scale * 3).toBeCloseTo(1168, 10);
    expect(FRAME_HEIGHT * fit.scale * 3).toBeCloseTo(657, 10);
  });

  it("1920×1080 at dpr 1 (a 1080p TV): scale 1, no offset", () => {
    const fit = fitStage({ width: 1920, height: 1080, dpr: 1 });
    expect(fit.scale).toBe(1);
    expect(fit.left).toBe(0);
    expect(fit.top).toBe(0);
  });

  it("1440×900 at dpr 2 (a 16:10 laptop): scale 0.75, letterboxed 45px top and bottom", () => {
    const fit = fitStage({ width: 1440, height: 900, dpr: 2 });
    expect(fit.scale).toBe(0.75);
    expect(fit.left).toBe(0);
    expect(fit.top).toBe(45);
  });

  it("844×390 at dpr 3 (the phone in landscape): every edge is a whole device pixel and the stage sits inside the box", () => {
    const fit = fitStage({ width: 844, height: 390, dpr: 3 });
    const frameWidth = FRAME_WIDTH * fit.scale;
    const frameHeight = FRAME_HEIGHT * fit.scale;
    expect(isWhole(fit.left * 3)).toBe(true);
    expect(isWhole(fit.top * 3)).toBe(true);
    expect(isWhole(frameWidth * 3)).toBe(true);
    expect(isWhole(frameHeight * 3)).toBe(true);
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.top).toBeGreaterThanOrEqual(0);
    expect(fit.left + frameWidth).toBeLessThanOrEqual(844 + 1e-9);
    expect(fit.top + frameHeight).toBeLessThanOrEqual(390 + 1e-9);
  });

  it("every case above lands on whole device pixels on all four edges and never exceeds the box", () => {
    const cases = [
      { width: 390, height: 844, dpr: 3 },
      { width: 1920, height: 1080, dpr: 1 },
      { width: 1440, height: 900, dpr: 2 },
      { width: 844, height: 390, dpr: 3 },
    ];
    for (const { width, height, dpr } of cases) {
      const fit = fitStage({ width, height, dpr });
      const frameWidth = FRAME_WIDTH * fit.scale;
      const frameHeight = FRAME_HEIGHT * fit.scale;
      expect(isWhole(fit.left * dpr)).toBe(true);
      expect(isWhole(fit.top * dpr)).toBe(true);
      expect(isWhole(frameWidth * dpr)).toBe(true);
      expect(isWhole(frameHeight * dpr)).toBe(true);
      expect(fit.left + frameWidth).toBeLessThanOrEqual(width + 1e-9);
      expect(fit.top + frameHeight).toBeLessThanOrEqual(height + 1e-9);
    }
  });

  it("1968×1107 at dpr 1: an exact 123-step fit, not one step short from rounding min(...)·120 twice", () => {
    // n = min(1968/16, 1107/9) = min(123, 123) = 123 exactly. Computing it as
    // floor(min(width·dpr/1920, height·dpr/1080) · 120) instead rounds twice and can land
    // on 122.99999999999999, one step short — this case is exactly that trap.
    const fit = fitStage({ width: 1968, height: 1107, dpr: 1 });
    expect(fit.scale).toBe(123 / 120);
    expect(fit.left).toBe(0);
    expect(fit.top).toBe(0);
  });

  it("never gives a stage smaller than one 1/120-device-pixel step, even in a box far smaller than the frame", () => {
    const fit = fitStage({ width: 1, height: 1, dpr: 1 });
    expect(fit.scale).toBeCloseTo(1 / 120, 10);
  });

  it("a zero-size box still returns the one-step floor rather than a zero or negative scale", () => {
    const fit = fitStage({ width: 0, height: 0, dpr: 1 });
    expect(fit.scale).toBeCloseTo(1 / 120, 10);
  });
});

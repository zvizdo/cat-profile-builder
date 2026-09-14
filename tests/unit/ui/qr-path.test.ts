import { describe, expect, it } from "vitest";
import { qrPath } from "@/ui/carousel/qr-path";

// The QR card's one piece of drawing logic (FR-088): a QR symbol's module matrix as a
// single SVG path of unit squares, dark modules only, runs merged per row.

describe("qrPath", () => {
  it("draws each dark module as a unit square, merging runs along a row", () => {
    expect(qrPath({ size: 2, data: [1, 0, 1, 1] })).toBe("M0 0h1v1h-1zM0 1h2v1h-2z");
  });

  it("draws nothing for an all-light matrix", () => {
    expect(qrPath({ size: 2, data: [0, 0, 0, 0] })).toBe("");
  });

  it("starts a new run after a gap on the same row", () => {
    expect(qrPath({ size: 3, data: [1, 0, 1, 0, 0, 0, 1, 1, 1] })).toBe(
      "M0 0h1v1h-1zM2 0h1v1h-1zM0 2h3v1h-3z",
    );
  });
});

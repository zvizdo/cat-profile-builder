import { describe, expect, it } from "vitest";

// Keeps the unit project non-empty until the first core module lands (T004), so the
// coverage run has a suite to measure.
describe("unit project", () => {
  it("runs in the Node environment", () => {
    expect(typeof window).toBe("undefined");
  });
});

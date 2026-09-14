import { describe, expect, it } from "vitest";

// Keeps the contract project non-empty until the first contract test lands (T004).
describe("contract project", () => {
  it("runs in the Node environment", () => {
    expect(typeof window).toBe("undefined");
  });
});

import { describe, expect, it } from "vitest";
import { formatTimeOfDay } from "@/core/format/time-of-day";

// The `14:02` in the kiosk's `Last updated 14:02` line (T043; CONTENT.md → Event carousel
// → Offline): local wall-clock time as `HH:MM`, twenty-four hours, both parts two digits.

describe("formatTimeOfDay", () => {
  it("writes local hours and minutes, each two digits, on a twenty-four hour clock", () => {
    expect(formatTimeOfDay(new Date(2026, 8, 12, 14, 2))).toBe("14:02");
    expect(formatTimeOfDay(new Date(2026, 8, 12, 9, 30))).toBe("09:30");
    expect(formatTimeOfDay(new Date(2026, 8, 12, 0, 0))).toBe("00:00");
    expect(formatTimeOfDay(new Date(2026, 8, 12, 23, 59, 59))).toBe("23:59");
  });
});

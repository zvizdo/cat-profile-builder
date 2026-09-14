import { describe, expect, it } from "vitest";
import { formatClock } from "@/core/format/clock";

// The `0:10` a video tile shows (CONTENT.md → block labels `trim 0:04 – 0:12 of 2:07`):
// whole seconds as `m:ss`, minutes unpadded, seconds always two digits. Fractions are
// rounded to the nearest second so a 10.5 s clip reads `0:10` or `0:11`, never `0:10.5`.

describe("formatClock", () => {
  it("pads seconds to two digits and leaves minutes bare", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(2)).toBe("0:02");
    expect(formatClock(10)).toBe("0:10");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(127)).toBe("2:07");
  });

  it("drops the fraction rather than rounding up", () => {
    expect(formatClock(10.5)).toBe("0:10");
    expect(formatClock(59.9)).toBe("0:59");
  });
});

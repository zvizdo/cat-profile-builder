import { describe, expect, it } from "vitest";
import { trimLabel } from "@/ui/builder/time-format";

// The trim editor's live label (CONTENT.md → Modals: `0:28 – 0:40 · muted · loops`, block
// label `trim 0:04 – 0:12 of 2:07`): both ends and the original's length as `m:ss`, then
// the two facts every clip shares (FR-085: silent everywhere). A stretch under ten seconds
// is written in tenths, so a half-second stretch reads honestly (T023 fix round 1).

describe("trimLabel", () => {
  it("writes the range, the original's length, and that the clip is muted and loops", () => {
    expect(trimLabel(28, 40, 127)).toBe("0:28 – 0:40 of 2:07 · muted · loops");
  });

  it("drops fractions of a second from a stretch of ten seconds or more, as the tile does", () => {
    expect(trimLabel(0.4, 10.9, 20.02)).toBe("0:00 – 0:10 of 0:20 · muted · loops");
    expect(trimLabel(0, 10, 20)).toBe("0:00 – 0:10 of 0:20 · muted · loops");
  });

  it("writes tenths for a stretch under ten seconds", () => {
    expect(trimLabel(0, 0.5, 20)).toBe("0:00.0 – 0:00.5 of 0:20 · muted · loops");
    expect(trimLabel(4, 12, 127)).toBe("0:04.0 – 0:12.0 of 2:07 · muted · loops");
    expect(trimLabel(61.2, 69.9, 127)).toBe("1:01.2 – 1:09.9 of 2:07 · muted · loops");
    expect(trimLabel(2.3, 4.96, 20)).toBe("0:02.3 – 0:05.0 of 0:20 · muted · loops");
  });

  it("pads seconds to two digits past the minute", () => {
    expect(trimLabel(60, 75, 3599)).toBe("1:00 – 1:15 of 59:59 · muted · loops");
  });
});

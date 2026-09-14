import { describe, expect, it } from "vitest";
import { relativeTime, relativeTimeSeconds } from "@/core/format/relative-time";

// The `edited 4d` word on a list card (CONTENT.md → Profile list, card meta): how long ago
// an ISO instant was, as one short token — `just now`, then minutes, hours, days, weeks,
// months. Pure, so the page can pass its own `now` and the text never differs between the
// server and the browser.

const NOW = new Date("2026-09-11T12:00:00.000Z");

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("is `just now` under a minute", () => {
    expect(relativeTime(ago(0), NOW)).toBe("just now");
    expect(relativeTime(ago(59_000), NOW)).toBe("just now");
  });

  it("counts minutes from one minute to an hour", () => {
    expect(relativeTime(ago(MINUTE), NOW)).toBe("1m");
    expect(relativeTime(ago(5 * MINUTE), NOW)).toBe("5m");
    expect(relativeTime(ago(59 * MINUTE + 59_000), NOW)).toBe("59m");
  });

  it("counts hours from one hour to a day", () => {
    expect(relativeTime(ago(HOUR), NOW)).toBe("1h");
    expect(relativeTime(ago(4 * HOUR + 30 * MINUTE), NOW)).toBe("4h");
    expect(relativeTime(ago(23 * HOUR + 59 * MINUTE), NOW)).toBe("23h");
  });

  it("counts days from one day to a week", () => {
    expect(relativeTime(ago(DAY), NOW)).toBe("1d");
    expect(relativeTime(ago(4 * DAY + 6 * HOUR), NOW)).toBe("4d");
    expect(relativeTime(ago(6 * DAY + 23 * HOUR), NOW)).toBe("6d");
  });

  it("counts weeks from seven days to thirty", () => {
    expect(relativeTime(ago(7 * DAY), NOW)).toBe("1w");
    expect(relativeTime(ago(3 * 7 * DAY + DAY), NOW)).toBe("3w");
    expect(relativeTime(ago(29 * DAY), NOW)).toBe("4w");
  });

  it("counts months of thirty days from there on", () => {
    expect(relativeTime(ago(30 * DAY), NOW)).toBe("1mo");
    expect(relativeTime(ago(75 * DAY), NOW)).toBe("2mo");
    expect(relativeTime(ago(400 * DAY), NOW)).toBe("13mo");
  });

  it("treats a future instant and an unreadable one as `just now` rather than guessing", () => {
    expect(relativeTime(ago(-5 * MINUTE), NOW)).toBe("just now");
    expect(relativeTime("not a date", NOW)).toBe("just now");
  });
});

describe("relativeTimeSeconds", () => {
  it("counts whole seconds under a minute, `just now` under one", () => {
    expect(relativeTimeSeconds(ago(0), NOW)).toBe("just now");
    expect(relativeTimeSeconds(ago(999), NOW)).toBe("just now");
    expect(relativeTimeSeconds(ago(2_000), NOW)).toBe("2s");
    expect(relativeTimeSeconds(ago(59_999), NOW)).toBe("59s");
  });

  it("hands off to relativeTime from a minute up", () => {
    expect(relativeTimeSeconds(ago(MINUTE), NOW)).toBe("1m");
    expect(relativeTimeSeconds(ago(3 * DAY), NOW)).toBe("3d");
  });

  it("never shows a negative age", () => {
    expect(relativeTimeSeconds(ago(-5_000), NOW)).toBe("just now");
  });
});

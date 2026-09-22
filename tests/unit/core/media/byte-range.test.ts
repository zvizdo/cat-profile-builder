import { describe, expect, it } from "vitest";
import {
  capRange,
  MAX_RANGE_BYTES,
  parseByteRange,
  parseRangeHeader,
} from "@/core/media/byte-range";

// The `Range` header grammar the `/media` route honours (F23; RFC 9110 §14.1.2): one
// `bytes=` range in any of its three forms, resolved against the file's size to an inclusive
// slice, or `null` for anything that cannot be satisfied.

describe("parseByteRange", () => {
  it("resolves start-end, clamping the end to the last byte", () => {
    expect(parseByteRange("bytes=2-4", 10)).toEqual({ start: 2, end: 4 });
    expect(parseByteRange("bytes=0-0", 10)).toEqual({ start: 0, end: 0 });
    expect(parseByteRange("bytes=8-100", 10)).toEqual({ start: 8, end: 9 });
  });

  it("resolves an open-ended range to the last byte", () => {
    expect(parseByteRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange("bytes=0-", 10)).toEqual({ start: 0, end: 9 });
  });

  it("resolves a suffix range to the last n bytes, at most the whole file", () => {
    expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange("bytes=-10", 10)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange("bytes=-500", 10)).toEqual({ start: 0, end: 9 });
  });

  it("tolerates whitespace around the unit and the ends", () => {
    expect(parseByteRange(" bytes = 2-4 ", 10)).toEqual({ start: 2, end: 4 });
  });

  it.each([
    ["bytes=10-12", "a start past the last byte"],
    ["bytes=5-2", "an end before the start"],
    ["bytes=-0", "a suffix of nothing"],
    ["bytes=-", "no number at all"],
    ["bytes=1-2,4-5", "more than one range"],
    ["items=1-2", "another unit"],
    ["bytes=a-b", "letters"],
    ["", "an empty header"],
  ])("answers null for %s (%s)", (header) => {
    expect(parseByteRange(header, 10)).toBeNull();
  });

  it("parseRangeHeader: the grammar alone — a suffix of nothing parses, other units do not", () => {
    expect(parseRangeHeader("bytes=2-4")).toEqual({ start: 2, end: 4 });
    expect(parseRangeHeader("bytes=7-")).toEqual({ start: 7 });
    expect(parseRangeHeader("bytes=-3")).toEqual({ suffix: 3 });
    expect(parseRangeHeader("bytes=-0")).toEqual({ suffix: 0 });
    for (const header of ["items=1-2", "bytes=1-2,4-5", "bytes=a-b", "bytes", ""]) {
      expect(parseRangeHeader(header), header).toBeNull();
    }
  });

  it("answers null for every range of an empty file", () => {
    expect(parseByteRange("bytes=0-", 0)).toBeNull();
    expect(parseByteRange("bytes=-1", 0)).toBeNull();
  });
});

describe("capRange", () => {
  it("is 8 MiB — well under Cloud Run's 32 MiB response limit", () => {
    expect(MAX_RANGE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("leaves a range of at most MAX_RANGE_BYTES alone", () => {
    expect(capRange({ start: 0, end: 0 })).toEqual({ start: 0, end: 0 });
    expect(capRange({ start: 5, end: 99 })).toEqual({ start: 5, end: 99 });
    expect(capRange({ start: 0, end: MAX_RANGE_BYTES - 1 })).toEqual({
      start: 0,
      end: MAX_RANGE_BYTES - 1,
    });
  });

  it("pulls in the end of a longer range so it spans exactly MAX_RANGE_BYTES", () => {
    expect(capRange({ start: 0, end: MAX_RANGE_BYTES })).toEqual({
      start: 0,
      end: MAX_RANGE_BYTES - 1,
    });
    expect(capRange({ start: 100, end: 60_000_000 })).toEqual({
      start: 100,
      end: 100 + MAX_RANGE_BYTES - 1,
    });
  });

  it("caps an open-ended range (end = Infinity)", () => {
    expect(capRange({ start: 7, end: Infinity })).toEqual({
      start: 7,
      end: 7 + MAX_RANGE_BYTES - 1,
    });
  });
});

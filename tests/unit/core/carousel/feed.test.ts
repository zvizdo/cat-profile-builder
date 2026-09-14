import { describe, expect, it } from "vitest";
import { createFeed, reduceFeed, type Feed } from "@/core/carousel/feed";

// The kiosk's feed (FR-061, FR-066; CONTENT.md → Event carousel → Offline) as pure
// transitions: an answer is held until the beat drains it at a boundary — or taken at once
// when nothing is mid-beat — a failure keeps the roster and dates the outage's start, and
// the next success clears it. Rosters are opaque here; the feed never looks inside one.

const OLD = ["a", "b", "c"];
const NEW = ["a", "c"];
const LOADED_AT = 1_000;

function fine(): Feed<string> {
  return createFeed(OLD, LOADED_AT);
}

describe("createFeed", () => {
  it("starts on the given roster, nothing pending, last good at the load, no failure", () => {
    expect(fine()).toEqual({
      roster: OLD,
      pendingRoster: undefined,
      lastGoodAt: LOADED_AT,
      failedSince: undefined,
    });
  });
});

describe("reduceFeed — an answer", () => {
  it("is held as pendingRoster and dates the success; the roster on show is untouched", () => {
    const feed = reduceFeed(fine(), { type: "arrived", roster: NEW, at: 2_000, immediate: false });
    expect(feed).toEqual({
      roster: OLD,
      pendingRoster: NEW,
      lastGoodAt: 2_000,
      failedSince: undefined,
    });
  });

  it("a later answer replaces what is pending", () => {
    let feed = reduceFeed(fine(), { type: "arrived", roster: NEW, at: 2_000, immediate: false });
    feed = reduceFeed(feed, { type: "arrived", roster: ["z"], at: 3_000, immediate: false });
    expect(feed.pendingRoster).toEqual(["z"]);
    expect(feed.roster).toBe(OLD);
  });

  it("becomes the roster at once when told nothing is mid-beat, or when the roster is empty", () => {
    expect(
      reduceFeed(fine(), { type: "arrived", roster: NEW, at: 2_000, immediate: true }),
    ).toMatchObject({ roster: NEW, pendingRoster: undefined });
    expect(
      reduceFeed(createFeed([], LOADED_AT), {
        type: "arrived",
        roster: NEW,
        at: 2_000,
        immediate: false,
      }),
    ).toMatchObject({ roster: NEW, pendingRoster: undefined });
  });

  it("clears a failure", () => {
    let feed = reduceFeed(fine(), { type: "failed", at: 2_000 });
    feed = reduceFeed(feed, { type: "arrived", roster: NEW, at: 3_000, immediate: false });
    expect(feed.failedSince).toBeUndefined();
    expect(feed.lastGoodAt).toBe(3_000);
  });
});

describe("reduceFeed — a failure", () => {
  it("keeps the roster and what is pending, keeps the last good time, and dates the outage's start", () => {
    let feed = reduceFeed(fine(), { type: "arrived", roster: NEW, at: 2_000, immediate: false });
    feed = reduceFeed(feed, { type: "failed", at: 3_000 });
    expect(feed).toEqual({
      roster: OLD,
      pendingRoster: NEW,
      lastGoodAt: 2_000,
      failedSince: 3_000,
    });
    // A second failure does not move the date: the line names when the feed went quiet.
    expect(reduceFeed(feed, { type: "failed", at: 4_000 })).toBe(feed);
  });
});

describe("reduceFeed — drain", () => {
  it("moves what is pending onto the roster, and is a no-op with nothing pending", () => {
    const held = reduceFeed(fine(), { type: "arrived", roster: NEW, at: 2_000, immediate: false });
    const drained = reduceFeed(held, { type: "drain" });
    expect(drained).toMatchObject({ roster: NEW, pendingRoster: undefined, lastGoodAt: 2_000 });
    expect(reduceFeed(drained, { type: "drain" })).toBe(drained);
    expect(reduceFeed(fine(), { type: "drain" })).toEqual(fine());
  });
});

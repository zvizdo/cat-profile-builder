import { describe, expect, it } from "vitest";
import { type MediaAsset } from "@/core/media/schema";
import { photoBudget } from "@/core/helper/photo-budget";
import { photoAsset, videoAsset } from "../media/builders";

// `photoBudget` is the pure rule engine `view_photos` obeys (FR-082, helper-protocol.md):
// only ids the profile owns, only photos, at most six per call, at most twelve per whole
// request. It never mutates its `state` argument — every call returns a fresh one.

const PHOTO = photoAsset({ id: "media2aa" });
const PHOTO_B = photoAsset({ id: "media2ab" });
const VIDEO = videoAsset({ id: "video2aa" });
const ASSETS: MediaAsset[] = [PHOTO, PHOTO_B, VIDEO];

describe("photoBudget: ownership and kind", () => {
  it("allows an owned photo id", () => {
    const result = photoBudget({ sent: 0 }, ["media2aa"], ASSETS);
    expect(result).toEqual({ allowed: ["media2aa"], refused: [], state: { sent: 1 } });
  });

  it("refuses an id the profile does not own", () => {
    const result = photoBudget({ sent: 0 }, ["nope1234"], ASSETS);
    expect(result.allowed).toEqual([]);
    expect(result.refused).toEqual([
      { id: "nope1234", error: "That photo is not on this cat's page." },
    ]);
    expect(result.state).toEqual({ sent: 0 });
  });

  it("refuses a video id", () => {
    const result = photoBudget({ sent: 0 }, ["video2aa"], ASSETS);
    expect(result.refused).toEqual([
      { id: "video2aa", error: "That is a video; the helper can only look at photos." },
    ]);
    expect(result.state).toEqual({ sent: 0 });
  });

  it("keeps the rest allowed when one id in the call is refused", () => {
    const result = photoBudget({ sent: 0 }, ["media2aa", "video2aa", "media2ab"], ASSETS);
    expect(result.allowed).toEqual(["media2aa", "media2ab"]);
    expect(result.refused).toEqual([
      { id: "video2aa", error: "That is a video; the helper can only look at photos." },
    ]);
    expect(result.state).toEqual({ sent: 2 });
  });
});

describe("photoBudget: the six-per-call cap", () => {
  it("refuses a seventh id in one call and allows the first six", () => {
    const suffixes = ["a", "b", "c", "d", "e", "f", "g"];
    const assets = suffixes.map((suffix) => photoAsset({ id: `photo22${suffix}` }));
    const ids = assets.map((asset) => asset.id);
    const result = photoBudget({ sent: 0 }, ids, assets);
    expect(result.allowed).toEqual(ids.slice(0, 6));
    expect(result.refused).toEqual([{ id: ids[6], error: "Only six photos per call." }]);
    expect(result.state).toEqual({ sent: 6 });
  });
});

describe("photoBudget: the twelve-per-request cap", () => {
  it("refuses a thirteenth id in one request once twelve have already been sent", () => {
    const result = photoBudget({ sent: 12 }, ["media2aa"], ASSETS);
    expect(result.allowed).toEqual([]);
    expect(result.refused).toEqual([
      {
        id: "media2aa",
        error: "The helper has looked at twelve photos this turn; that is the limit.",
      },
    ]);
    expect(result.state).toEqual({ sent: 12 });
  });

  it("allows up to the budget and refuses what would go over it, within one call", () => {
    const suffixes = ["a", "b", "c"];
    const assets = suffixes.map((suffix) => photoAsset({ id: `photo33${suffix}` }));
    const ids = assets.map((asset) => asset.id);
    const result = photoBudget({ sent: 11 }, ids, assets);
    expect(result.allowed).toEqual([ids[0]]);
    expect(result.refused).toEqual([
      { id: ids[1], error: "The helper has looked at twelve photos this turn; that is the limit." },
      { id: ids[2], error: "The helper has looked at twelve photos this turn; that is the limit." },
    ]);
    expect(result.state).toEqual({ sent: 12 });
  });
});

describe("photoBudget: purity", () => {
  it("never mutates the state object it is given", () => {
    const state = { sent: 3 };
    const frozen = { ...state };
    photoBudget(state, ["media2aa"], ASSETS);
    expect(state).toEqual(frozen);
  });

  it("returns a new state object, not the one it was given", () => {
    const state = { sent: 0 };
    const result = photoBudget(state, ["media2aa"], ASSETS);
    expect(result.state).not.toBe(state);
  });
});

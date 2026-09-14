import { describe, expect, it } from "vitest";
import {
  LEGACY_META_THUMBNAIL_URL,
  META_NAME,
  META_THUMBNAIL_MEDIA,
  META_UPDATED_AT,
  metadataOf,
  repairLegacyThumbnail,
  rowsOf,
} from "@/adapters/listing";

// The list metadata a draft save stamps and reads back (ADR-015 → Draft saves; F30). Two
// things are pinned here in isolation, ahead of the store-level contract cases in
// `tests/contract/stores.suite.ts`: `metadataOf` never writes a URL, and
// `repairLegacyThumbnail` turns any old `thumbnail-url` stamp — whatever host it once
// pointed at — into the same `{mid, rev}` pair a fresh stamp holds, but only when the
// stamp's own pid matches the draft it was read from (review F30 round 1, finding 1).

const PID = "abcdefgh";
const OTHER_PID = "zyxwvuts";
const MID = "mmmmmmm2";
const REV = "abc1234567";

describe("repairLegacyThumbnail", () => {
  it("parses the trailing path of an absolute bucket URL from before F23", () => {
    expect(
      repairLegacyThumbnail(
        `https://storage.googleapis.com/some-bucket/profiles/${PID}/media/${MID}/clean.${REV}.jpg`,
        PID,
      ),
    ).toEqual({ mid: MID, rev: REV });
  });

  it("parses the same tail from a root-relative /media/… URL (after F23)", () => {
    expect(
      repairLegacyThumbnail(`/media/profiles/${PID}/media/${MID}/clean.${REV}.jpg`, PID),
    ).toEqual({ mid: MID, rev: REV });
  });

  it("parses the tail regardless of the host in front of it", () => {
    expect(
      repairLegacyThumbnail(
        `https://cdn.example.net/anything/profiles/${PID}/media/${MID}/clean.${REV}.jpg`,
        PID,
      ),
    ).toEqual({ mid: MID, rev: REV });
  });

  it("is null for a poster or web (video) derived path — a thumbnail is always a photo", () => {
    expect(
      repairLegacyThumbnail(`/media/profiles/${PID}/media/${MID}/poster.${REV}.jpg`, PID),
    ).toBeNull();
    expect(
      repairLegacyThumbnail(`/media/profiles/${PID}/media/${MID}/web.${REV}.mp4`, PID),
    ).toBeNull();
  });

  it("is null for a URL that isn't a derived media path at all", () => {
    expect(repairLegacyThumbnail("https://cdn.test/not-a-derived-path.jpg", PID)).toBeNull();
    expect(repairLegacyThumbnail("", PID)).toBeNull();
  });

  it("is null when the id or revision shape doesn't match", () => {
    expect(
      repairLegacyThumbnail(`/media/profiles/${PID}/media/short/clean.${REV}.jpg`, PID),
    ).toBeNull();
    expect(
      repairLegacyThumbnail(`/media/profiles/${PID}/media/${MID}/clean.NOTHEX1234.jpg`, PID),
    ).toBeNull();
  });

  it("is null when the URL's own pid names a different cat than the one it was read from", () => {
    expect(
      repairLegacyThumbnail(
        `https://storage.googleapis.com/some-bucket/profiles/${OTHER_PID}/media/${MID}/clean.${REV}.jpg`,
        PID,
      ),
    ).toBeNull();
  });
});

describe("metadataOf thumbnail", () => {
  it("stamps thumbnail-media as {mid}/{rev}, never a URL", () => {
    const metadata = metadataOf({
      name: "Charlotte",
      line: "",
      thumbnail: { mid: MID, rev: REV },
      updatedAt: "2026-09-10T10:00:00.000Z",
    });
    expect(metadata[META_THUMBNAIL_MEDIA]).toBe(`${MID}/${REV}`);
    expect(metadata[LEGACY_META_THUMBNAIL_URL]).toBeUndefined();
  });

  it("leaves thumbnail-media out entirely when there is no thumbnail", () => {
    const metadata = metadataOf({
      name: "Charlotte",
      line: "",
      thumbnail: null,
      updatedAt: "2026-09-10T10:00:00.000Z",
    });
    expect(META_THUMBNAIL_MEDIA in metadata).toBe(false);
  });

  it("rejects a malformed id or revision before it ever reaches storage", () => {
    expect(() =>
      metadataOf({
        name: "Charlotte",
        line: "",
        thumbnail: { mid: "not-an-id", rev: REV },
        updatedAt: "2026-09-10T10:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("rowsOf thumbnail resolution", () => {
  const base = { [META_NAME]: "Charlotte", [META_UPDATED_AT]: "2026-09-10T10:00:00.000Z" };

  it("prefers thumbnail-media over a legacy thumbnail-url when both are somehow present", () => {
    const rows = rowsOf([
      {
        name: `profiles/${PID}/draft.json`,
        metadata: {
          ...base,
          [META_THUMBNAIL_MEDIA]: `${MID}/${REV}`,
          [LEGACY_META_THUMBNAIL_URL]: "https://cdn.test/stale.jpg",
        },
      },
    ]);
    expect(rows[0]?.thumbnail).toEqual({ mid: MID, rev: REV });
  });

  it("falls back to repairing thumbnail-url when there is no thumbnail-media", () => {
    const rows = rowsOf([
      {
        name: `profiles/${PID}/draft.json`,
        metadata: {
          ...base,
          [LEGACY_META_THUMBNAIL_URL]: `/media/profiles/${PID}/media/${MID}/clean.${REV}.jpg`,
        },
      },
    ]);
    expect(rows[0]?.thumbnail).toEqual({ mid: MID, rev: REV });
  });

  it("lists null, not a crash, for a thumbnail-media value that fails to parse", () => {
    const rows = rowsOf([
      {
        name: `profiles/${PID}/draft.json`,
        metadata: { ...base, [META_THUMBNAIL_MEDIA]: "garbage" },
      },
    ]);
    expect(rows[0]?.thumbnail).toBeNull();
  });

  it("lists null with neither key present", () => {
    const rows = rowsOf([{ name: `profiles/${PID}/draft.json`, metadata: { ...base } }]);
    expect(rows[0]?.thumbnail).toBeNull();
  });

  it("lists null for a legacy thumbnail-url that names a different cat's media", () => {
    const rows = rowsOf([
      {
        name: `profiles/${PID}/draft.json`,
        metadata: {
          ...base,
          [LEGACY_META_THUMBNAIL_URL]: `/media/profiles/${OTHER_PID}/media/${MID}/clean.${REV}.jpg`,
        },
      },
    ]);
    expect(rows[0]?.thumbnail).toBeNull();
  });
});

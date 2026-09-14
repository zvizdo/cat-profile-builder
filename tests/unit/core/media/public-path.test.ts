import { describe, expect, it } from "vitest";
import { derivedName } from "@/core/media/paths";
import { MEDIA_ROUTE, parsePublicMediaPath, PUBLIC_MEDIA_PATH } from "@/core/media/public-path";

// The one grammar a root-relative public media URL follows (ADR-015 layout served by this
// app under `STORE=fs`): `/media/` plus a derived name. The schema, the fs store and the
// `/media` route all read it from here.

const PID = "kx3f7q2m";
const MID = "media2ax";
const REV = "a1b2c3d4e5";

describe("PUBLIC_MEDIA_PATH", () => {
  it("accepts /media/ plus every derived name the layout can produce", () => {
    for (const kind of ["clean", "web", "poster"] as const) {
      expect(PUBLIC_MEDIA_PATH.test(`${MEDIA_ROUTE}/${derivedName(PID, MID, kind, REV)}`)).toBe(
        true,
      );
    }
  });

  it("rejects anything outside the grammar", () => {
    for (const bad of [
      `/media/profiles/${PID}/media/${MID}/clean.${REV}.png`,
      `/media/profiles/${PID}/media/${MID}/web.${REV}.jpg`,
      `/media/profiles/${PID}/media/${MID}/original`,
      `/media/profiles/${PID}/media/${MID}/../${MID}/clean.${REV}.jpg`,
      `/media/profiles/${PID}/draft.json`,
      `media/profiles/${PID}/media/${MID}/clean.${REV}.jpg`,
      `/other/profiles/${PID}/media/${MID}/clean.${REV}.jpg`,
      `/media/profiles/${PID}/media/${MID}/clean.${REV}.jpg?x=1`,
      `/media/profiles/KX3F7Q2M/media/${MID}/clean.${REV}.jpg`,
    ]) {
      expect(PUBLIC_MEDIA_PATH.test(bad), bad).toBe(false);
    }
  });
});

describe("parsePublicMediaPath", () => {
  it("splits a path in the grammar into its four ids", () => {
    expect(parsePublicMediaPath(`/media/${derivedName(PID, MID, "poster", REV)}`)).toEqual({
      pid: PID,
      mid: MID,
      kind: "poster",
      rev: REV,
    });
    expect(parsePublicMediaPath(`/media/${derivedName(PID, MID, "web", REV)}`)).toEqual({
      pid: PID,
      mid: MID,
      kind: "web",
      rev: REV,
    });
  });

  it("is null for anything else", () => {
    expect(parsePublicMediaPath(`/media/profiles/${PID}/media/${MID}/clean.${REV}.mp4`)).toBeNull();
    expect(parsePublicMediaPath("")).toBeNull();
  });
});

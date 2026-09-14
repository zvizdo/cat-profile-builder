import { describe, expect, it } from "vitest";
import { ProfileInvalidError } from "@/core/errors";
import {
  derivedName,
  documentName,
  objectName,
  profilePrefix,
  publicUrl,
} from "@/core/media/paths";

const PID = "kx3f7q2m";
const MID = "media2ax";
const REV = "a1b2c3d4e5";

/** Every path the module can build, for the rules that hold across all of them. */
function everyName(pid: string, mid: string, rev: string): string[] {
  return [
    profilePrefix(pid),
    documentName(pid, "draft"),
    documentName(pid, "published"),
    documentName(pid, "archived"),
    objectName(pid, mid, "asset"),
    objectName(pid, mid, "original"),
    derivedName(pid, mid, "clean", rev),
    derivedName(pid, mid, "web", rev),
    derivedName(pid, mid, "poster", rev),
  ];
}

describe("object names (ADR-015 layout)", () => {
  it("builds the private document names", () => {
    expect(profilePrefix(PID)).toBe("profiles/kx3f7q2m/");
    expect(documentName(PID, "draft")).toBe("profiles/kx3f7q2m/draft.json");
    expect(documentName(PID, "published")).toBe("profiles/kx3f7q2m/published.json");
    expect(documentName(PID, "archived")).toBe("profiles/kx3f7q2m/archived.json");
  });

  it("builds the private media record and original names", () => {
    expect(objectName(PID, MID, "asset")).toBe("profiles/kx3f7q2m/media/media2ax/asset.json");
    expect(objectName(PID, MID, "original")).toBe("profiles/kx3f7q2m/media/media2ax/original");
  });

  it("builds the public derived names with the revision in the file name", () => {
    expect(derivedName(PID, MID, "clean", REV)).toBe(
      "profiles/kx3f7q2m/media/media2ax/clean.a1b2c3d4e5.jpg",
    );
    expect(derivedName(PID, MID, "web", REV)).toBe(
      "profiles/kx3f7q2m/media/media2ax/web.a1b2c3d4e5.mp4",
    );
    expect(derivedName(PID, MID, "poster", REV)).toBe(
      "profiles/kx3f7q2m/media/media2ax/poster.a1b2c3d4e5.jpg",
    );
  });

  it("every name starts with profiles/{pid}/ and contains no ..", () => {
    for (const name of everyName(PID, MID, REV)) {
      expect(name.startsWith(`profiles/${PID}/`)).toBe(true);
      expect(name).not.toContain("..");
      expect(name).not.toContain("//");
    }
  });
});

describe("id validation (a path can never leave the profile's folder)", () => {
  const badIds = ["../x", "kx3f7q2m/..", "KX3F7Q2M", "kx3f7q2", "", "kx3f7q2m/"];

  it("rejects a bad profile id in every builder", () => {
    for (const pid of badIds) {
      expect(() => profilePrefix(pid)).toThrow(ProfileInvalidError);
      expect(() => documentName(pid, "draft")).toThrow(ProfileInvalidError);
      expect(() => objectName(pid, MID, "asset")).toThrow(ProfileInvalidError);
      expect(() => derivedName(pid, MID, "clean", REV)).toThrow(ProfileInvalidError);
    }
  });

  it("rejects a bad media id in every builder that takes one", () => {
    for (const mid of badIds) {
      expect(() => objectName(PID, mid, "original")).toThrow(ProfileInvalidError);
      expect(() => derivedName(PID, mid, "web", REV)).toThrow(ProfileInvalidError);
    }
  });

  it("rejects a bad revision", () => {
    for (const rev of ["../x", "a1b2c3d4e", "a1b2c3d4e5f", "A1B2C3D4E5", ""]) {
      expect(() => derivedName(PID, MID, "poster", rev)).toThrow(ProfileInvalidError);
    }
  });
});

describe("publicUrl", () => {
  it("joins a base and a name with exactly one slash", () => {
    const name = derivedName(PID, MID, "clean", REV);
    const expected = `https://storage.googleapis.com/bucket/${name}`;
    expect(publicUrl("https://storage.googleapis.com/bucket", name)).toBe(expected);
    expect(publicUrl("https://storage.googleapis.com/bucket/", name)).toBe(expected);
    expect(publicUrl("https://storage.googleapis.com/bucket//", name)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { ProfileInvalidError } from "@/core/errors";
import { CURRENT_ASSET_SCHEMA_VERSION, loadAsset, migrateAsset } from "@/core/media/migrations";
import { photoAsset, videoAsset, without } from "./builders";

describe("migrateAsset", () => {
  it("is the identity at the current version", () => {
    const asset = videoAsset();
    expect(CURRENT_ASSET_SCHEMA_VERSION).toBe(1);
    expect(migrateAsset(asset)).toBe(asset);
  });

  it("rejects a record newer than this app", () => {
    expect(() => migrateAsset({ ...photoAsset(), schemaVersion: 2 })).toThrow(ProfileInvalidError);
    expect(() => migrateAsset({ ...photoAsset(), schemaVersion: 2 })).toThrow("newer");
  });

  it("rejects a record with no schemaVersion instead of assuming one", () => {
    expect(() => migrateAsset(without(photoAsset(), "schemaVersion"))).toThrow(ProfileInvalidError);
    expect(() => migrateAsset(without(photoAsset(), "schemaVersion"))).toThrow("schemaVersion");
  });

  it("rejects a schemaVersion that is not a number, and input that is not an object", () => {
    expect(() => migrateAsset({ ...photoAsset(), schemaVersion: "1" })).toThrow(
      ProfileInvalidError,
    );
    expect(() => migrateAsset(null)).toThrow(ProfileInvalidError);
    expect(() => migrateAsset("{}")).toThrow(ProfileInvalidError);
  });
});

describe("loadAsset", () => {
  it("migrates then parses a valid record", () => {
    const asset = photoAsset();
    expect(loadAsset(JSON.parse(JSON.stringify(asset)))).toEqual(asset);
  });

  it("throws ProfileInvalidError naming the issue path", () => {
    let caught: unknown;
    try {
      loadAsset({ ...videoAsset(), trim: { start: 2, end: 30 } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProfileInvalidError);
    if (!(caught instanceof ProfileInvalidError)) throw new Error("unreachable");
    expect(caught.message).toBe("Invalid data at trim");
    expect(caught.code).toBe("invalid");
  });

  it("passes the 'newer' error through", () => {
    expect(() => loadAsset({ ...photoAsset(), schemaVersion: 2 })).toThrow("newer than this app");
  });
});

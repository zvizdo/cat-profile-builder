import { describe, expect, it } from "vitest";
import { parsePublicPath, publicAddress, publicPath, slugify } from "@/core/profile/slug";

describe("slugify", () => {
  it("lowercases and drops apostrophes: Charlotte O'Neil → charlotte-oneil", () => {
    expect(slugify("Charlotte O'Neil")).toBe("charlotte-oneil");
  });

  it("drops a curly apostrophe too", () => {
    expect(slugify("Charlotte O’Neil")).toBe("charlotte-oneil");
  });

  it("turns runs of anything else into one hyphen and trims the ends", () => {
    expect(slugify("  Mr. Whiskers & Co!  ")).toBe("mr-whiskers-co");
    expect(slugify("--tabby--")).toBe("tabby");
  });

  it("keeps digits", () => {
    expect(slugify("Cat 2 the sequel")).toBe("cat-2-the-sequel");
  });

  it("strips accents to their base letters", () => {
    expect(slugify("Zoë Åström")).toBe("zoe-astrom");
  });

  it("cuts to 40 characters without leaving a trailing hyphen", () => {
    const long = "a".repeat(39) + " " + "b".repeat(10);
    expect(slugify(long)).toBe("a".repeat(39));
    expect(slugify("x".repeat(50))).toBe("x".repeat(40));
  });

  it("falls back to 'cat' when nothing usable is left", () => {
    expect(slugify("")).toBe("cat");
    expect(slugify("   ")).toBe("cat");
    expect(slugify("'''")).toBe("cat");
    expect(slugify("猫")).toBe("cat");
  });
});

describe("parsePublicPath", () => {
  it("splits a slug and its trailing id", () => {
    expect(parsePublicPath("charlotte-ab23cd45")).toEqual({ slug: "charlotte", id: "ab23cd45" });
  });

  it("keeps hyphens inside the slug and takes only the last part as the id", () => {
    expect(parsePublicPath("charlotte-oneil-kx3f7q2m")).toEqual({
      slug: "charlotte-oneil",
      id: "kx3f7q2m",
    });
  });

  it("takes the trailing id even when the slug looks like an id", () => {
    expect(parsePublicPath("abcdefgh-kx3f7q2m")).toEqual({ slug: "abcdefgh", id: "kx3f7q2m" });
  });

  it("accepts a bare id with an empty slug (trailing-id-only lookup)", () => {
    expect(parsePublicPath("kx3f7q2m")).toEqual({ slug: "", id: "kx3f7q2m" });
  });

  it("rejects an id outside the profile-id alphabet ([a-z2-7], no 0, 1, 8, 9)", () => {
    expect(parsePublicPath("charlotte-ab12cd34")).toBeNull();
    expect(parsePublicPath("charlotte-ab89cdef")).toBeNull();
  });

  it("rejects an id of the wrong length", () => {
    expect(parsePublicPath("charlotte-kx3f7q2")).toBeNull();
    expect(parsePublicPath("charlotte-kx3f7q2mm")).toBeNull();
  });

  it("rejects uppercase, a leading hyphen, an empty slug before the hyphen and stray characters", () => {
    expect(parsePublicPath("Charlotte-kx3f7q2m")).toBeNull();
    expect(parsePublicPath("-kx3f7q2m")).toBeNull();
    expect(parsePublicPath("char lotte-kx3f7q2m")).toBeNull();
    expect(parsePublicPath("charlotte_kx3f7q2m")).toBeNull();
    expect(parsePublicPath("")).toBeNull();
  });
});

describe("publicPath and publicAddress", () => {
  it("build /cats/{slug}-{id}, the address on a base with or without a trailing slash", () => {
    expect(publicPath("charlotte", "kx3f7q2m")).toBe("/cats/charlotte-kx3f7q2m");
    expect(publicAddress("https://cats.example.org", "charlotte", "kx3f7q2m")).toBe(
      "https://cats.example.org/cats/charlotte-kx3f7q2m",
    );
    expect(publicAddress("https://cats.example.org/", "charlotte", "kx3f7q2m")).toBe(
      "https://cats.example.org/cats/charlotte-kx3f7q2m",
    );
  });
});

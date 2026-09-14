import { describe, expect, it } from "vitest";
import { displayLine } from "@/core/profile/display-line";
import { bio, document, hero, needs } from "./builders";

describe("displayLine", () => {
  it("is the tagline when there is one", () => {
    expect(displayLine(document({ tagline: "Small, loud, loving.", blocks: [bio("Hi.")] }))).toBe(
      "Small, loud, loving.",
    );
  });

  it("trims the tagline", () => {
    expect(displayLine(document({ tagline: "  Small, loud.  " }))).toBe("Small, loud.");
  });

  it("falls back to the first sentence of the first bio when the tagline is missing or blank", () => {
    const blocks = [hero(), bio("Charlotte purrs at kettles. She is three.")];
    expect(displayLine(document({ blocks }))).toBe("Charlotte purrs at kettles.");
    expect(displayLine(document({ tagline: "   ", blocks }))).toBe("Charlotte purrs at kettles.");
  });

  it("uses the first bio, not a later one", () => {
    const later = { ...bio("Later bio."), id: "blockaaaaaaz" };
    expect(displayLine(document({ blocks: [bio("First bio."), later] }))).toBe("First bio.");
  });

  it("is empty with no tagline and no bio, or an empty bio", () => {
    expect(displayLine(document({ blocks: [hero(), needs()] }))).toBe("");
    expect(displayLine(document({ blocks: [hero(), bio()] }))).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { sectionStrings } from "@/ui/profile/strings";

// The public page's section words (CONTENT.md → Public profile) follow the cat's sex:
// Charlotte's strings are the register; a male or unrecorded cat gets the same sentences
// with the right pronoun, never "she" by default.

describe("sectionStrings", () => {
  it("uses she/her for a female cat, as CONTENT.md writes them", () => {
    expect(sectionStrings("female")).toEqual({
      who: "Who she is",
      day: "A day in her life",
      navDay: "Her day",
      needs: "What she needs in a home",
    });
  });

  it("uses he/his for a male cat", () => {
    expect(sectionStrings("male")).toEqual({
      who: "Who he is",
      day: "A day in his life",
      navDay: "His day",
      needs: "What he needs in a home",
    });
  });

  it("uses they/their when the sex is unknown or not recorded", () => {
    const expected = {
      who: "Who they are",
      day: "A day in their life",
      navDay: "Their day",
      needs: "What they need in a home",
    };
    expect(sectionStrings("unknown")).toEqual(expected);
    expect(sectionStrings(undefined)).toEqual(expected);
  });
});

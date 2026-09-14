import { describe, expect, it } from "vitest";
import { capitalize, needsPhrase, pronouns, sectionStrings } from "@/core/profile/pronouns";

// F41: the one pronoun table every gendered sentence in the app reads from — the public
// page's section words, the publish/unpublish/archive sentences and the builder's own
// copy (a bio's kicker, a needs card's placeholder, the quote's placeholder, a day or
// needs section's own name). "unknown" and unset both fall to "they".

describe("pronouns", () => {
  it("gives she/her/her for female", () => {
    expect(pronouns("female")).toEqual({
      subject: "she",
      object: "her",
      possessive: "her",
      is: "She's",
      leaves: "leaves",
      needs: "needs",
    });
  });

  it("gives he/him/his for male", () => {
    expect(pronouns("male")).toEqual({
      subject: "he",
      object: "him",
      possessive: "his",
      is: "He's",
      leaves: "leaves",
      needs: "needs",
    });
  });

  it.each([undefined, "unknown"] as const)("gives they/them/their for %s", (sex) => {
    expect(pronouns(sex)).toEqual({
      subject: "they",
      object: "them",
      possessive: "their",
      is: "They're",
      leaves: "leave",
      needs: "need",
    });
  });
});

describe("capitalize", () => {
  it("upper-cases only the first letter", () => {
    expect(capitalize("her")).toBe("Her");
    expect(capitalize("")).toBe("");
  });
});

describe("sectionStrings", () => {
  it("follows the recorded sex for who/day/navDay/needs", () => {
    expect(sectionStrings("female")).toEqual({
      who: "Who she is",
      day: "A day in her life",
      navDay: "Her day",
      needs: "What she needs in a home",
    });
    expect(sectionStrings("male")).toEqual({
      who: "Who he is",
      day: "A day in his life",
      navDay: "His day",
      needs: "What he needs in a home",
    });
  });

  it.each([undefined, "unknown"] as const)("falls to they/their for %s", (sex) => {
    expect(sectionStrings(sex)).toEqual({
      who: "Who they are",
      day: "A day in their life",
      navDay: "Their day",
      needs: "What they need in a home",
    });
  });
});

describe("needsPhrase", () => {
  it("is the section's own phrase, without sectionStrings' trailing 'in a home'", () => {
    expect(needsPhrase("female")).toBe("What she needs");
    expect(needsPhrase("male")).toBe("What he needs");
    expect(needsPhrase(undefined)).toBe("What they need");
    expect(needsPhrase("unknown")).toBe("What they need");
  });
});

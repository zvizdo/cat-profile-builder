import { describe, expect, it } from "vitest";
import { pickerDescription, PICKER_BODY, PICKER_TITLE } from "@/ui/builder/section-picker-content";

// F2: the section picker's copy. Four of the seven descriptions carry the cat's own
// pronoun (`publish-strings.ts`'s convention: she / he / they, unknown falling to they),
// the other three never change.

describe("pickerDescription", () => {
  it("has no pronoun for photo, gallery and video", () => {
    expect(pickerDescription("photo", "female")).toBe("One photo with an optional caption.");
    expect(pickerDescription("gallery", undefined)).toBe("Up to twelve photos in a grid.");
    expect(pickerDescription("video", "male")).toBe("One silent clip, up to 15 seconds.");
  });

  it("follows the recorded sex for bio, day, needs and quote", () => {
    expect(pickerDescription("bio", "female")).toBe("A few paragraphs about who she is.");
    expect(pickerDescription("bio", "male")).toBe("A few paragraphs about who he is.");
    expect(pickerDescription("day", "male")).toBe("Three photos and captions — a day in his life.");
    expect(pickerDescription("needs", "female")).toBe(
      "One to three cards: what she needs in a home.",
    );
    expect(pickerDescription("quote", "female")).toBe("One line from her foster, over a photo.");
  });

  it("falls to a neutral, grammatical they when the sex is unknown or unrecorded", () => {
    expect(pickerDescription("bio", "unknown")).toBe("A few paragraphs about who they are.");
    expect(pickerDescription("bio", undefined)).toBe("A few paragraphs about who they are.");
    expect(pickerDescription("needs", "unknown")).toBe(
      "One to three cards: what they need in a home.",
    );
    expect(pickerDescription("quote", undefined)).toBe("One line from their foster, over a photo.");
  });
});

describe("the picker's title and body", () => {
  it("match the brief exactly", () => {
    expect(PICKER_TITLE).toBe("Add a section");
    expect(PICKER_BODY).toBe("Pick what comes next on the page.");
  });
});

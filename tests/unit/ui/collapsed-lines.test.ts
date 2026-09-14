import { describe, expect, it } from "vitest";
import { factsLine, themeLine } from "@/ui/builder/phone/collapsed-lines";

// The phone's two collapsed groups (design 2026-09-13 §2; CONTENT.md → Builder, Collapsed
// facts / theme): one line each, reading the cat and the theme back in the mono reading
// voice — a named cat with its age and sex, a brand-new cat with the gaps written as
// questions, and the theme as its preset with both readings to two places.

describe("factsLine", () => {
  it("reads the name, age and sex back with middle dots", () => {
    expect(factsLine({ name: "Vini", age: "2 years", sex: "male" })).toBe("Vini · 2 years · male");
  });

  it("names a nameless cat Unnamed cat and writes each missing fact as a question", () => {
    expect(factsLine({ name: "", age: undefined, sex: undefined })).toBe(
      "Unnamed cat · age? · sex?",
    );
    expect(factsLine({ name: "Mabel", age: "" })).toBe("Mabel · age? · sex?");
  });

  it("reads an unknown sex as the word the field shows", () => {
    expect(factsLine({ name: "Mabel", age: "3 years", sex: "unknown" })).toBe(
      "Mabel · 3 years · unknown",
    );
  });
});

describe("themeLine", () => {
  it("reads the preset's name and both sliders to two places", () => {
    expect(themeLine({ preset: "paper", warmth: 0.5, contrast: 0.6 })).toBe(
      "Paper · warmth 0.50 · contrast 0.60",
    );
    expect(themeLine({ preset: "night", warmth: 0, contrast: 1 })).toBe(
      "Night · warmth 0.00 · contrast 1.00",
    );
  });
});

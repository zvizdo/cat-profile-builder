import { describe, expect, it } from "vitest";
import {
  archiveQuestion,
  contrastQuestion,
  liveSentence,
  unpublishedSentence,
  unpublishQuestion,
} from "@/ui/builder/publish-strings";

// The publishing sentences (CONTENT.md → Toasts `Published`, `Unpublished`; Modals
// `Unpublish`; the archive and contrast questions in the same voice), with the cat's
// pronoun following the recorded sex: she, he, or they.

describe("toasts", () => {
  it("says where the cat is live, without the scheme, and that she is back to draft", () => {
    expect(liveSentence("Charlotte", "https://southcountycats.org/cats/charlotte-kx3f7q2m")).toBe(
      "Charlotte is live at southcountycats.org/cats/charlotte-kx3f7q2m.",
    );
    expect(unpublishedSentence("Charlotte", "female")).toBe(
      "Charlotte is back to draft. She's off the site and off the carousel.",
    );
    expect(unpublishedSentence("Milo", "male")).toBe(
      "Milo is back to draft. He's off the site and off the carousel.",
    );
    expect(unpublishedSentence("Pip", undefined)).toBe(
      "Pip is back to draft. They're off the site and off the carousel.",
    );
  });
});

describe("questions", () => {
  it("asks before unpublishing, in CONTENT.md's words", () => {
    expect(unpublishQuestion("Charlotte", "female")).toEqual({
      title: "Take Charlotte off the site?",
      body: "Her page stops working and she leaves the event carousel. Everything you wrote is kept as a draft.",
      keep: "Keep her live",
      go: "Move to draft",
    });
    expect(unpublishQuestion("Milo", "male")).toMatchObject({
      body: "His page stops working and he leaves the event carousel. Everything you wrote is kept as a draft.",
      keep: "Keep him live",
    });
    expect(unpublishQuestion("Pip", "unknown")).toMatchObject({
      body: "Their page stops working and they leave the event carousel. Everything you wrote is kept as a draft.",
      keep: "Keep them live",
    });
  });

  it("asks before archiving, and names the unnamed cat as such", () => {
    expect(archiveQuestion("Charlotte", "female")).toEqual({
      title: "Archive Charlotte?",
      body: "Her page comes down and she leaves the carousel. Everything is kept exactly as it was.",
      keep: "Keep her live",
      go: "Archive",
    });
    expect(unpublishQuestion("", "female").title).toBe("Take this unnamed cat off the site?");
  });

  it("names what fails contrast and the floor, without repeating the title", () => {
    expect(contrastQuestion({ preset: "sand", warmth: 0.5, contrast: 0 })).toEqual({
      title: "The text may be hard to read.",
      body: "Sand at this contrast is 3.0:1; the floor is 4.5:1.",
    });
  });

  it("asks an archived cat's unpublish as a move back to draft, keeping the archive as the safe answer", () => {
    expect(unpublishQuestion("Charlotte", "female", "archived")).toEqual({
      title: "Take Charlotte off the site?",
      body: "She's archived now; this makes her a plain draft again.",
      keep: "Keep her archived",
      go: "Move to draft",
    });
    expect(unpublishQuestion("Pip", undefined, "archived").body).toBe(
      "They're archived now; this makes them a plain draft again.",
    );
  });
});

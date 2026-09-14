import { describe, expect, it } from "vitest";
import { type MediaAsset } from "@/core/media/schema";
import { checkReadiness, readinessSummary, readinessTargets } from "@/core/profile/readiness";
import { type Block, type ProfileDocument } from "@/core/profile/schema";
import { photoAsset, videoAsset } from "../media/builders";
import { bio, day, document, gallery, hero, needs, photo, quote, video } from "./builders";

const PHOTO = photoAsset({ id: "media2aa", fileName: "charlotte-window.jpg" });
const PHOTO_B = photoAsset({ id: "media2ab", fileName: "charlotte-nap.jpg" });
const PHOTO_C = photoAsset({ id: "media2ac", fileName: "charlotte-sun.jpg" });
const VIDEO = videoAsset({ id: "video2aa", fileName: "rain-day.mov" });
const LIBRARY: MediaAsset[] = [PHOTO, PHOTO_B, PHOTO_C, VIDEO];

const READY = document({
  age: "3 years",
  sex: "female",
  blocks: [hero(), bio("She purrs at the kettle."), photo(), gallery(), video(), quote()],
});

function problems(doc: ProfileDocument, assets: MediaAsset[] = LIBRARY): string[] {
  return checkReadiness(doc, assets).problems;
}

/** A document with `age` and `sex` already set, so a test can focus on its own blocks. */
function withBlocks(...blocks: Block[]): ProfileDocument {
  return document({ age: "3 years", sex: "female", blocks });
}

describe("checkReadiness on a ready profile", () => {
  it("returns no problems and no warnings", () => {
    expect(checkReadiness(READY, LIBRARY)).toEqual({ problems: [], warnings: [] });
  });
});

describe("profile-level problems", () => {
  it("wants a name", () => {
    expect(problems(document({ ...READY, name: "" }))).toEqual(["Give the cat a name."]);
    expect(problems(document({ ...READY, name: "   " }))).toEqual(["Give the cat a name."]);
  });

  it("lists the name before the age and the sex", () => {
    expect(
      problems(document({ name: "", age: undefined, sex: undefined, blocks: [hero()] })),
    ).toEqual(["Give the cat a name.", "Add their age.", "Say whether the cat is female or male."]);
  });
});

describe("age and sex (F1: mandatory to publish)", () => {
  it("wants an age, in the recorded sex's pronoun", () => {
    expect(problems(document({ age: undefined, sex: "female", blocks: [hero()] }))).toEqual([
      "Add her age.",
    ]);
    expect(problems(document({ age: undefined, sex: "male", blocks: [hero()] }))).toEqual([
      "Add his age.",
    ]);
    expect(problems(document({ age: undefined, sex: "unknown", blocks: [hero()] }))).toEqual([
      "Add their age.",
      "Say whether the cat is female or male.",
    ]);
    expect(problems(document({ age: undefined, blocks: [hero()] }))).toEqual([
      "Add their age.",
      "Say whether the cat is female or male.",
    ]);
    expect(problems(document({ age: "   ", sex: "female", blocks: [hero()] }))).toEqual([
      "Add her age.",
    ]);
  });

  it("wants a definite sex — female or male; 'unknown' and unset both count as missing", () => {
    expect(problems(document({ age: "3 years", sex: undefined, blocks: [hero()] }))).toEqual([
      "Say whether the cat is female or male.",
    ]);
    expect(problems(document({ age: "3 years", sex: "unknown", blocks: [hero()] }))).toEqual([
      "Say whether the cat is female or male.",
    ]);
    expect(problems(document({ age: "3 years", sex: "female", blocks: [hero()] }))).toEqual([]);
    expect(problems(document({ age: "3 years", sex: "male", blocks: [hero()] }))).toEqual([]);
  });

  it("lists age, then sex, then the hero's own problems", () => {
    const doc = document({ age: undefined, sex: undefined, blocks: [hero(null)] });
    expect(problems(doc)).toEqual([
      "Add their age.",
      "Say whether the cat is female or male.",
      "The hero has no photo.",
    ]);
  });
});

describe("empty sections (FR-060)", () => {
  it("names an empty hero, photo, video and quote", () => {
    expect(problems(withBlocks(hero(null), photo(null), video(null), quote(null)))).toEqual([
      "The hero has no photo.",
      "The photo section has no photo.",
      "The video section has no clip.",
      "The quote has no photo.",
    ]);
  });

  it("names an empty bio, including one that is only whitespace", () => {
    expect(problems(withBlocks(bio()))).toEqual(["The bio is empty."]);
    expect(problems(withBlocks(bio("   ")))).toEqual(["The bio is empty."]);
  });

  it("names an empty gallery", () => {
    expect(problems(withBlocks(gallery([])))).toEqual(["The gallery has no photos."]);
  });

  it("names each day scene that lacks a photo or a caption, numbered from 1", () => {
    expect(problems(withBlocks(day()))).toEqual([
      "Scene 2 of 'A day in her life' needs a photo and a caption.",
      "Scene 3 of 'A day in her life' needs a photo and a caption.",
    ]);
    const filled = day([
      { mediaId: "media2aa", caption: "Morning." },
      { mediaId: "media2ab", caption: "Noon." },
      { mediaId: "media2ac", caption: "   " },
    ]);
    expect(problems(withBlocks(filled))).toEqual([
      "Scene 3 of 'A day in her life' needs a photo and a caption.",
    ]);
  });

  it("names each needs card with no text, numbered from 1", () => {
    const cards = needs([
      { title: "Quiet", text: "No dogs." },
      { title: "Food", text: "" },
      { title: "", text: "  " },
    ]);
    expect(problems(withBlocks(cards))).toEqual([
      "Card 2 of 'What she needs' is empty.",
      "Card 3 of 'What she needs' is empty.",
    ]);
  });

  it("does not complain about a quote with text but no attribution", () => {
    expect(problems(withBlocks(quote("media2ac", "Purrs.")))).toEqual([]);
  });

  it("names the day scene and needs card sentences in the cat's recorded sex — F41", () => {
    const male = document({
      age: "3 years",
      sex: "male",
      blocks: [hero(), day(), needs([{ title: "Food", text: "" }])],
    });
    expect(problems(male)).toEqual([
      "Scene 2 of 'A day in his life' needs a photo and a caption.",
      "Scene 3 of 'A day in his life' needs a photo and a caption.",
      "Card 1 of 'What he needs' is empty.",
    ]);
    const unset = document({
      age: "3 years",
      sex: undefined,
      blocks: [hero(), day(), needs([{ title: "Food", text: "" }])],
    });
    expect(problems(unset)).toEqual([
      "Say whether the cat is female or male.",
      "Scene 2 of 'A day in their life' needs a photo and a caption.",
      "Scene 3 of 'A day in their life' needs a photo and a caption.",
      "Card 1 of 'What they need' is empty.",
    ]);
  });
});

describe("media problems", () => {
  it("reports a media id that is not in the library, once", () => {
    expect(problems(withBlocks(hero("unknown2"), photo("unknown3")))).toEqual([
      "A photo or clip is missing from the library.",
    ]);
  });

  it("asks for a description, naming the file (FR-074)", () => {
    const assets = [{ ...PHOTO, alt: null }, PHOTO_B, PHOTO_C, VIDEO];
    expect(problems(READY, assets)).toEqual(["Write a description for charlotte-window.jpg."]);
  });

  it("names a file that is still processing", () => {
    const assets = [PHOTO, PHOTO_B, PHOTO_C, { ...VIDEO, status: "processing" as const }];
    expect(problems(READY, assets)).toEqual(["rain-day.mov is still processing."]);
  });

  it("asks for a trim when a video needs one", () => {
    const untrimmed: MediaAsset = { ...VIDEO, status: "needs-trim" };
    delete untrimmed.trim;
    expect(problems(READY, [PHOTO, PHOTO_B, PHOTO_C, untrimmed])).toEqual([
      "Trim rain-day.mov to 15 seconds or less.",
    ]);
  });
});

describe("media kind, order and repeats", () => {
  it("says when a video section holds a photo", () => {
    expect(problems(withBlocks(video("media2aa")))).toEqual([
      "charlotte-window.jpg is a photo, but the video section needs a clip.",
    ]);
  });

  it("says when a photo slot holds a clip", () => {
    expect(problems(withBlocks(hero("video2aa"), gallery(["video2aa"])))).toEqual([
      "rain-day.mov is a clip, but this section needs a photo.",
    ]);
  });

  it("checks gallery and day-scene media too", () => {
    const assets = [PHOTO, { ...PHOTO_B, alt: null }, PHOTO_C, VIDEO];
    const scenes = day([
      { mediaId: "media2aa", caption: "Morning." },
      { mediaId: "media2ab", caption: "Noon." },
      { mediaId: "media2ac", caption: "Night." },
    ]);
    expect(problems(withBlocks(gallery(["media2ab"])), assets)).toEqual([
      "Write a description for charlotte-nap.jpg.",
    ]);
    expect(problems(withBlocks(scenes), assets)).toEqual([
      "Write a description for charlotte-nap.jpg.",
    ]);
  });

  it("lists every problem of one asset and never repeats one across blocks", () => {
    const assets = [{ ...PHOTO, alt: null, status: "processing" as const }, PHOTO_B, PHOTO_C];
    expect(problems(withBlocks(hero("media2aa"), photo("media2aa")), assets)).toEqual([
      "charlotte-window.jpg is still processing.",
      "Write a description for charlotte-window.jpg.",
    ]);
  });

  it("keeps document order: profile, then blocks in order", () => {
    const assets = [{ ...PHOTO, alt: null }, PHOTO_B, PHOTO_C, VIDEO];
    const doc = document({
      name: "",
      age: "3 years",
      sex: "female",
      blocks: [bio(), hero("media2aa"), video(null)],
    });
    expect(problems(doc, assets)).toEqual([
      "Give the cat a name.",
      "The bio is empty.",
      "Write a description for charlotte-window.jpg.",
      "The video section has no clip.",
    ]);
  });
});

describe("warnings", () => {
  const PRESET_NAMES = ["paper", "card", "night", "sand"] as const;

  it("warns, but does not block, when the theme's text contrast is under 4.5:1", () => {
    const theme = { preset: "sand" as const, warmth: 0.5, contrast: 0 };
    expect(checkReadiness(document({ ...READY, theme }), LIBRARY)).toEqual({
      problems: [],
      warnings: ["The text may be hard to read on this background."],
    });
  });

  it("warns for every preset at contrast 0", () => {
    for (const preset of PRESET_NAMES) {
      const theme = { preset, warmth: 0.5, contrast: 0 };
      expect(checkReadiness(document({ ...READY, theme }), LIBRARY).warnings).toHaveLength(1);
    }
  });

  it("does not warn for any preset at the defaults, at full contrast or at either end of warmth", () => {
    for (const preset of PRESET_NAMES) {
      for (const [warmth, contrast] of [
        [0.5, 0.5],
        [0.5, 1],
        [0, 0.5],
        [1, 0.5],
      ] as const) {
        const theme = { preset, warmth, contrast };
        expect(checkReadiness(document({ ...READY, theme }), LIBRARY).warnings).toEqual([]);
      }
    }
  });
});

describe("readinessTargets", () => {
  it("points age and sex at the facts fields", () => {
    const doc = document({ age: undefined, sex: undefined, blocks: [hero()] });
    expect(readinessTargets(doc, LIBRARY).problems).toEqual([
      { message: "Add their age.", target: { kind: "facts", field: "age" } },
      {
        message: "Say whether the cat is female or male.",
        target: { kind: "facts", field: "sex" },
      },
    ]);
  });

  it("names where each problem lives: the name, the sections, or one block", () => {
    const assets = [{ ...PHOTO, alt: null }, PHOTO_B, PHOTO_C, VIDEO];
    const heroBlock = hero("media2aa");
    const emptyVideo = video(null);
    const doc = document({
      name: "",
      age: "3 years",
      sex: "female",
      blocks: [bio(), heroBlock, emptyVideo],
    });
    const bioBlock = doc.blocks[0];
    expect(readinessTargets(doc, assets)).toEqual({
      problems: [
        { message: "Give the cat a name.", target: { kind: "name" } },
        { message: "The bio is empty.", target: { kind: "block", blockId: bioBlock?.id } },
        {
          message: "Write a description for charlotte-window.jpg.",
          target: { kind: "block", blockId: heroBlock.id },
        },
        {
          message: "The video section has no clip.",
          target: { kind: "block", blockId: emptyVideo.id },
        },
      ],
      warnings: [],
    });
  });

  it("points a sentence two blocks would both raise at the first of them", () => {
    const assets = [{ ...PHOTO, alt: null }, PHOTO_B, PHOTO_C];
    const first = hero("media2aa");
    const second = photo("media2aa");
    expect(readinessTargets(withBlocks(first, second), assets).problems).toEqual([
      {
        message: "Write a description for charlotte-window.jpg.",
        target: { kind: "block", blockId: first.id },
      },
    ]);
  });

  it("agrees with checkReadiness sentence for sentence", () => {
    const assets = [{ ...PHOTO, status: "processing" as const }, PHOTO_B, PHOTO_C];
    const doc = document({ name: " ", blocks: [hero("media2aa"), gallery([]), video(null)] });
    expect(readinessTargets(doc, assets).problems.map((p) => p.message)).toEqual(
      checkReadiness(doc, assets).problems,
    );
  });
});

describe("readinessSummary", () => {
  it("is the CONTENT.md sentence: a count in words, then what is missing", () => {
    expect(readinessSummary(["Give the cat a name."])).toBe(
      "One thing missing: Give the cat a name.",
    );
    expect(readinessSummary(["Give the cat a name.", "The bio is empty."])).toBe(
      "Two things missing: Give the cat a name. The bio is empty.",
    );
    expect(readinessSummary(Array.from({ length: 13 }, (_, i) => `P${i}.`))).toMatch(
      /^13 things missing: P0\. P1\./,
    );
  });
});

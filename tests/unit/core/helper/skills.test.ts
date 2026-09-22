import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSkill, loadSkillCatalogue } from "@/core/helper/skills";
import { AddBlockOperationSchema, BlockInputSchema } from "@/core/profile/operations";

const SKILLS_DIR = join(process.cwd(), "src/core/helper/skills");

// The skill catalogue is checked-in project text (helper-protocol.md → Skills): a Markdown
// file per skill, `name` and `description` front matter, a body the model follows. This is
// the one file in `src/core/helper` allowed to touch the filesystem.

const EXPECTED_NAMES = ["build-profile", "write-bio", "pick-theme", "tidy-order"];

describe("loadSkillCatalogue", () => {
  it("loads exactly the four skills, each with valid front matter", () => {
    const skills = loadSkillCatalogue();
    expect(skills.map((skill) => skill.name).sort()).toEqual([...EXPECTED_NAMES].sort());
    for (const skill of skills) {
      expect(skill.name.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.body.length).toBeGreaterThan(0);
      // The front matter block itself never leaks into the body a model reads.
      expect(skill.body).not.toContain("---");
    }
  });

  it("returns build-profile's own one-line description, read from its front matter", () => {
    const skill = loadSkillCatalogue().find((candidate) => candidate.name === "build-profile");
    const source = readFileSync(join(SKILLS_DIR, "build-profile.md"), "utf8");
    const line = source.split("\n").find((candidate) => candidate.startsWith("description: "));
    expect(skill?.description).toBe(line?.slice("description: ".length));
    expect(skill?.description).not.toBe("");
  });

  describe("a malformed skill file", () => {
    const badFile = join(SKILLS_DIR, "_zzz-broken.md");

    afterEach(() => {
      rmSync(badFile, { force: true });
    });

    it("throws when a file has no front matter", () => {
      writeFileSync(badFile, "Just a paragraph, no front matter at all.\n");
      expect(() => loadSkillCatalogue()).toThrow(
        'Skill file "_zzz-broken.md" has no front matter.',
      );
    });

    it("throws when front matter is missing name or description", () => {
      writeFileSync(badFile, "---\nname: broken\n---\nA body with no description.\n");
      expect(() => loadSkillCatalogue()).toThrow(
        'Skill file "_zzz-broken.md" is missing "name" or "description".',
      );
    });
  });
});

// F52 (SC-013, the 2026-09-13 acceptance run): the build's first model step is the hero
// fill with no read before it, and every `add_block` shape the skill shows the model is
// one the operation schema accepts — the six refused calls per build were all `add_block`
// (`kind` for `type`, a `caption` on a gallery, a quote with no `mediaId`).
describe("build-profile (F52)", () => {
  function body(): string {
    const skill = getSkill("build-profile");
    if ("error" in skill) throw new Error(skill.error);
    return skill.body;
  }

  /** Every fenced ```json block in the skill, parsed. */
  function jsonExamples(): unknown[] {
    const fences = [...body().matchAll(/```json\n([\s\S]*?)\n```/g)];
    return fences.map((match) => JSON.parse(match[1] ?? ""));
  }

  it("opens the build with the hero fill and says there is no read before it", () => {
    const text = body();
    expect(text).toContain("no read first");
    expect(text).not.toContain("`read_outline` told you which");
  });

  it("shows one worked add_block example per addable block type, each accepted by AddBlockOperationSchema", () => {
    const examples = jsonExamples();
    const types = new Set<string>();
    for (const example of examples) {
      const parsed = AddBlockOperationSchema.safeParse(example);
      expect(parsed.success, JSON.stringify(example)).toBe(true);
      if (parsed.success) types.add(parsed.data.block.type);
    }
    const addable = BlockInputSchema.options
      .map((option) => option.shape.type.value)
      .filter((type) => type !== "hero");
    expect([...types].sort()).toEqual([...addable].sort());
  });

  it("names the shape traps the model fell into: a gallery has no caption, and the key is type", () => {
    const text = body();
    expect(text).toContain("a gallery has no caption");
    expect(text).toContain("`type`");
  });

  // The live phone build of 2026-09-13 15:34 UTC: a card mid-build on a tagline the
  // volunteer had typed by hand, and a clip in the library that never made it onto the page.
  it("leaves a tagline the volunteer already typed, like a filled name, age or sex", () => {
    const text = body();
    expect(text).toContain("if the volunteer typed a tagline, leave it");
  });

  it("puts a clip that is on hand onto the page", () => {
    expect(body()).toContain("A clip on hand belongs on the page");
  });
});

// F65 (docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-design.md): a
// standalone bio request looks at the page and photos first and asks one to three
// questions only when it lacks material; the build interview's questions come from what
// the helper saw. The skill text is the whole implementation, so its key rules are pinned.
// Every pinned phrase sits on one line of the Markdown source: `getSkill` does not
// normalise whitespace, so a phrase broken across lines would not match.
describe("write-bio asks when it needs to (F65)", () => {
  function body(): string {
    const skill = getSkill("write-bio");
    if ("error" in skill) throw new Error(skill.error);
    return skill.body;
  }

  it("looks at the page and the photos before deciding anything, in as few steps as it can", () => {
    const text = body();
    expect(text).toContain("## Before you write: look, then ask only if you need to");
    for (const step of ["`read_page`", "`list_media`", "`view_photos`"]) {
      expect(text).toContain(step);
    }
    expect(text).toContain("in the same step");
  });

  it("states the 'enough' bar: two things she does and one fact about the home she'd suit", () => {
    const text = body();
    expect(text).toContain("at least two concrete things she does");
    expect(text).toContain("at least one fact about the home she'd suit");
    expect(text).toContain("write straight away");
  });

  it("asks one to three questions, one per message, each pointing to what it saw", () => {
    const text = body();
    expect(text).toContain("one to three questions");
    expect(text).toContain("one per message");
    expect(text).toContain("point to something specific you saw");
  });

  it("does not look again on an answer, and takes 'I don't know' as settled", () => {
    const text = body();
    expect(text).toContain("don't look again");
    expect(text).toContain('"I don\'t know" settles that gap');
  });

  it("never writes a photo guess as fact, and stops asking on 'just write it'", () => {
    const text = body();
    expect(text).toContain("is a guess, and you must never write a guess from a photo as fact");
    expect(text).toContain("just write it");
  });

  it("asks nothing for a rewrite or a shortening, or inside a build", () => {
    const text = body();
    expect(text).toContain("**A request to rewrite or shorten**");
    expect(text).toContain("**Inside `build-profile`.**");
    expect(text).toContain("The build's own interview has already happened");
  });

  // Final review, Important 1: the source rules sat inside the section a build and a
  // rewrite skip, and the round-2 build bio invented "Between naps". They now have a
  // heading of their own, after the skippable one, that says it holds for every bio.
  it("keeps the source rules outside the skippable section, for every bio including a build", () => {
    const text = body();
    const skippable = text.indexOf("## Before you write");
    const sources = text.indexOf("## Every sentence has a source");
    expect(skippable).toBeGreaterThanOrEqual(0);
    expect(sources).toBeGreaterThan(skippable);
    expect(text.indexOf("check each sentence against its source")).toBeGreaterThan(sources);
    expect(text.indexOf("**Photos show; they don't prove.**")).toBeGreaterThan(sources);
    const section = text.slice(sources, text.indexOf("\n## ", sources + 1));
    expect(section).toContain("inside `build-profile`");
    expect(section).toContain("even when you skipped the section above");
  });
});

describe("build-profile asks from what it saw (F65)", () => {
  function body(): string {
    const skill = getSkill("build-profile");
    if ("error" in skill) throw new Error(skill.error);
    return skill.body;
  }

  it("builds its questions from what it noticed, the bank only as a fallback", () => {
    const text = body();
    expect(text).toContain("note to yourself");
    expect(text).toContain("only as a fallback");
    expect(text).toContain("point to something specific you saw");
    expect(text).toContain("Before any interview question");
    expect(text).not.toContain("Before any question from the bank below");
  });

  it("never assumes a photo guess into the page", () => {
    expect(body()).toContain("is a guess, and you must never write a guess from a photo as fact");
  });

  it("keeps the five-to-ten interview and the proposal gate", () => {
    const text = body();
    expect(text).toContain("Ask five to ten questions, **one at a time**");
    expect(text).toContain('"Want me to build this now?"');
  });
});

describe("getSkill", () => {
  it("returns the named skill in full", () => {
    const skill = getSkill("write-bio");
    expect(skill).not.toHaveProperty("error");
    expect("body" in skill && skill.body.length).toBeGreaterThan(0);
  });

  it("returns a plain-language error for an unknown skill", () => {
    expect(getSkill("nope")).toEqual({ error: 'There is no skill named "nope".' });
  });
});

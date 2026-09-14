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

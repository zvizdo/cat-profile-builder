import { describe, expect, it } from "vitest";
import { systemPrompt } from "@/core/helper/prompt";

// The system prompt (helper-protocol.md → Capabilities at a glance, "The system prompt is
// short"): what the helper is and is not, the skill catalogue by name and description, and
// the read-first / re-read-after-write instruction.

const SKILLS = [
  { name: "build-profile", description: "help me build the page" },
  { name: "write-bio", description: "write a bio" },
];

describe("systemPrompt", () => {
  it("says the helper cannot publish, unpublish, archive, restore, share or delete", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt).toContain("publish");
    expect(prompt).toContain("unpublish");
    expect(prompt).toContain("archive");
    expect(prompt).toContain("restore");
    expect(prompt).toContain("share");
    expect(prompt).toContain("delete");
  });

  it("says the helper cannot upload, trim, set a focal point, edit a description or enhance", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt).toContain("upload");
    expect(prompt).toContain("trim");
    expect(prompt).toContain("focal point");
    expect(prompt).toContain("description");
    expect(prompt).toContain("enhance");
  });

  it("lists exactly the given skills' names and descriptions", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt).toContain("build-profile");
    expect(prompt).toContain("help me build the page");
    expect(prompt).toContain("write-bio");
    expect(prompt).toContain("write a bio");
  });

  it("says plainly when it has no skills loaded", () => {
    const prompt = systemPrompt({ surface: "full", skills: [] });
    expect(prompt).toContain("You have no skills loaded right now.");
  });

  it("does not name a skill it was not given", () => {
    const prompt = systemPrompt({ surface: "full", skills: [SKILLS[0]!] });
    expect(prompt).not.toContain("write-bio");
  });

  it("instructs reading the outline first, loading a matching skill, reading before editing text, and re-reading after", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt.toLowerCase()).toContain("read");
    expect(prompt).toContain("outline");
    expect(prompt.toLowerCase()).toContain("skill");
    expect(prompt.toLowerCase()).toContain("re-read");
  });

  // F52 (SC-013): the build turn opened with a lone `read_outline` — a whole model round
  // trip before the hero fill — because the rule said "every request". A request that
  // carries on a skill the model already loaded and read the outline for (the yes after
  // the proposal) starts with the first change, and a loaded skill is never loaded twice.
  it("starts a continued skill — the yes after a proposal — with the first change, not a read, and never reloads a skill (F52)", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt).not.toContain("Begin every request");
    expect(prompt).toContain("yes to a proposal");
    expect(prompt).toContain("not another read");
    expect(prompt).toContain("don't load it again");
  });

  // F45 (design 2026-09-13 §6): the phone is a layout hint — the volunteer edits by
  // hand there too, so the old "make any structural change yourself" is gone.
  it("adds the phone sentence only on the phone surface: a layout hint, never a licence to restructure", () => {
    const full = systemPrompt({ surface: "full", skills: SKILLS });
    const phone = systemPrompt({ surface: "phone", skills: SKILLS });
    expect(full.toLowerCase()).not.toContain("phone");
    expect(phone).toContain("The volunteer is on a phone; keep replies short.");
    expect(phone).not.toContain("cannot edit");
    expect(phone).not.toContain("structural");
    expect(phone.length).toBeGreaterThan(full.length);
  });

  it("says block and media ids are for tool calls only, and to name a section instead (F21)", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt.toLowerCase()).toContain("id");
    expect(prompt).toContain("tool calls");
    expect(prompt).toContain("the second gallery");
    expect(prompt).toContain("the bio");
    expect(prompt.toLowerCase()).toContain("path");
    expect(prompt).toContain("scenes.2.caption");
    expect(prompt.toLowerCase()).toContain("tool name");
  });

  it("names itself CATalyst and says so if asked", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt).toContain("CATalyst");
    expect(prompt).toContain("If asked your name, say CATalyst.");
  });

  it("uses no emoji", () => {
    const prompt = systemPrompt({ surface: "phone", skills: SKILLS });
    expect(prompt).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
  });

  it("says which Markdown a reply may use, and which it may not (F31)", () => {
    const prompt = systemPrompt({ surface: "full", skills: SKILLS });
    expect(prompt.toLowerCase()).toContain("markdown");
    expect(prompt).toContain("**bold**");
    expect(prompt).toContain("*italic*");
    expect(prompt.toLowerCase()).toContain("bulleted");
    expect(prompt.toLowerCase()).toContain("numbered");
    expect(prompt.toLowerCase()).toContain("heading");
    expect(prompt.toLowerCase()).toContain("link");
    expect(prompt.toLowerCase()).toContain("mailto");
    expect(prompt.toLowerCase()).toContain("no tables");
    expect(prompt.toLowerCase()).toContain("no images");
    expect(prompt.toLowerCase()).toContain("no raw html");
  });
});

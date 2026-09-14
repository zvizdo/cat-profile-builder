// The one shared shape for a skill (helper-protocol.md → Skills), pulled out so `tools.ts`
// and `prompt.ts` can use it without importing `skills.ts` (controller ruling, T032:
// `skills.ts` is the only file under `src/core/helper` that touches the filesystem — the
// other two take skill data as plain parameters instead). This file is types only: no
// import, no `node:fs`, nothing to run.

/** A skill in full: its name and description (from front matter) and the body it follows. */
export interface Skill {
  name: string;
  description: string;
  body: string;
}

/** What a caller needs to name a skill and say when it applies — no body. */
export type SkillSummary = Pick<Skill, "name" | "description">;

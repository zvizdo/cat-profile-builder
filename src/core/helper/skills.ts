import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Skill } from "./skill-shape";

// The helper's skill catalogue (helper-protocol.md → Skills): checked-in project text, one
// Markdown file per skill under `src/core/helper/skills/`, front matter (`name`,
// `description`) plus a body the model follows verbatim. Skills are trusted instructions,
// never volunteer content, so a hand-rolled parser is enough — no dependency, no YAML
// library. This is the only file under `src/core/helper` that touches the filesystem
// (`tools.ts` and `prompt.ts` import only the `Skill`/`SkillSummary` types from
// `skill-shape.ts` and take the actual data as plain parameters instead), so it is also the
// only one that needs `process.cwd()` to find its own directory.

export { type Skill } from "./skill-shape";

const SKILLS_DIR = join(process.cwd(), "src/core/helper/skills");
const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function readField(frontMatter: string, field: "name" | "description"): string | undefined {
  const pattern = new RegExp(`^${field}:\\s*(.+)$`, "m");
  return pattern.exec(frontMatter)?.[1]?.trim();
}

function parseSkill(raw: string, fileName: string): Skill {
  const match = FRONT_MATTER.exec(raw);
  if (!match) throw new Error(`Skill file "${fileName}" has no front matter.`);
  const [, frontMatter = "", rest = ""] = match;
  const name = readField(frontMatter, "name");
  const description = readField(frontMatter, "description");
  if (!name || !description) {
    throw new Error(`Skill file "${fileName}" is missing "name" or "description".`);
  }
  return { name, description, body: rest.trim() };
}

/**
 * Every skill in `src/core/helper/skills/*.md`, parsed from disk. Read fresh each call —
 * the catalogue is small and this keeps a locally-edited skill visible without a restart.
 */
export function loadSkillCatalogue(): Skill[] {
  const files = readdirSync(SKILLS_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort();
  return files.map((file) => parseSkill(readFileSync(join(SKILLS_DIR, file), "utf8"), file));
}

/**
 * The skill named `name`, or a plain-language error when the catalogue has none by that
 * name (helper-protocol.md → `load_skill`: "Never a card", so this is text the model reads,
 * not an exception).
 */
export function getSkill(name: string): Skill | { error: string } {
  const skill = loadSkillCatalogue().find((candidate) => candidate.name === name);
  return skill ?? { error: `There is no skill named "${name}".` };
}

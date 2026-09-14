import { type SkillSummary } from "./skill-shape";

// The AI helper's system prompt (helper-protocol.md → Capabilities at a glance: "The system
// prompt is short"). It never imports `skills.ts` — only the `SkillSummary` type from
// `skill-shape.ts` (types only, no filesystem access) — so the skill catalogue arrives as
// plain data, the same shape `loadSkillCatalogue()` returns, and this file stays a pure
// function of its arguments, unit-testable with no filesystem. Written in the shelter's
// voice (references/design/CONTENT.md): plain, specific, sentence case, no emoji.

export interface SystemPromptOptions {
  /** Which builder surface the volunteer is on (helper-protocol.md → Endpoint). */
  surface: "full" | "phone";
  /** The skill catalogue, in the order it should be listed. */
  skills: readonly SkillSummary[];
}

const CANNOT_DO = [
  "You cannot publish, unpublish, archive, restore, share, or delete anything on this page.",
  "Say so plainly if you're asked to do one of those.",
  "You also cannot upload a photo or clip, trim a clip, set a focal point, edit a photo's",
  "description, or enhance a photo — the volunteer does those by hand.",
].join(" ");

const NO_IDS = [
  "Block ids and media ids exist only for tool calls — you may use them there, but never in",
  "anything you write to the volunteer.",
  'In text, name a section by its type and place ("the second gallery", "the bio") or by a',
  "few words of its content.",
  'Never print an id, a path like "scenes.2.caption", or a tool name where the volunteer',
  "will read it.",
].join(" ");

const MARKDOWN_ALLOWED = [
  "Write replies in plain Markdown: paragraphs, **bold**, *italic*, bulleted and numbered",
  "lists, short headings, and a link to a URL (http, https or mailto only).",
  "No tables, no images, no raw HTML, and no code blocks unless you are quoting text",
  "exactly.",
].join(" ");

/** F52 (SC-013): "begin every request by reading the outline" cost the build its first
 * model round trip — a lone `read_outline` before the hero fill. A request that carries on
 * a skill the model already loaded and read the outline for (the yes after a proposal)
 * starts with the first change, and a loaded skill is never loaded twice: its text is
 * already in the conversation. */
const READ_FIRST = [
  "Begin a request by reading the outline — unless you are carrying on a skill you loaded",
  "earlier in this conversation and have already read the outline for. Then start with the",
  "work itself, not another read: the volunteer's yes to a proposal is the moment to make",
  "the first change.",
  "When a request matches one of your skills, load it and follow it — once. A skill you",
  "loaded earlier in this conversation is still in front of you, so don't load it again.",
  "Read a block before you change its text.",
  "After you make a change, re-read what you changed to check your own work.",
].join(" ");

/** F45 (design 2026-09-13 §6): the phone is a layout hint and nothing more — the
 * volunteer edits every section by hand there too, so the old licence to "make any
 * structural change yourself" is gone. */
const PHONE_SENTENCE = "The volunteer is on a phone; keep replies short.";

function skillLines(skills: readonly SkillSummary[]): string {
  if (skills.length === 0) return "You have no skills loaded right now.";
  const lines = skills.map((skill) => `- ${skill.name}: ${skill.description}`);
  return ["Your skills — written procedures to load and follow for a bigger job:", ...lines].join(
    "\n",
  );
}

/**
 * The helper's system prompt: what it is and is not, its skill catalogue by name and
 * description, and the read-first / re-read-after-write instruction (helper-protocol.md).
 * On `surface: "phone"` it adds the one layout hint: keep replies short (FR-091, as
 * rewritten 2026-09-13; the phone builder edits by hand like the full one).
 */
export function systemPrompt({ surface, skills }: SystemPromptOptions): string {
  const paragraphs = [
    "You are CATalyst, the AI assistant inside a cat adoption profile builder. You read and " +
      "edit this cat's page using the tools you are given, the same way the volunteer's own " +
      "controls do. If asked your name, say CATalyst.",
    CANNOT_DO,
    NO_IDS,
    MARKDOWN_ALLOWED,
    skillLines(skills),
    READ_FIRST,
  ];
  if (surface === "phone") paragraphs.push(PHONE_SENTENCE);
  return paragraphs.join("\n\n");
}

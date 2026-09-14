import type { ProfileState } from "@/core/ports";
import { pronouns } from "@/core/profile/pronouns";
import type { ProfileDocument, Theme } from "@/core/profile/schema";
import { worstContrast } from "@/core/profile/theme";
import { displayName } from "./display-name";

// The publishing sentences (CONTENT.md → Toasts, Modals, Publish validation). CONTENT.md
// writes them for Charlotte; here they follow the cat's recorded sex — she, he, or they —
// the same way the public page's section words do. Nothing else about a cat is assumed.
// F41: `pronouns` moved to `src/core/profile/pronouns.ts`, the one pronoun table this
// module, the public page's section words and the builder's own copy all read from.

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The name as a sentence names it: the name, or `this unnamed cat`. */
function named(name: string): string {
  return name.trim() === "" ? "this unnamed cat" : name;
}

/** `Charlotte is live at southcountycats.org/cats/charlotte-kx3f7q2m.` — the scheme left off, as a person reads an address. */
export function liveSentence(name: string, url: string): string {
  return `${displayName(name)} is live at ${url.replace(/^https?:\/\//, "")}.`;
}

/** `Charlotte is back to draft. She's off the site and off the carousel.` */
export function unpublishedSentence(name: string, sex: ProfileDocument["sex"]): string {
  return `${displayName(name)} is back to draft. ${pronouns(sex).is} off the site and off the carousel.`;
}

/** A question in the modal's shape: the serif title, one paragraph, the safe button and the other. */
export interface Question {
  title: string;
  body: string;
  keep: string;
  go: string;
}

/**
 * CONTENT.md → Modals `Unpublish`. An archived cat has no page to stop, so its body says
 * what the move is — back to a plain draft — and the safe answer keeps the archive.
 */
export function unpublishQuestion(
  name: string,
  sex: ProfileDocument["sex"],
  state: ProfileState = "live",
): Question {
  const p = pronouns(sex);
  if (state === "archived") {
    return {
      title: `Take ${named(name)} off the site?`,
      body: `${p.is} archived now; this makes ${p.object} a plain draft again.`,
      keep: `Keep ${p.object} archived`,
      go: "Move to draft",
    };
  }
  return {
    title: `Take ${named(name)} off the site?`,
    body: `${capital(p.possessive)} page stops working and ${p.subject} ${p.leaves} the event carousel. Everything you wrote is kept as a draft.`,
    keep: `Keep ${p.object} live`,
    go: "Move to draft",
  };
}

/** The archive question, in the unpublish question's voice (FR-086: nothing is deleted). */
export function archiveQuestion(name: string, sex: ProfileDocument["sex"]): Question {
  const p = pronouns(sex);
  return {
    title: `Archive ${named(name)}?`,
    body: `${capital(p.possessive)} page comes down and ${p.subject} ${p.leaves} the carousel. Everything is kept exactly as it was.`,
    keep: `Keep ${p.object} live`,
    go: "Archive",
  };
}

/**
 * The contrast warning before publishing (FR-031): the title carries the readiness
 * sentence's meaning, the body only the specifics — the preset at this contrast against
 * the 4.5:1 floor — so the volunteer knows what `Restore to passing` puts right.
 */
export function contrastQuestion(theme: Theme): Pick<Question, "title" | "body"> {
  const ratio = worstContrast(theme).toFixed(1);
  return {
    title: "The text may be hard to read.",
    body: `${capital(theme.preset)} at this contrast is ${ratio}:1; the floor is 4.5:1.`,
  };
}

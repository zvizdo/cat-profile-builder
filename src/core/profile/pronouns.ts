import type { ProfileDocument } from "./schema";

// F41: the one pronoun table every gendered sentence in this app reads from. A cat's
// recorded sex is "female", "male", "unknown" or unset (schema.ts); every sentence here
// treats "unknown" and unset the same way — they/them/their — since neither is a pronoun
// to use. `src/ui/profile/strings.ts` (the public page's section words) and
// `src/ui/builder/publish-strings.ts` (the publish/unpublish/archive sentences) both used
// to keep their own copy of this table; they now import it from here, so the public page,
// the publish flow and the builder's own copy (the bio's kicker, a needs card's
// placeholder, the quote's placeholder, a removed or added section's name) can never
// disagree about a cat's pronoun.

/** The pronoun set one cat's sentences use. */
export interface Pronouns {
  subject: string;
  object: string;
  possessive: string;
  /** `She's` / `He's` / `They're`, sentence-initial. */
  is: string;
  /** Third-person present of `leave`: `leaves` / `leave`. */
  leaves: string;
  /** Third-person present of `need`: `needs` / `need`. */
  needs: string;
}

const SHE: Pronouns = {
  subject: "she",
  object: "her",
  possessive: "her",
  is: "She's",
  leaves: "leaves",
  needs: "needs",
};
const HE: Pronouns = {
  subject: "he",
  object: "him",
  possessive: "his",
  is: "He's",
  leaves: "leaves",
  needs: "needs",
};
const THEY: Pronouns = {
  subject: "they",
  object: "them",
  possessive: "their",
  is: "They're",
  leaves: "leave",
  needs: "need",
};

/** The pronouns for a recorded sex; unknown or unrecorded is `they`. */
export function pronouns(sex: ProfileDocument["sex"]): Pronouns {
  if (sex === "female") return SHE;
  if (sex === "male") return HE;
  return THEY;
}

/** `word`, capitalised — for a pronoun starting a sentence (`Her page…`, `Their day`). */
export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The gendered section kickers and the nav word for the day section. */
export interface SectionStrings {
  who: string;
  day: string;
  navDay: string;
  needs: string;
}

const FEMALE: SectionStrings = {
  who: "Who she is",
  day: "A day in her life",
  navDay: "Her day",
  needs: "What she needs in a home",
};

const MALE: SectionStrings = {
  who: "Who he is",
  day: "A day in his life",
  navDay: "His day",
  needs: "What he needs in a home",
};

const NEUTRAL: SectionStrings = {
  who: "Who they are",
  day: "A day in their life",
  navDay: "Their day",
  needs: "What they need in a home",
};

/** The section strings for a cat's recorded sex: she, he, or they when unknown or absent. */
export function sectionStrings(sex: ProfileDocument["sex"]): SectionStrings {
  if (sex === "female") return FEMALE;
  if (sex === "male") return MALE;
  return NEUTRAL;
}

/**
 * `What she needs` / `What he needs` / `What they need` — the phrase quoted in the day and
 * needs sections' own labels (`sectionLabel`, `fieldLabel` in `fields.ts`) and in the
 * readiness sentences, without `sectionStrings`' trailing "in a home" (the public page's
 * heading, not a name for the section itself).
 */
export function needsPhrase(sex: ProfileDocument["sex"]): string {
  const p = pronouns(sex);
  return `What ${p.subject} ${p.needs}`;
}

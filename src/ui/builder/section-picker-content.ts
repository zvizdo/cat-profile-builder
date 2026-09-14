import type { Block, ProfileDocument } from "@/core/profile/schema";

// The section picker's copy (F2; CONTENT.md → Modals voice): the title and body are fixed,
// but four of the seven descriptions name the cat's pronoun — the same "she / he / they"
// the publishing sentences use (`publish-strings.ts`), unknown falling to `they`.

/** `aria-labelledby` and the one plain sentence under it. */
export const PICKER_TITLE = "Add a section";
export const PICKER_BODY = "Pick what comes next on the page.";

type Sex = NonNullable<ProfileDocument["sex"]>;

const BIO: Readonly<Record<Sex, string>> = {
  female: "A few paragraphs about who she is.",
  male: "A few paragraphs about who he is.",
  unknown: "A few paragraphs about who they are.",
};

const DAY: Readonly<Record<Sex, string>> = {
  female: "Three photos and captions — a day in her life.",
  male: "Three photos and captions — a day in his life.",
  unknown: "Three photos and captions — a day in their life.",
};

const NEEDS: Readonly<Record<Sex, string>> = {
  female: "One to three cards: what she needs in a home.",
  male: "One to three cards: what he needs in a home.",
  unknown: "One to three cards: what they need in a home.",
};

const QUOTE: Readonly<Record<Sex, string>> = {
  female: "One line from her foster, over a photo.",
  male: "One line from his foster, over a photo.",
  unknown: "One line from their foster, over a photo.",
};

const FIXED: Readonly<Partial<Record<Exclude<Block["type"], "hero">, string>>> = {
  photo: "One photo with an optional caption.",
  gallery: "Up to twelve photos in a grid.",
  video: "One silent clip, up to 15 seconds.",
};

/** One plain sentence about what the type holds, the cat's own pronoun where one is used. */
export function pickerDescription(
  type: Exclude<Block["type"], "hero">,
  sex: ProfileDocument["sex"],
): string {
  const pronoun = sex ?? "unknown";
  switch (type) {
    case "bio":
      return BIO[pronoun];
    case "day":
      return DAY[pronoun];
    case "needs":
      return NEEDS[pronoun];
    case "quote":
      return QUOTE[pronoun];
    default:
      return FIXED[type] ?? "";
  }
}

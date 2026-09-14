import type { ProfileDocument, Theme } from "@/core/profile/schema";
import { displayName } from "../display-name";
import { PRESET_LABEL } from "../theme-css";

// The phone's two collapsed groups read the cat and the theme back in one line each
// (design 2026-09-13 §2; CONTENT.md → Builder, Collapsed facts / theme): the words a
// volunteer glances at before deciding whether to open the fields. Pure — the group
// draws whatever these say.

/** The middle dot every reading in the builder joins its parts with. */
const DOT = " · ";

/** The three facts the collapsed line reads. */
export type FactsSummary = Pick<ProfileDocument, "name" | "age" | "sex">;

/** `Vini · 2 years · male`, or `Unnamed cat · age? · sex?` while the facts are unset. */
export function factsLine({ name, age, sex }: FactsSummary): string {
  const ageWord = age === undefined || age === "" ? "age?" : age;
  const sexWord = sex === undefined ? "sex?" : sex;
  return [displayName(name), ageWord, sexWord].join(DOT);
}

/** `Paper · warmth 0.50 · contrast 0.60` — the picker's own two-place readings. */
export function themeLine(theme: Theme): string {
  return [
    PRESET_LABEL[theme.preset],
    `warmth ${theme.warmth.toFixed(2)}`,
    `contrast ${theme.contrast.toFixed(2)}`,
  ].join(DOT);
}

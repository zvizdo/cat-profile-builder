import { firstSentence } from "./rich-text";
import { type ProfileDocument } from "./schema";

/**
 * The one line shown under a cat's name where only one fits (the hero, the list card, the
 * carousel): the tagline when the volunteer wrote one, otherwise the first sentence of the
 * first bio section, otherwise `""`. Whitespace-only counts as absent; the result is trimmed.
 */
export function displayLine(doc: ProfileDocument): string {
  const tagline = doc.tagline?.trim() ?? "";
  if (tagline !== "") return tagline;
  const bio = doc.blocks.find((block) => block.type === "bio");
  return bio === undefined ? "" : firstSentence(bio.content);
}

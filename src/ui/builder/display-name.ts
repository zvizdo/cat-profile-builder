// What the tools call a cat with no name yet, in CONTENT.md's voice. Shared by the list
// card, the delete question and the builder shell's heading.

/** The stand-in name for a cat whose `name` is still empty. */
export const UNNAMED = "Unnamed cat";

/** The name a card, a heading or a modal calls a cat by. */
export function displayName(name: string): string {
  return name === "" ? UNNAMED : name;
}

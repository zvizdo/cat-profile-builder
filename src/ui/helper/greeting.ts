import { BUILD_THE_PAGE } from "./Chips";

// The empty thread's one line (F55 item 6; CONTENT.md → Helper, Greeting): the panel is
// otherwise a blank page above the composer until the first request, which on a phone's
// Full sheet is most of the window. One sentence, in the helper's own first person, that
// says what to do — pronoun-free, since the helper has not been told the cat's sex and
// must not guess it — naming the `Build the page` chip only while that chip is drawn
// (the page is just the hero). Gone the moment anything is said.

/** The cat as the line names it: the name, or `this cat` while there is none. */
function catWord(name: string): string {
  return name.trim() === "" ? "this cat" : name.trim();
}

/**
 * `Tell me about Charlotte, or start with Build the page.` on an empty page;
 * `Tell me what to change on Charlotte's page.` once the page has sections.
 */
export function greeting(name: string, emptyPage: boolean): string {
  const cat = catWord(name);
  return emptyPage
    ? `Tell me about ${cat}, or start with ${BUILD_THE_PAGE}.`
    : `Tell me what to change on ${cat}'s page.`;
}

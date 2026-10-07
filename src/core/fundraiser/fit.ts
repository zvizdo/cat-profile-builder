// Text-fit steps for the fundraiser display: how long a piece of text is, and which type-size
// step that length falls in. The display puts the step on an element as `data-fit` and the
// stylesheet picks a size per step, so no text is measured in a browser (data-model.md).

/**
 * How many characters a person sees in `text`, counted in code points: an emoji is one, not
 * two UTF-16 units, and a letter plus a combining mark is two. This is the one place the
 * fundraiser counts text, so a limit and a fit step can never disagree about a length.
 */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * The type-size step for a text of `length` code points: the index of the first breakpoint the
 * length does not exceed (`0` is the largest type), or `breakpoints.length` when it exceeds
 * every one (the smallest). A length equal to a breakpoint still fits that step. Expects
 * `breakpoints` in increasing order, which makes the step never fall as the text grows.
 */
export function fitStep(length: number, breakpoints: readonly number[]): number {
  const index = breakpoints.findIndex((breakpoint) => length <= breakpoint);
  return index === -1 ? breakpoints.length : index;
}

/** Headline step edges, in code points: up to 24 at full size, up to 40 one step down. */
export const HEADLINE_FIT: readonly number[] = Object.freeze([24, 40]);

/** Raised and goal amount step edges, in code points of the formatted text (`$1,250,000`). */
export const AMOUNT_FIT: readonly number[] = Object.freeze([6, 8, 10, 12]);

/** Percentage tag step edges, in code points of the whole tag (`0% ($0)`, `100% ($10K)`, `999%+ ($100M)`). */
export const TAG_FIT: readonly number[] = Object.freeze([9, 11]);

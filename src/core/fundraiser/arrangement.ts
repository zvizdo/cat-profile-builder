// Which of the display's two arrangements a stage of a given size takes (display-layout.md →
// Two arrangements, one switch). The stylesheet decides it with a container query; the page
// asks it once, in script, when an editing session opens, so it can hold that answer while the
// soft keyboard resizes the stage (display-layout.md → Known risk). Pure: numbers in, a word out.

/** Which arrangement the display draws. */
export type Arrangement = "stack" | "side";

/**
 * The width-to-height ratio below which the stage is a centred stack. It is the number in the
 * stylesheet's `@container (aspect-ratio < 1.1)`, which cannot read a token, so a unit test keeps
 * the two equal. (It moved from 1 to 1.1 in T012: at 1:1 the `999%+` tag ran off the stage.)
 */
export const STACK_BELOW = 1.1;

/**
 * The arrangement for a stage `width` by `height` (any one unit), or `undefined` when the box
 * has no usable size (not laid out yet), so a caller never holds a guess.
 */
export function arrangementOf(width: number, height: number): Arrangement | undefined {
  if (!(width > 0) || !(height > 0)) return undefined;
  return width / height < STACK_BELOW ? "stack" : "side";
}

/** The narrowest ratio a held stack is allowed to be as wide as: just under {@link STACK_BELOW}. */
export const HOLD_STACK_RATIO = 1.05;
/** The widest ratio a held side-by-side box is allowed to be as tall as: just over {@link STACK_BELOW}. */
export const HOLD_SIDE_RATIO = 1.25;

/**
 * The width-to-height ratio the held box is limited to, for a stage `width` by `height` whose
 * arrangement is `held`. A held stack may be no wider than `height x ratio`, a held side by side
 * no taller than `width / ratio`. The limit is chosen so that it never bites on the stage the
 * session opened on (a stack's limit is at least that stage's own ratio, a side's at most), and
 * so that it keeps the box on the held side of {@link STACK_BELOW} whatever the stage turns into.
 */
export function heldRatio(held: Arrangement, width: number, height: number): number {
  const ratio = width / height;
  return held === "stack" ? Math.max(ratio, HOLD_STACK_RATIO) : Math.min(ratio, HOLD_SIDE_RATIO);
}

// Every sentence the fundraiser display shows or speaks, in one place so the components and
// the tests read the same words (CONTENT.md voice: plain, specific, no emoji). Core returns
// reason codes and numbers; the sentences are built here.

import type { GoalReason, HeadlineReason } from "@/core/fundraiser/fundraiser";

/** The words on the display itself. */
export const DISPLAY = {
  /** The logo's alternative text: the mark stands alone, so it says the name. */
  logoAlt: "South County Cats",
  /** The mono label above the headline (left out of the centred stack). */
  label: "Current fundraiser",
  /** The goal line reads "raised of $10,000 goal"; the amount sits between the two parts. */
  raisedOf: "raised of",
  goalWord: "goal",
  /** The pill beside the goal line once raised reaches the goal. */
  goalReached: "Goal reached",
  /** The one-line starting hint: only in the editing view, only while the address was blank. */
  hint: "Hover, tap or Tab to the thermometer to set your goal.",
} as const;

/** The Full screen control (the button's name, and what is said where it cannot work). */
export const FULLSCREEN = {
  /** The button's visible text and its accessible name. */
  button: "Full screen",
  /** Said in place of the button where the browser has no full screen, and beside it for six seconds when the browser refuses. */
  unavailable: "Full screen isn't available in this browser.",
} as const;

/** The pieces of one reading of the meter, as `describeProgress` returns them. */
export interface MeterParts {
  raised: string;
  goal: string;
  percentLabel: string;
  reached: boolean;
}

/**
 * The percentage as it is spoken. The tag prints `65%`, or `999%+` past the cap; a screen
 * reader hears "65 percent" and "more than 999 percent", the true figure never rounded up.
 */
function spokenPercent(percentLabel: string): string {
  return percentLabel.endsWith("%+")
    ? `more than ${percentLabel.slice(0, -2)} percent`
    : `${percentLabel.slice(0, -1)} percent`;
}

/** What a screen reader says for the meter: "$6,500 raised of a $10,000 goal, 65 percent". */
export function meterValuetext(parts: MeterParts): string {
  const reading = `${parts.raised} raised of a ${parts.goal} goal, ${spokenPercent(parts.percentLabel)}`;
  return parts.reached ? `${reading}, goal reached` : reading;
}

/** The editing controls' names and visible words (editing-interaction.md → Keyboard path). */
export const EDIT = {
  /** The button over the thermometer: its whole name, so the figures are spoken once, by the meter. */
  thermometerButton: "Edit the amount raised and the goal",
  /** The two in-place fields' accessible names. */
  raisedLabel: "Amount raised",
  goalLabel: "Goal",
  /** The headline field's accessible name. */
  headlineLabel: "Headline",
  /** Said as the headline button's description (its name is the headline itself, so the label is in the name). */
  headlineHint: "Edit headline",
  /** The one button that confirms, in the shared edit row. */
  done: "Done",
  /** Said in the status line when the idle minute closes a session: a draft is gone, so say so. */
  idleClosed: "Editing closed after a minute. Nothing was changed.",
} as const;

/** Why an amount was refused, in plain words (the contract's table); every code has one. */
const AMOUNT_REFUSALS: Record<GoalReason, string> = {
  empty: "Type an amount, for example 6,500.",
  "not-a-number": "That doesn't look like an amount. Use digits, like 6,500 or 6,500.50.",
  negative: "An amount can't be negative.",
  "too-precise": "Use dollars and cents only, like 6,500.50.",
  "too-large": "That's more than this page can show. The most is $99,999,999.99.",
  zero: "The goal has to be more than $0.",
};

/** Why a headline was refused, in plain words. */
const HEADLINE_REFUSALS: Record<HeadlineReason, string> = {
  empty: "The headline can't be empty.",
  "too-long": "Keep the headline to 60 characters or fewer.",
};

/** The sentence for a refused amount (`zero` only ever comes from the goal). */
export function amountRefusal(code: GoalReason): string {
  return AMOUNT_REFUSALS[code];
}

/** The sentence for a refused headline. */
export function headlineRefusal(code: HeadlineReason): string {
  return HEADLINE_REFUSALS[code];
}

/**
 * What a screen reader is told after a confirmed change, in the visually hidden status line:
 * "Updated: $7,200 raised of $10,000, 72 percent." (and ", goal reached" once it is).
 */
export function updatedStatus(parts: MeterParts): string {
  const reading = `Updated: ${parts.raised} raised of ${parts.goal}, ${spokenPercent(parts.percentLabel)}`;
  return `${reading}${parts.reached ? ", goal reached" : ""}.`;
}

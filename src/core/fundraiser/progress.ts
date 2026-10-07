// What the thermometer shows for a pair of amounts: the fill, the percentage tag, and which of
// the four paw prints are lit. Every question a person could check ("is this paw lit?", "what
// percent is that?") is answered from whole cents: the paw checks are integer comparisons, and the
// percent is the floored quotient of integer cents, so no float can light a paw early or claim
// a milestone not yet reached (data-model.md → Progress).

import { formatCompactDollars, formatDollars } from "@/core/fundraiser/money";

/** One paw print on the thermometer: where it sits, whether it is lit, and its tick label. */
export interface Milestone {
  /** The percent of the goal this paw marks. */
  at: 25 | 50 | 75 | 100;
  /** Raised has reached this paw. Decided on integers, never on `level`. */
  lit: boolean;
  /** `25%`, `50%`, `75%`, and the goal in compact dollars for the last. */
  label: string;
}

/** Everything the drawing needs, derived from the two amounts and nothing else. */
export interface Progress {
  /** The fill, 0 to 1. The only float here, and only for drawing: it is never compared. */
  level: number;
  /** The whole percent of the goal raised, rounded down. True, not capped: 120 at $12,000 of $10,000. */
  percent: number;
  /** The tag's text: `65%`, or `999%+` once `percent` passes 999. */
  percentLabel: string;
  /**
   * What the tag on the fill line prints: the percent and the raised amount in compact dollars,
   * `65% ($6.5K)`. The amount is the true raised figure, not capped at the goal.
   */
  tagLabel: string;
  /** Raised is at or above the goal. */
  reached: boolean;
  /** The four paws, in order, 25 to 100. */
  milestones: readonly [Milestone, Milestone, Milestone, Milestone];
}

/** The tag stops printing digits here, so a $0.01 goal against the largest raise stays short. */
const PERCENT_LABEL_CEILING = 999;

/** `raised` has reached `at` percent of `goal`: both sides are whole numbers, so it is exact. */
function reachedPercent(raisedCents: number, goalCents: number, at: number): boolean {
  return raisedCents * 100 >= goalCents * at;
}

/** The tag's text for a true `percent`: its digits, or `999%+` above the ceiling. */
function labelFor(percent: number): string {
  return percent > PERCENT_LABEL_CEILING ? `${PERCENT_LABEL_CEILING}%+` : `${percent}%`;
}

/**
 * The fill, tag and paws for `raisedCents` of `goalCents`. Pure. Expects whole cents and
 * `goalCents >= 1`, which the fundraiser's schema guarantees. The percent is the true share
 * rounded down, so the tag never reads a milestone whose paw is still dark.
 */
export function progress(raisedCents: number, goalCents: number): Progress {
  // Safe as a float quotient: raised x 100 stays under 2^40, so a share just under a whole
  // number cannot round up to it.
  const percent = Math.floor((raisedCents * 100) / goalCents);
  const lit = (at: number) => reachedPercent(raisedCents, goalCents, at);
  return {
    level: Math.min(1, raisedCents / goalCents),
    percent,
    percentLabel: labelFor(percent),
    tagLabel: `${labelFor(percent)} (${formatCompactDollars(raisedCents)})`,
    reached: raisedCents >= goalCents,
    milestones: [
      { at: 25, lit: lit(25), label: "25%" },
      { at: 50, lit: lit(50), label: "50%" },
      { at: 75, lit: lit(75), label: "75%" },
      { at: 100, lit: lit(100), label: formatCompactDollars(goalCents) },
    ],
  };
}

/**
 * The formatted pieces the meter's text and the "Updated..." status line are built from: the
 * full amounts through {@link formatDollars}, the tag text, and whether the goal is met. The
 * sentences themselves are the UI's, in `strings.ts`.
 */
export function describeProgress(
  raisedCents: number,
  goalCents: number,
): { raised: string; goal: string; percentLabel: string; reached: boolean } {
  const { percentLabel, reached } = progress(raisedCents, goalCents);
  return {
    raised: formatDollars(raisedCents),
    goal: formatDollars(goalCents),
    percentLabel,
    reached,
  };
}

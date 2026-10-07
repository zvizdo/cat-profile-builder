// The fundraiser itself: its limits and defaults, the one schema that says what a valid one is,
// and the validators the in-place fields and the address reader share (data-model.md →
// Fundraiser, Validation). Every refusal is a reason code, never a sentence: the words live in
// the UI's strings, so core stays free of copy and of any framework.

import { z } from "zod";
import { codePointLength } from "@/core/fundraiser/fit";
import { parseDollars, type MoneyReason } from "@/core/fundraiser/money";
import { err, ok, type Result } from "@/core/result";

/** The longest headline, in code points, counted after normalising. */
export const HEADLINE_MAX = 60;

/** The largest amount, in cents: $99,999,999.99, under one hundred million dollars. */
export const AMOUNT_MAX_CENTS = 9_999_999_999;

/**
 * What the display shows for anything missing or refused. Frozen so no caller can change what
 * every other caller sees; it is itself a valid {@link Fundraiser}.
 */
export const DEFAULTS = Object.freeze({
  headline: "Help us reach our goal",
  raisedCents: 0,
  goalCents: 500_000,
});

/** Why a headline is refused. */
export type HeadlineReason = "empty" | "too-long";
/** Why a raised amount is refused: the money codes, nothing more (zero is allowed). */
export type RaisedReason = MoneyReason;
/** Why a goal is refused: the money codes, and `zero` because a goal must be above $0. */
export type GoalReason = MoneyReason | "zero";

// Control (Cc), format (Cf: zero-width, joiners, soft hyphen, word joiner, bidi controls) and
// the line and paragraph separators (Zl, Zp). They can reverse text, hide its neighbours or
// leave a headline that is "not empty" yet invisible (contracts/address.md → Headline).
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const WHITESPACE_RUN = /\p{White_Space}+/gu;

/**
 * Cleans headline text: removes control, format and separator characters, collapses every run
 * of whitespace to one space, trims. Never cuts: the address reader cuts an over-long headline
 * and {@link validateHeadline} refuses one, and both measure what this returns. Whitespace
 * becomes a space before the removal, so a tab, a newline or a line separator between two words
 * keeps them apart (`\p{Cc}` alone would glue `a\nb` into `ab`); the removal can then leave
 * two spaces side by side, so the collapse runs after it.
 */
export function normaliseHeadline(text: string): string {
  return text
    .replace(WHITESPACE_RUN, " ")
    .replace(INVISIBLE, "")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** Why a headline that is already normalised is refused, or `null` when it is fine. */
function headlineProblem(normalised: string): HeadlineReason | null {
  if (normalised === "") return "empty";
  return codePointLength(normalised) > HEADLINE_MAX ? "too-long" : null;
}

/** Why an amount in cents is not a valid raised amount: below 0 or above the ceiling. */
function raisedProblem(cents: number): RaisedReason | null {
  if (cents < 0) return "negative";
  return cents > AMOUNT_MAX_CENTS ? "too-large" : null;
}

/** Why an amount in cents is not a valid goal: as a raised amount, and not zero. */
function goalProblem(cents: number): GoalReason | null {
  return cents === 0 ? "zero" : raisedProblem(cents);
}

/**
 * Checks a headline a person typed: normalises it, then refuses it as `empty` when nothing is
 * left or `too-long` when it is over {@link HEADLINE_MAX} code points. It refuses and never
 * cuts, so what the volunteer sees is what is kept. Returns the normalised headline.
 */
export function validateHeadline(text: string): Result<string, HeadlineReason> {
  const normalised = normaliseHeadline(text);
  const problem = headlineProblem(normalised);
  return problem === null ? ok(normalised) : err(problem);
}

/**
 * Checks the raised amount a person typed and returns whole cents. Zero is fine, and so is an
 * amount above the goal (that is the goal-reached state), so it never looks at the goal.
 */
export function validateRaised(text: string): Result<number, RaisedReason> {
  const parsed = parseDollars(text);
  if (!parsed.ok) return parsed;
  const problem = raisedProblem(parsed.value);
  return problem === null ? parsed : err(problem);
}

/** Checks the goal a person typed and returns whole cents: above $0 and within the ceiling. */
export function validateGoal(text: string): Result<number, GoalReason> {
  const parsed = parseDollars(text);
  if (!parsed.ok) return parsed;
  const problem = goalProblem(parsed.value);
  return problem === null ? parsed : err(problem);
}

/**
 * Turns a failed {@link Result} into a Zod issue whose message is the reason code, and a
 * success into its value. Lets the text schemas reuse the validators instead of repeating them.
 */
function fromResult<T, E extends string>(
  result: Result<T, E>,
  input: string,
  ctx: z.RefinementCtx,
): T {
  if (result.ok) return result.value;
  ctx.addIssue({ code: "custom", message: result.error, input });
  return z.NEVER;
}

/** Headline text in, normalised headline out; fails with `empty` or `too-long`. */
export const headlineSchema = z
  .string({ error: "empty" })
  .transform((text, ctx) => fromResult(validateHeadline(text), text, ctx));

/** Raised-amount text in, whole cents out; fails with a {@link RaisedReason}. */
export const raisedSchema = z
  .string({ error: "not-a-number" })
  .transform((text, ctx) => fromResult(validateRaised(text), text, ctx));

/** Goal text in, whole cents out; fails with a {@link GoalReason}. */
export const goalSchema = z
  .string({ error: "not-a-number" })
  .transform((text, ctx) => fromResult(validateGoal(text), text, ctx));

/** Whole cents, already a number: a fraction or a non-number is `not-a-number`. */
const cents = z.number({ error: "not-a-number" }).int({ error: "not-a-number" });

/**
 * The one thing the page address carries, as the display holds it (cents, not text). It is the
 * only declaration of the shape: {@link Fundraiser} is inferred from it.
 */
export const fundraiserSchema = z.object({
  headline: headlineSchema,
  raisedCents: cents.check((ctx) => {
    const problem = raisedProblem(ctx.value);
    if (problem !== null) ctx.issues.push({ code: "custom", message: problem, input: ctx.value });
  }),
  goalCents: cents.check((ctx) => {
    const problem = goalProblem(ctx.value);
    if (problem !== null) ctx.issues.push({ code: "custom", message: problem, input: ctx.value });
  }),
});

/** A valid fundraiser: a normalised headline and two whole-cent amounts. */
export type Fundraiser = z.infer<typeof fundraiserSchema>;

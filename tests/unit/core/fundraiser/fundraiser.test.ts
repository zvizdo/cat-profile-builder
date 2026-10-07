import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  AMOUNT_MAX_CENTS,
  DEFAULTS,
  HEADLINE_MAX,
  fundraiserSchema,
  goalSchema,
  headlineSchema,
  normaliseHeadline,
  raisedSchema,
  validateGoal,
  validateHeadline,
  validateRaised,
  type Fundraiser,
  type GoalReason,
  type HeadlineReason,
  type RaisedReason,
} from "@/core/fundraiser/fundraiser";
import { codePointLength } from "@/core/fundraiser/fit";

// The rules of data-model.md → Validation. Every refusal is asserted with its own reason code
// (Principle II): the denial is the behaviour, and the codes are what the UI turns into words.

function headlineRefused(text: string, reason: HeadlineReason): void {
  expect(validateHeadline(text)).toEqual({ ok: false, error: reason });
}

function raisedRefused(text: string, reason: RaisedReason): void {
  expect(validateRaised(text)).toEqual({ ok: false, error: reason });
}

function goalRefused(text: string, reason: GoalReason): void {
  expect(validateGoal(text)).toEqual({ ok: false, error: reason });
}

/** The reason codes a failed parse carries, in order: schemas speak in codes, not sentences. */
function codesOf(result: { success: boolean; error?: z.ZodError }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("limits and defaults", () => {
  it("pins the numbers the spec states", () => {
    expect(HEADLINE_MAX).toBe(60);
    expect(AMOUNT_MAX_CENTS).toBe(9_999_999_999);
    expect(DEFAULTS).toEqual({
      headline: "Help us reach our goal",
      raisedCents: 0,
      goalCents: 500_000,
    });
  });

  it("holds defaults that are themselves valid", () => {
    expect(fundraiserSchema.safeParse(DEFAULTS).success).toBe(true);
  });
});

describe("normaliseHeadline", () => {
  it("leaves plain text alone", () => {
    expect(normaliseHeadline("Spring Vet Fund")).toBe("Spring Vet Fund");
  });

  it.each([
    ["a control character", "a\u0000b\u0007c\u007fd", "abcd"],
    ["a zero-width space, non-joiner and joiner", "a\u200bb\u200cc\u200dd", "abcd"],
    ["a word joiner", "a\u2060b", "ab"],
    ["a soft hyphen", "vet\u00adfund", "vetfund"],
    ["left-to-right and right-to-left marks", "a\u200eb\u200fc", "abc"],
    ["bidi embeddings and overrides", "a\u202ab\u202bc\u202cd\u202de\u202ef", "abcdef"],
    ["bidi isolates", "a\u2066b\u2067c\u2068d\u2069e", "abcde"],
    ["a byte-order mark", "\ufeffabc", "abc"],
    ["line and paragraph separators", "a\u2028b\u2029c", "a b c"],
    ["a byte-order mark inside a word (invisible, not a space)", "a\ufeffb", "ab"],
    ["a next-line character (white space, so a space)", "a\u0085b", "a b"],
  ])("removes %s", (_name, text, expected) => {
    expect(normaliseHeadline(text)).toBe(expected);
  });

  it("collapses every run of whitespace to one space and trims", () => {
    expect(normaliseHeadline("a \t\n b")).toBe("a b");
    expect(normaliseHeadline("   spring    vet\r\nfund  ")).toBe("spring vet fund");
    expect(normaliseHeadline("a\u200b \u200b b")).toBe("a b");
  });

  it("turns text made only of invisible characters into the empty string", () => {
    expect(normaliseHeadline("\u200b\u200c\u200d")).toBe("");
    expect(normaliseHeadline(" \u200b \u2060 ")).toBe("");
  });

  it("keeps an emoji whole", () => {
    expect(normaliseHeadline("Cats \u{1F431}")).toBe("Cats \u{1F431}");
  });
});

describe("validateHeadline", () => {
  it("accepts a plain headline and returns it normalised", () => {
    expect(validateHeadline("  Spring   Vet Fund ")).toEqual({
      ok: true,
      value: "Spring Vet Fund",
    });
  });

  it("refuses nothing as empty", () => {
    headlineRefused("", "empty");
    headlineRefused("   ", "empty");
  });

  it("refuses text with only zero-width characters as empty", () => {
    headlineRefused("\u200b\u200b", "empty");
  });

  it("accepts 60 code points and refuses 61", () => {
    expect(validateHeadline("a".repeat(60))).toEqual({ ok: true, value: "a".repeat(60) });
    headlineRefused("a".repeat(61), "too-long");
  });

  it("counts code points, not UTF-16 units: 60 emoji pass, 61 are refused", () => {
    const sixty = "\u{1F431}".repeat(60);
    expect(sixty.length).toBe(120);
    expect(validateHeadline(sixty)).toEqual({ ok: true, value: sixty });
    headlineRefused("\u{1F431}".repeat(61), "too-long");
  });

  it("counts after normalising, so removed characters and collapsed spaces do not count", () => {
    const padded = `${"a".repeat(60)}\u200b\u200b   `;
    expect(validateHeadline(padded)).toEqual({ ok: true, value: "a".repeat(60) });
    const spaced = `${"a".repeat(29)}${" ".repeat(10)}${"b".repeat(30)}`;
    expect(codePointLength(spaced)).toBe(69);
    expect(validateHeadline(spaced)).toEqual({
      ok: true,
      value: `${"a".repeat(29)} ${"b".repeat(30)}`,
    });
  });

  it("refuses an over-long headline and never cuts it", () => {
    const result = validateHeadline("a".repeat(100));
    expect(result).toEqual({ ok: false, error: "too-long" });
  });
});

describe("validateRaised", () => {
  it("reads a typed amount as whole cents", () => {
    expect(validateRaised("$6,500.50")).toEqual({ ok: true, value: 650_050 });
  });

  it("allows zero", () => {
    expect(validateRaised("0")).toEqual({ ok: true, value: 0 });
    expect(validateRaised("$0.00")).toEqual({ ok: true, value: 0 });
  });

  it("accepts the ceiling and refuses one dollar above it", () => {
    expect(validateRaised("$99,999,999.99")).toEqual({ ok: true, value: AMOUNT_MAX_CENTS });
    raisedRefused("$100,000,000", "too-large");
  });

  it("refuses a twelve-digit-plus amount as too large without losing the code", () => {
    raisedRefused("9999999999999", "too-large");
  });

  it.each([
    ["", "empty"],
    ["abc", "not-a-number"],
    ["-5", "negative"],
    ["1.234", "too-precise"],
  ] as const)("passes the money code through for %j", (text, reason) => {
    raisedRefused(text, reason);
  });

  it("does not know the goal, so it never complains of exceeding it", () => {
    expect(validateRaised("12000")).toEqual({ ok: true, value: 1_200_000 });
  });
});

describe("validateGoal", () => {
  it("reads a typed amount as whole cents", () => {
    expect(validateGoal("10,000")).toEqual({ ok: true, value: 1_000_000 });
    expect(validateGoal("$0.01")).toEqual({ ok: true, value: 1 });
  });

  it("refuses zero in both spellings", () => {
    goalRefused("0", "zero");
    goalRefused("0.00", "zero");
    goalRefused("$0", "zero");
  });

  it("refuses nothing as empty", () => {
    goalRefused("", "empty");
  });

  it("accepts the ceiling and refuses above it", () => {
    expect(validateGoal("$99,999,999.99")).toEqual({ ok: true, value: AMOUNT_MAX_CENTS });
    goalRefused("$100,000,000", "too-large");
  });

  it.each([
    ["abc", "not-a-number"],
    ["-5", "negative"],
    ["1.234", "too-precise"],
  ] as const)("passes the money code through for %j", (text, reason) => {
    goalRefused(text, reason);
  });
});

describe("the text schemas carry reason codes, not sentences", () => {
  it("headlineSchema: normalises on success", () => {
    expect(headlineSchema.parse(" a \u200b b ")).toBe("a b");
  });

  it("headlineSchema: fails with empty, too-long", () => {
    expect(codesOf(headlineSchema.safeParse("\u200b"))).toEqual(["empty"]);
    expect(codesOf(headlineSchema.safeParse("a".repeat(61)))).toEqual(["too-long"]);
  });

  it("headlineSchema: a missing or non-string value is empty", () => {
    expect(codesOf(headlineSchema.safeParse(undefined))).toEqual(["empty"]);
  });

  it("raisedSchema: cents on success, the money code on failure", () => {
    expect(raisedSchema.parse("$12.50")).toBe(1250);
    expect(codesOf(raisedSchema.safeParse(""))).toEqual(["empty"]);
    expect(codesOf(raisedSchema.safeParse("$100,000,000"))).toEqual(["too-large"]);
    expect(codesOf(raisedSchema.safeParse(42))).toEqual(["not-a-number"]);
  });

  it("goalSchema: adds zero", () => {
    expect(goalSchema.parse("500")).toBe(50_000);
    expect(codesOf(goalSchema.safeParse("0"))).toEqual(["zero"]);
    expect(codesOf(goalSchema.safeParse("-1"))).toEqual(["negative"]);
  });
});

describe("fundraiserSchema", () => {
  const good = { headline: "Spring Vet Fund", raisedCents: 650_000, goalCents: 1_000_000 };

  it("accepts a valid fundraiser", () => {
    expect(fundraiserSchema.parse(good)).toEqual(good);
  });

  it("accepts raised above the goal and raised of zero", () => {
    expect(fundraiserSchema.safeParse({ ...good, raisedCents: 2_000_000 }).success).toBe(true);
    expect(fundraiserSchema.safeParse({ ...good, raisedCents: 0 }).success).toBe(true);
  });

  it("refuses a bad headline, with its code", () => {
    expect(codesOf(fundraiserSchema.safeParse({ ...good, headline: "" }))).toEqual(["empty"]);
    expect(codesOf(fundraiserSchema.safeParse({ ...good, headline: "a".repeat(61) }))).toEqual([
      "too-long",
    ]);
  });

  it("refuses bad cents, with their codes", () => {
    expect(codesOf(fundraiserSchema.safeParse({ ...good, raisedCents: -1 }))).toEqual(["negative"]);
    expect(codesOf(fundraiserSchema.safeParse({ ...good, goalCents: 0 }))).toEqual(["zero"]);
    expect(codesOf(fundraiserSchema.safeParse({ ...good, goalCents: -1 }))).toEqual(["negative"]);
    expect(
      codesOf(fundraiserSchema.safeParse({ ...good, raisedCents: AMOUNT_MAX_CENTS + 1 })),
    ).toEqual(["too-large"]);
    expect(
      codesOf(fundraiserSchema.safeParse({ ...good, goalCents: AMOUNT_MAX_CENTS + 1 })),
    ).toEqual(["too-large"]);
    expect(codesOf(fundraiserSchema.safeParse({ ...good, raisedCents: 1.5 }))).toEqual([
      "not-a-number",
    ]);
    expect(codesOf(fundraiserSchema.safeParse({ ...good, goalCents: "5" }))).toEqual([
      "not-a-number",
    ]);
  });

  it("is not satisfied by a missing field", () => {
    expect(fundraiserSchema.safeParse({ headline: "x", raisedCents: 0 }).success).toBe(false);
  });
});

describe("the Fundraiser type", () => {
  it("is exactly what the schema infers, with no hand-written twin", () => {
    expectTypeOf<Fundraiser>().toEqualTypeOf<z.infer<typeof fundraiserSchema>>();
    expectTypeOf<Fundraiser>().toEqualTypeOf<{
      headline: string;
      raisedCents: number;
      goalCents: number;
    }>();
  });

  it("accepts the defaults", () => {
    const fundraiser: Fundraiser = DEFAULTS;
    expect(fundraiser.goalCents).toBe(500_000);
  });
});

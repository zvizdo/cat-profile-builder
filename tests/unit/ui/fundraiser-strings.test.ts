import { describe, expect, it } from "vitest";
import type { GoalReason, HeadlineReason } from "@/core/fundraiser/fundraiser";
import { describeProgress } from "@/core/fundraiser/progress";
import { amountRefusal, EDIT, headlineRefusal, updatedStatus } from "@/ui/fundraiser/strings";

// The words of editing in place (editing-interaction.md → Validation at confirm, Confirmation).
// Core returns reason codes; these are the sentences, and every code has one.

describe("amountRefusal", () => {
  const table: [GoalReason, string][] = [
    ["empty", "Type an amount, for example 6,500."],
    ["not-a-number", "That doesn't look like an amount. Use digits, like 6,500 or 6,500.50."],
    ["negative", "An amount can't be negative."],
    ["too-precise", "Use dollars and cents only, like 6,500.50."],
    ["too-large", "That's more than this page can show. The most is $99,999,999.99."],
    ["zero", "The goal has to be more than $0."],
  ];

  it.each(table)("says %s the way the contract does", (code, sentence) => {
    expect(amountRefusal(code)).toBe(sentence);
  });
});

describe("headlineRefusal", () => {
  const table: [HeadlineReason, string][] = [
    ["empty", "The headline can't be empty."],
    ["too-long", "Keep the headline to 60 characters or fewer."],
  ];

  it.each(table)("says %s the way the contract does", (code, sentence) => {
    expect(headlineRefusal(code)).toBe(sentence);
  });
});

describe("updatedStatus", () => {
  it("says what the display now shows, in the contract's words", () => {
    expect(updatedStatus(describeProgress(720_000, 1_000_000))).toBe(
      "Updated: $7,200 raised of $10,000, 72 percent.",
    );
  });

  it("adds that the goal is reached, with the true percentage", () => {
    expect(updatedStatus(describeProgress(1_200_000, 1_000_000))).toBe(
      "Updated: $12,000 raised of $10,000, 120 percent, goal reached.",
    );
  });

  it("speaks the capped percentage as more than 999", () => {
    expect(updatedStatus(describeProgress(9_999_999_999, 1))).toBe(
      "Updated: $99,999,999.99 raised of $0.01, more than 999 percent, goal reached.",
    );
  });
});

describe("EDIT", () => {
  it("names the controls the contract names", () => {
    expect(EDIT.thermometerButton).toBe("Edit the amount raised and the goal");
    expect(EDIT.raisedLabel).toBe("Amount raised");
    expect(EDIT.goalLabel).toBe("Goal");
    expect(EDIT.done).toBe("Done");
  });
});

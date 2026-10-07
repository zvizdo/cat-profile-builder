import { describe, expect, it } from "vitest";
import {
  formatCompactDollars,
  formatDollars,
  parseDollars,
  toAddressAmount,
  type MoneyReason,
} from "@/core/fundraiser/money";

// The amount grammar of contracts/address.md: what `raised=` and `goal=` in the address, and
// the in-place fields, may say. Every refusal is asserted with its own reason code (Principle
// II), because the denial is the behaviour: a bad amount must never become a number.

function accepted(text: string, cents: number): void {
  expect(parseDollars(text)).toEqual({ ok: true, value: cents });
}

function refused(text: string, reason: MoneyReason): void {
  expect(parseDollars(text)).toEqual({ ok: false, error: reason });
}

describe("parseDollars: accepted text", () => {
  it.each([
    ["$7,200", 720000],
    ["7200.50", 720050],
    [".5", 50],
    ["7,200.5", 720050],
    ["  $7,200  ", 720000],
    ["7200", 720000],
    ["1,250,000", 125000000],
    ["$.5", 50],
  ])("reads %j", (text, cents) => {
    accepted(text, cents);
  });

  it("accepts zero in both spellings", () => {
    accepted("0", 0);
    accepted("0.00", 0);
  });

  it("counts whole cents exactly, with no floating-point drift", () => {
    accepted("0.07", 7);
    accepted("19.99", 1999);
    accepted("0.29", 29);
    accepted("1.1", 110);
  });

  it("accepts the largest 12-digit amount", () => {
    accepted("999999999999", 99999999999900);
  });
});

describe("parseDollars: empty", () => {
  it.each(["", "   ", "\t", "\n "])("refuses %j as empty", (text) => {
    refused(text, "empty");
  });
});

describe("parseDollars: not a number", () => {
  it.each([
    "abc",
    "1e3",
    "0x10",
    "$$5",
    "1,23",
    "12,34,567",
    "1 000",
    "1\t000",
    "1\n000",
    "5.",
    "+5",
    "-abc",
    "--5",
    "-$-5",
    "$",
    "-",
    ".",
    "$.",
    ",5",
    "1,000,",
    "1.2.3",
    "5 $",
    "١٢٣",
  ])("refuses %j", (text) => {
    refused(text, "not-a-number");
  });

  it("refuses text over 32 characters without parsing it", () => {
    refused("1".repeat(33), "not-a-number");
    refused(`${"1".repeat(30)}   x`, "not-a-number");
  });

  it("still parses text of exactly 32 characters", () => {
    accepted(`${" ".repeat(20)}12${" ".repeat(10)}`, 1200);
  });
});

describe("parseDollars: negative", () => {
  it.each(["-5", "-$5", "$-5", "  -5  ", "-0.50", "-1,000"])("refuses %j", (text) => {
    refused(text, "negative");
  });
});

describe("parseDollars: too precise and too large", () => {
  it.each(["1.234", "0.001", "$5.999", "5.000"])("refuses %j as too precise", (text) => {
    refused(text, "too-precise");
  });

  it("refuses 13 digits before the point as too large", () => {
    refused("1000000000000", "too-large");
    refused("1,000,000,000,000", "too-large");
    refused("99999999999999999999", "too-large");
    refused("1234567890123.50", "too-large");
  });
});

// The three forms a number takes on the page: the full one in a field, the compact one on the
// thermometer's scale, and the plain one in the address.

describe("formatDollars", () => {
  it("shows whole dollars with thousands commas", () => {
    expect(formatDollars(0)).toBe("$0");
    expect(formatDollars(99900)).toBe("$999");
    expect(formatDollars(100000)).toBe("$1,000");
    expect(formatDollars(650000)).toBe("$6,500");
    expect(formatDollars(125000000)).toBe("$1,250,000");
  });

  it("adds two decimals only when there are cents", () => {
    expect(formatDollars(650050)).toBe("$6,500.50");
    expect(formatDollars(650005)).toBe("$6,500.05");
    expect(formatDollars(1)).toBe("$0.01");
  });
});

describe("formatCompactDollars", () => {
  it("shows whole dollars under $1,000", () => {
    expect(formatCompactDollars(0)).toBe("$0");
    expect(formatCompactDollars(100)).toBe("$1");
    expect(formatCompactDollars(99900)).toBe("$999");
  });

  it("shows the cents of an amount under $1, so a tiny goal is not $0", () => {
    expect(formatCompactDollars(1)).toBe("$0.01");
    expect(formatCompactDollars(50)).toBe("$0.50");
    expect(formatCompactDollars(99)).toBe("$0.99");
  });

  it("uses K with at most three significant digits", () => {
    expect(formatCompactDollars(100000)).toBe("$1K");
    expect(formatCompactDollars(1000000)).toBe("$10K");
    expect(formatCompactDollars(1250000)).toBe("$12.5K");
    expect(formatCompactDollars(1234500)).toBe("$12.3K");
    expect(formatCompactDollars(12345600)).toBe("$123K");
    expect(formatCompactDollars(123400)).toBe("$1.23K");
  });

  it("uses M and B the same way", () => {
    expect(formatCompactDollars(125000000)).toBe("$1.25M");
    expect(formatCompactDollars(999999999)).toBe("$10M");
    expect(formatCompactDollars(9999999999)).toBe("$100M");
    expect(formatCompactDollars(100000000000)).toBe("$1B");
  });

  it("rounds first and picks the unit after, so a unit is never shown as 1000", () => {
    expect(formatCompactDollars(99950)).toBe("$1K");
    expect(formatCompactDollars(99999900)).toBe("$1M");
    expect(formatCompactDollars(99949)).toBe("$999");
    expect(formatCompactDollars(99999999999)).toBe("$1B");
  });
});

describe("toAddressAmount", () => {
  it("writes whole dollars bare and otherwise two decimals, with no $ or commas", () => {
    expect(toAddressAmount(0)).toBe("0");
    expect(toAddressAmount(650000)).toBe("6500");
    expect(toAddressAmount(650050)).toBe("6500.50");
    expect(toAddressAmount(650010)).toBe("6500.10");
    expect(toAddressAmount(5)).toBe("0.05");
    expect(toAddressAmount(125000000)).toBe("1250000");
  });

  it("round-trips through parseDollars", () => {
    for (const cents of [0, 1, 99, 100, 650050, 99999999999]) {
      expect(parseDollars(toAddressAmount(cents))).toEqual({ ok: true, value: cents });
    }
  });
});

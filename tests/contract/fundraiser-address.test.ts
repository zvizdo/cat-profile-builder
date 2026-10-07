import { describe, expect, it } from "vitest";
import { readAddress, writeAddress } from "@/core/fundraiser/address";
import { codePointLength } from "@/core/fundraiser/fit";
import { DEFAULTS, HEADLINE_MAX, type Fundraiser } from "@/core/fundraiser/fundraiser";

// Contract: specs/002-fundraising-thermometer/contracts/address.md. The six invariants, each
// asserted from the outside: an address string goes in the way a browser would send it, and a
// complete fundraiser comes out. The hostile table asserts the denial (Principle II).

/**
 * What Next hands a page for `address`: decoded values, a repeated key as an array. Built
 * from `URLSearchParams` so the test decodes exactly as a browser's address would be decoded.
 */
function nextQuery(address: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(address)) {
    const seen = query[key];
    if (seen === undefined) query[key] = value;
    else query[key] = Array.isArray(seen) ? [...seen, value] : [seen, value];
  }
  return query;
}

/** Reads an address string the way the page would. */
function readFrom(address: string): ReturnType<typeof readAddress> {
  return readAddress(nextQuery(address));
}

const VALID: readonly Fundraiser[] = [
  { headline: "Spring Vet Fund", raisedCents: 650000, goalCents: 1000000 },
  { headline: "a", raisedCents: 0, goalCents: 1 },
  { headline: "Over the top", raisedCents: 9_999_999_999, goalCents: 100 },
  { headline: "Pennies: 50c & 1% of 'all' = \"fun\" + more #1", raisedCents: 1, goalCents: 99 },
  { headline: "Gatos é café 日本語", raisedCents: 650050, goalCents: 1000001 },
  { headline: "\u{1F431}".repeat(HEADLINE_MAX), raisedCents: 12345, goalCents: 67890 },
  { headline: "100% 50% %20 %2520 +", raisedCents: 500, goalCents: 500 },
  { headline: DEFAULTS.headline, raisedCents: DEFAULTS.raisedCents, goalCents: DEFAULTS.goalCents },
];

describe("address contract: 1. round trip", () => {
  it.each(VALID)("read(write(f)) equals f for $headline", (f) => {
    expect(readFrom(writeAddress(f)).fundraiser).toEqual(f);
  });

  it("survives a 60-emoji headline whole", () => {
    const f: Fundraiser = { headline: "\u{1F431}".repeat(60), raisedCents: 100, goalCents: 200 };
    const back = readFrom(writeAddress(f)).fundraiser;
    expect(back.headline).toBe(f.headline);
    expect(codePointLength(back.headline)).toBe(60);
  });

  it("reads the example address of the contract", () => {
    expect(readFrom("?headline=Spring%20Vet%20Fund&raised=6500&goal=10000")).toEqual({
      fundraiser: { headline: "Spring Vet Fund", raisedCents: 650000, goalCents: 1000000 },
      isBlank: false,
    });
  });
});

describe("address contract: 2. total", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "?headline=x"],
    ["an array", [["headline", "x"]]],
    ["a number", 7],
    ["a symbol", Symbol("q")],
    ["a bigint", BigInt(10)],
    ["an empty record", {}],
    ["nested objects", { headline: { a: 1 }, raised: { b: 2 }, goal: [{}] }],
  ])("answers a complete fundraiser for %s", (_name, query) => {
    const { fundraiser } = readAddress(query);
    expect(Object.keys(fundraiser).sort()).toEqual(["goalCents", "headline", "raisedCents"]);
    expect(fundraiser).toEqual(DEFAULTS);
  });

  it("answers a complete fundraiser for an address with nothing readable in it", () => {
    expect(readFrom("?%E0%A4%A=%FF&&&=&headline&raised&goal").fundraiser).toEqual({
      ...DEFAULTS,
    });
  });
});

describe("address contract: 3. per-value fallback", () => {
  const good = "headline=Spring%20Vet%20Fund&raised=6500&goal=10000";

  it("a bad headline falls back alone", () => {
    expect(readFrom("headline=%E2%80%8B&raised=6500&goal=10000").fundraiser).toEqual({
      headline: DEFAULTS.headline,
      raisedCents: 650000,
      goalCents: 1000000,
    });
  });

  it("a bad raised falls back alone", () => {
    expect(readFrom("headline=Spring%20Vet%20Fund&raised=abc&goal=10000").fundraiser).toEqual({
      headline: "Spring Vet Fund",
      raisedCents: DEFAULTS.raisedCents,
      goalCents: 1000000,
    });
  });

  it("a bad goal falls back alone", () => {
    expect(readFrom("headline=Spring%20Vet%20Fund&raised=6500&goal=0").fundraiser).toEqual({
      headline: "Spring Vet Fund",
      raisedCents: 650000,
      goalCents: DEFAULTS.goalCents,
    });
  });

  it("all three bad at once give all three defaults", () => {
    expect(readFrom("headline=&raised=-1&goal=").fundraiser).toEqual(DEFAULTS);
  });

  it("the good address itself is unchanged", () => {
    expect(readFrom(good).fundraiser.headline).toBe("Spring Vet Fund");
  });
});

describe("address contract: 4. stable", () => {
  it.each(VALID)("write(read(write(f))) equals write(f) for $headline", (f) => {
    const once = writeAddress(f);
    expect(writeAddress(readFrom(once).fundraiser)).toBe(once);
  });

  it.each([
    "?headline=%20%20a%20%20%20b%20%20&raised=$1,234.5&goal=%2010",
    `?headline=${"x".repeat(5000)}&raised=1&goal=2`,
    "?headline=%E2%80%AEevil%E2%80%AC&raised=0.10&goal=7",
    "?headline=a&headline=b&debug=1",
  ])("one read-write pass settles a messy address: %s", (address) => {
    const once = writeAddress(readFrom(address).fundraiser);
    expect(writeAddress(readFrom(once).fundraiser)).toBe(once);
  });
});

describe("address contract: 5. hostile table", () => {
  it("keeps <script> as literal text", () => {
    const address = "?headline=%3Cscript%3Ealert(1)%3C%2Fscript%3E";
    expect(readFrom(address).fundraiser.headline).toBe("<script>alert(1)</script>");
  });

  it("keeps an <img onerror> as literal text", () => {
    const address = "?headline=%3Cimg%20src%3Dx%20onerror%3D1%3E";
    expect(readFrom(address).fundraiser.headline).toBe("<img src=x onerror=1>");
  });

  it("writes hostile markup back encoded, never raw", () => {
    const written = writeAddress(readFrom("?headline=%3Cscript%3E").fundraiser);
    expect(written).toBe("?headline=%3Cscript%3E&raised=0&goal=5000");
    expect(written).not.toContain("<");
  });

  it("cuts a 10 000-character headline to 60", () => {
    const { headline } = readFrom(`?headline=${"a".repeat(10_000)}`).fundraiser;
    expect(headline).toBe("a".repeat(60));
  });

  it("cuts a 10 000-emoji headline to 60 whole emoji", () => {
    const { headline } = readFrom(`?headline=${"%F0%9F%90%B1".repeat(10_000)}`).fundraiser;
    expect(headline).toBe("\u{1F431}".repeat(60));
  });

  it("removes bidi, control and zero-width characters", () => {
    const hostile =
      "%E2%80%AE" + // right-to-left override
      "ab" +
      "%E2%80%8B" + // zero-width space
      "%E2%80%8D" + // zero-width joiner
      "%00%07%1B" + // NUL, bell, escape
      "%E2%81%A6%E2%81%A9" + // isolate marks
      "%C2%AD" + // soft hyphen
      "%E2%80%8E%E2%80%8F" + // left-to-right, right-to-left marks
      "cd";
    expect(readFrom(`?headline=${hostile}`).fundraiser.headline).toBe("abcd");
  });

  it("falls back to the default headline for zero-width spaces only", () => {
    expect(readFrom("?headline=%E2%80%8B%E2%80%8B").fundraiser.headline).toBe(DEFAULTS.headline);
  });

  it("keeps a doubly encoded value literally and writes it back as it was", () => {
    const { headline } = readFrom("?headline=a%2520b").fundraiser;
    expect(headline).toBe("a%20b");
    expect(writeAddress({ ...DEFAULTS, headline })).toContain("headline=a%2520b&");
  });

  it.each(["-5", "abc", "1e9", "0x10", "1,23", "1.234", "99999999999999999999"])(
    "raised=%s falls back to the default",
    (raised) => {
      const fundraiser = readFrom(`?raised=${encodeURIComponent(raised)}`).fundraiser;
      expect(fundraiser.raisedCents).toBe(DEFAULTS.raisedCents);
    },
  );

  it.each(["0", "", "-5", "abc", "1e9", "0x10", "1,23", "1.234", "99999999999999999999"])(
    "goal=%s falls back to the default",
    (goal) => {
      const fundraiser = readFrom(`?goal=${encodeURIComponent(goal)}`).fundraiser;
      expect(fundraiser.goalCents).toBe(DEFAULTS.goalCents);
    },
  );

  it("refuses an amount longer than 32 characters without choking on it", () => {
    const fundraiser = readFrom(`?raised=${"9".repeat(100_000)}`).fundraiser;
    expect(fundraiser.raisedCents).toBe(DEFAULTS.raisedCents);
  });

  it("a repeated key uses the first value", () => {
    const fundraiser = readFrom("?headline=First&headline=Second&raised=1&raised=2&goal=3&goal=4");
    expect(fundraiser.fundraiser).toEqual({ headline: "First", raisedCents: 100, goalCents: 300 });
  });

  it("does not let a key named like an object member change anything", () => {
    const query = nextQuery("?__proto__=x&constructor=y&toString=z");
    expect(readAddress(query)).toEqual({ fundraiser: DEFAULTS, isBlank: true });
  });
});

describe("address contract: 6. unknown keys", () => {
  it("change nothing", () => {
    const plain = readFrom("?headline=Spring&raised=1&goal=2").fundraiser;
    expect(readFrom("?debug=1&headline=Spring&hold=3&raised=1&goal=2").fundraiser).toEqual(plain);
  });

  it("are dropped on the next write", () => {
    const { fundraiser } = readFrom("?debug=1&hold=3");
    expect(fundraiser).toEqual(DEFAULTS);
    expect(writeAddress(fundraiser)).not.toMatch(/debug|hold/);
  });
});

describe("address contract: isBlank", () => {
  it.each(["", "?debug=1", "?debug=1&hold=3"])("is true for %j", (address) => {
    expect(readFrom(address).isBlank).toBe(true);
  });

  it("is true for no query at all", () => {
    expect(readAddress({}).isBlank).toBe(true);
    expect(readAddress(undefined).isBlank).toBe(true);
  });

  it.each(["?goal=", "?headline=x", "?raised=abc", "?headline=", "?raised=1&debug=1"])(
    "is false for %j",
    (address) => {
      expect(readFrom(address).isBlank).toBe(false);
    },
  );
});

describe("address contract: writing", () => {
  it("always writes all three keys in order, canonical amounts, %20 spaces", () => {
    const f: Fundraiser = { headline: "A B", raisedCents: 650050, goalCents: 1000000 };
    expect(writeAddress(f)).toBe("?headline=A%20B&raised=6500.50&goal=10000");
  });

  it("writes the defaults for a blank address, complete", () => {
    expect(writeAddress(readFrom("").fundraiser)).toBe(
      "?headline=Help%20us%20reach%20our%20goal&raised=0&goal=5000",
    );
  });
});

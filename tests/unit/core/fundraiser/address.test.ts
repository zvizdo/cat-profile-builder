import { describe, expect, it } from "vitest";
import { readAddress, writeAddress } from "@/core/fundraiser/address";
import { codePointLength } from "@/core/fundraiser/fit";
import { DEFAULTS, HEADLINE_MAX, type Fundraiser } from "@/core/fundraiser/fundraiser";

// The reader and writer of contracts/address.md. The reader is total: whatever it is given, it
// answers with a complete fundraiser, and each key falls back on its own (FR-023).

const GOOD = { headline: "Spring Vet Fund", raised: "6500", goal: "10000" };

/** The reader's fundraiser for `query`, ignoring `isBlank`. */
function read(query: unknown): Fundraiser {
  return readAddress(query).fundraiser;
}

describe("readAddress: good values", () => {
  it("reads the three keys into a fundraiser", () => {
    expect(readAddress(GOOD)).toEqual({
      fundraiser: { headline: "Spring Vet Fund", raisedCents: 650000, goalCents: 1000000 },
      isBlank: false,
    });
  });

  it("reads amounts with a dollar sign, commas and cents", () => {
    expect(read({ ...GOOD, raised: "$6,500.50", goal: "1,250,000" })).toMatchObject({
      raisedCents: 650050,
      goalCents: 125000000,
    });
  });

  it("lets raised exceed the goal", () => {
    expect(read({ ...GOOD, raised: "12000" }).raisedCents).toBe(1200000);
  });

  it("takes the first value of a repeated key", () => {
    const query = { headline: ["First", "Second"], raised: ["1", "2"], goal: ["30", "40"] };
    expect(read(query)).toEqual({ headline: "First", raisedCents: 100, goalCents: 3000 });
  });
});

describe("readAddress: defaults", () => {
  it.each([
    ["an empty record", {}],
    ["undefined", undefined],
    ["null", null],
    ["a string", "headline=x"],
    ["a number", 42],
    ["an array", ["headline", "x"]],
    ["a boolean", true],
    ["a function", () => ({ headline: "x" })],
  ])("gives every default for %s", (_name, query) => {
    expect(read(query)).toEqual(DEFAULTS);
  });

  it("returns a fresh object each time and never the frozen defaults themselves", () => {
    const first = read({});
    expect(first).not.toBe(DEFAULTS);
    expect(Object.isFrozen(first)).toBe(false);
    first.headline = "changed";
    expect(read({})).toEqual(DEFAULTS);
    expect(DEFAULTS.headline).toBe("Help us reach our goal");
  });

  it("gives every default when a key holds something that is not text", () => {
    expect(readAddress({ headline: 5, raised: "1", goal: "2" })).toEqual({
      fundraiser: DEFAULTS,
      isBlank: true,
    });
    expect(read({ headline: ["ok", 3] })).toEqual(DEFAULTS);
    expect(read({ headline: { toString: () => "x" } })).toEqual(DEFAULTS);
  });

  it("treats a key that is undefined or an empty list as missing", () => {
    expect(readAddress({ headline: undefined, raised: [], goal: undefined })).toEqual({
      fundraiser: DEFAULTS,
      isBlank: true,
    });
  });

  it("never throws on a hostile object", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("no");
        },
        getPrototypeOf() {
          throw new Error("no");
        },
        ownKeys() {
          throw new Error("no");
        },
        getOwnPropertyDescriptor() {
          throw new Error("no");
        },
        has() {
          throw new Error("no");
        },
      },
    );
    expect(read(hostile)).toEqual(DEFAULTS);
  });

  it("ignores keys that live on the prototype", () => {
    const query = Object.create({ headline: "Inherited", raised: "9", goal: "9" });
    expect(readAddress(query)).toEqual({ fundraiser: DEFAULTS, isBlank: true });
  });

  it("reads an object with no prototype", () => {
    const query = Object.assign(Object.create(null), { raised: "5" });
    expect(read(query)).toEqual({ ...DEFAULTS, raisedCents: 500 });
  });
});

describe("readAddress: per-value fallback", () => {
  it("a bad headline costs only the headline", () => {
    expect(read({ ...GOOD, headline: "​​" })).toEqual({
      headline: DEFAULTS.headline,
      raisedCents: 650000,
      goalCents: 1000000,
    });
  });

  it("a bad raised costs only the raised amount", () => {
    expect(read({ ...GOOD, raised: "abc" })).toEqual({
      headline: "Spring Vet Fund",
      raisedCents: 0,
      goalCents: 1000000,
    });
  });

  it("a bad goal costs only the goal", () => {
    expect(read({ ...GOOD, goal: "0" })).toEqual({
      headline: "Spring Vet Fund",
      raisedCents: 650000,
      goalCents: 500000,
    });
  });

  it.each(["-5", "abc", "1e9", "0x10", "1,23", "1.234", "99999999999999999999", "", " "])(
    "falls back for raised=%j",
    (raised) => {
      expect(read({ ...GOOD, raised }).raisedCents).toBe(DEFAULTS.raisedCents);
    },
  );

  it.each(["0", "0.00", "-5", "abc", "1e9", "0x10", "1,23", "1.234", "99999999999999999999", ""])(
    "falls back for goal=%j",
    (goal) => {
      expect(read({ ...GOOD, goal }).goalCents).toBe(DEFAULTS.goalCents);
    },
  );

  it("takes the first value even when it is bad and a later one is good", () => {
    expect(read({ raised: ["abc", "5"] }).raisedCents).toBe(0);
  });
});

describe("readAddress: the headline", () => {
  it("is cut, never refused, at 60 code points", () => {
    const headline = read({ headline: "x".repeat(10_000) }).headline;
    expect(headline).toBe("x".repeat(HEADLINE_MAX));
  });

  it("keeps exactly 60 and cuts 61", () => {
    expect(read({ headline: "a".repeat(60) }).headline).toBe("a".repeat(60));
    expect(read({ headline: "a".repeat(61) }).headline).toBe("a".repeat(60));
  });

  it("never splits an emoji when it cuts", () => {
    const headline = read({ headline: "\u{1F431}".repeat(100) }).headline;
    expect(headline).toBe("\u{1F431}".repeat(60));
    expect(codePointLength(headline)).toBe(60);
  });

  it("does not leave a trailing space after the cut", () => {
    const headline = read({ headline: `${"a".repeat(59)} b` }).headline;
    expect(headline).toBe("a".repeat(59));
  });

  it("cuts to 600 units before normalising, without leaving half an emoji", () => {
    // 599 spaces, then an emoji whose first unit is the 600th: the cut must not keep half of it.
    expect(read({ headline: `${" ".repeat(599)}\u{1F431}` })).toEqual(DEFAULTS);
    // A headline that is short after normalising survives the cut untouched.
    expect(read({ headline: `a${" ".repeat(598)}b` }).headline).toBe("a b");
    // Beyond 600 units nothing is read: the tail "tail" is gone.
    expect(read({ headline: `${"a".repeat(30)}${" ".repeat(600)}tail` }).headline).toBe(
      "a".repeat(30),
    );
  });

  it("normalises control, bidi and zero-width characters away", () => {
    expect(read({ headline: "‮backwards‬ ​fund\u0007" }).headline).toBe("backwards fund");
  });

  it("collapses whitespace and keeps words apart across a line break", () => {
    expect(read({ headline: "  vet\r\nfund \t drive " }).headline).toBe("vet fund drive");
  });

  it("falls back to the default when nothing visible is left", () => {
    expect(read({ headline: "   " }).headline).toBe(DEFAULTS.headline);
    expect(read({ headline: "" }).headline).toBe(DEFAULTS.headline);
  });

  it("keeps markup as literal text", () => {
    expect(read({ headline: "<script>alert(1)</script>" }).headline).toBe(
      "<script>alert(1)</script>",
    );
  });
});

describe("readAddress: isBlank", () => {
  it.each([
    ["an empty record", {}],
    ["undefined", undefined],
    ["null", null],
    ["only unknown keys", { debug: "1", hold: "3" }],
  ])("is true for %s", (_name, query) => {
    expect(readAddress(query).isBlank).toBe(true);
  });

  it.each([
    ["an empty goal", { goal: "" }],
    ["an empty headline", { headline: "" }],
    ["a bad raised", { raised: "abc" }],
    ["a headline", { headline: "x" }],
    ["a repeated key", { goal: ["", "1"] }],
  ])("is false for %s", (_name, query) => {
    expect(readAddress(query).isBlank).toBe(false);
  });
});

describe("writeAddress", () => {
  const f: Fundraiser = { headline: "Spring Vet Fund", raisedCents: 650000, goalCents: 1000000 };

  it("writes all three keys in order, with %20 for spaces", () => {
    expect(writeAddress(f)).toBe("?headline=Spring%20Vet%20Fund&raised=6500&goal=10000");
  });

  it("writes amounts canonically", () => {
    expect(writeAddress({ ...f, raisedCents: 650050, goalCents: 1 })).toBe(
      "?headline=Spring%20Vet%20Fund&raised=6500.50&goal=0.01",
    );
    expect(writeAddress({ ...f, raisedCents: 0 })).toContain("&raised=0&");
  });

  it("never writes a plus sign for a space, and escapes a real one", () => {
    const written = writeAddress({ ...f, headline: "a + b" });
    expect(written).toBe("?headline=a%20%2B%20b&raised=6500&goal=10000");
    expect(written).not.toContain("+");
  });

  it("escapes characters that could end a value early", () => {
    const written = writeAddress({ ...f, headline: "a&raised=1#b%20" });
    expect(written).toBe("?headline=a%26raised%3D1%23b%2520&raised=6500&goal=10000");
  });

  it("encodes non-ASCII text and emoji as UTF-8", () => {
    expect(writeAddress({ ...f, headline: "\u{1F431}" })).toContain("headline=%F0%9F%90%B1&");
  });

  it("accepts the defaults, which are frozen", () => {
    expect(writeAddress(DEFAULTS)).toBe(
      "?headline=Help%20us%20reach%20our%20goal&raised=0&goal=5000",
    );
  });
});

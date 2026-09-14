import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkCredentials, hmacPassword, makeCredentials } from "@/core/auth/credentials";

// Every constant-time compare goes through timingSafeEqual; counting its calls is how the
// tests see that a wrong username still pays for the password compare and vice versa
// (FR-002, ADR-011). The wrapper forwards to the real function.
const compares = vi.hoisted(() => ({ count: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return {
    ...real,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      compares.count += 1;
      return real.timingSafeEqual(a, b);
    },
  };
});

const SECRET = "sixteen-characters-long";
const configured = {
  username: "volunteer",
  passwordHmac: createHmac("sha256", SECRET).update("catsarecool").digest("hex"),
  secret: SECRET,
};

function check(username: string, password: string): boolean {
  compares.count = 0;
  return checkCredentials({ username, password }, configured);
}

describe("hmacPassword", () => {
  it("is the hex HMAC-SHA256 of the password keyed by the secret", () => {
    expect(hmacPassword("catsarecool", SECRET)).toBe(configured.passwordHmac);
    expect(hmacPassword("catsarecool", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with either the password or the secret", () => {
    expect(hmacPassword("catsarecoo1", SECRET)).not.toBe(configured.passwordHmac);
    expect(hmacPassword("catsarecool", `${SECRET}x`)).not.toBe(configured.passwordHmac);
  });
});

describe("checkCredentials", () => {
  it("accepts the configured pair", () => {
    expect(check("volunteer", "catsarecool")).toBe(true);
    expect(compares.count).toBe(2);
  });

  it("refuses an unknown username even with the right password, after both compares", () => {
    expect(check("nobody", "catsarecool")).toBe(false);
    expect(compares.count).toBe(2);
  });

  it("refuses a wrong password even with the right username, after both compares", () => {
    expect(check("volunteer", "catsarecoo1")).toBe(false);
    expect(compares.count).toBe(2);
  });

  it("refuses when both halves are wrong, still with both compares", () => {
    expect(check("nobody", "nothing")).toBe(false);
    expect(compares.count).toBe(2);
  });

  it("is case-sensitive and exact on both halves", () => {
    expect(check("Volunteer", "catsarecool")).toBe(false);
    expect(check("volunteer", "Catsarecool")).toBe(false);
    expect(check("volunteer ", "catsarecool")).toBe(false);
    expect(check("", "")).toBe(false);
  });

  it("never throws on lengths that differ from the configured values", () => {
    expect(check("v", "c")).toBe(false);
    expect(check("a".repeat(500), "b".repeat(500))).toBe(false);
    expect(
      checkCredentials(
        { username: "volunteer", password: "catsarecool" },
        { ...configured, passwordHmac: "not-hex" },
      ),
    ).toBe(false);
  });
});

describe("makeCredentials", () => {
  it("returns a fresh 32-byte hex secret and the password's HMAC keyed by it", () => {
    const made = makeCredentials("catsarecool");
    expect(made.sessionSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(made.passwordHmac).toMatch(/^[0-9a-f]{64}$/);
    expect(made.passwordHmac).toBe(hmacPassword("catsarecool", made.sessionSecret));
  });

  it("never returns the same secret twice", () => {
    expect(makeCredentials("catsarecool").sessionSecret).not.toBe(
      makeCredentials("catsarecool").sessionSecret,
    );
  });

  it("produces a pair checkCredentials accepts for that password and refuses for another", () => {
    const made = makeCredentials("catsarecool");
    const pair = {
      username: "volunteer",
      passwordHmac: made.passwordHmac,
      secret: made.sessionSecret,
    };
    expect(checkCredentials({ username: "volunteer", password: "catsarecool" }, pair)).toBe(true);
    expect(checkCredentials({ username: "volunteer", password: "catsarecoo1" }, pair)).toBe(false);
  });

  it("refuses an empty password", () => {
    expect(() => makeCredentials("")).toThrow(/empty/);
  });
});

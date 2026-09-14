import { describe, expect, it, vi } from "vitest";
import { verifySessionToken } from "@/adapters/auth/session";

// `verifySessionToken` swallows jose's own failures (a bad token is "no session") and
// nothing else: a bug inside verification must surface, not sign the visitor out quietly.
// jose is replaced for this file only, so it sits apart from session.test.ts.
vi.mock("jose", async (importOriginal) => {
  const real = await importOriginal<typeof import("jose")>();
  return {
    ...real,
    jwtVerify: async () => {
      throw new TypeError("not a jose failure");
    },
  };
});

describe("verifySessionToken", () => {
  it("lets a failure that is not a jose error propagate", async () => {
    await expect(
      verifySessionToken("token", "sixteen-characters-long", new Date()),
    ).rejects.toThrow(TypeError);
  });
});

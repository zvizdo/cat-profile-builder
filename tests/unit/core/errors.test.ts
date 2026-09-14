import { describe, expect, it } from "vitest";
import {
  AppError,
  ErrorCodeSchema,
  httpStatusFor,
  InternalError,
  NotFoundError,
  parseOrThrow,
  ProfileInvalidError,
  RefusedError,
  TooLargeError,
  UnauthorizedError,
  UnsupportedError,
  UpstreamError,
} from "@/core/errors";
import { z, ZodError } from "zod";
import { ThemeSchema } from "@/core/profile/schema";

describe("error codes", () => {
  it("maps every code to its HTTP status (contracts/server-boundary.md)", () => {
    expect(ErrorCodeSchema.options).toHaveLength(8);
    expect(httpStatusFor("invalid")).toBe(400);
    expect(httpStatusFor("unauthorized")).toBe(401);
    expect(httpStatusFor("not_found")).toBe(404);
    expect(httpStatusFor("refused")).toBe(409);
    expect(httpStatusFor("too_large")).toBe(413);
    expect(httpStatusFor("unsupported")).toBe(422);
    expect(httpStatusFor("upstream")).toBe(502);
    expect(httpStatusFor("internal")).toBe(500);
  });
});

describe("AppError subclasses", () => {
  it("each carries its own code, status, name and message", () => {
    const cases: Array<[AppError, string, number]> = [
      [new ProfileInvalidError("bad"), "invalid", 400],
      [new UnauthorizedError("sign in"), "unauthorized", 401],
      [new NotFoundError("no cat"), "not_found", 404],
      [new RefusedError("in use"), "refused", 409],
      [new TooLargeError("too big"), "too_large", 413],
      [new UnsupportedError("not a video"), "unsupported", 422],
      [new UpstreamError("model down"), "upstream", 502],
      [new InternalError("oops"), "internal", 500],
    ];
    for (const [error, code, status] of cases) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      expect(error.name).toBe(error.constructor.name);
    }
    expect(new NotFoundError("no cat").message).toBe("no cat");
  });

  it("carries an optional cause for diagnosis", () => {
    const cause = new Error("socket closed");
    expect(new UpstreamError("model down", { cause }).cause).toBe(cause);
    expect(new UpstreamError("model down").cause).toBeUndefined();
  });

  it("ProfileInvalidError without issues carries an empty list", () => {
    expect(new ProfileInvalidError("newer than this app").issues).toEqual([]);
  });
});

describe("parseOrThrow", () => {
  it("returns the parsed value", () => {
    expect(parseOrThrow(ThemeSchema, {})).toEqual({ preset: "paper", warmth: 0.5, contrast: 0.5 });
  });

  it("throws ProfileInvalidError with a neutral message naming the failing path", () => {
    expect(() => parseOrThrow(ThemeSchema, { warmth: 2 })).toThrow(ProfileInvalidError);
    expect(() => parseOrThrow(ThemeSchema, { warmth: 2 })).toThrow("Invalid data at warmth");
  });

  it("names every path in the message and keeps Zod's text in issues, with the ZodError as cause", () => {
    let caught: unknown;
    try {
      parseOrThrow(ThemeSchema, { warmth: 2, contrast: -1 });
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof ProfileInvalidError)) throw new Error("expected ProfileInvalidError");
    expect(caught.message).toBe("Invalid data at warmth, contrast");
    expect(caught.issues.map((issue) => issue.path)).toEqual(["warmth", "contrast"]);
    for (const issue of caught.issues) expect(issue.message.length).toBeGreaterThan(0);
    expect(caught.cause).toBeInstanceOf(ZodError);
  });

  it("reports a root-level issue as plain 'Invalid data'", () => {
    expect(() => parseOrThrow(ThemeSchema, null)).toThrow(ProfileInvalidError);
    expect(() => parseOrThrow(ThemeSchema, null)).toThrow(/^Invalid data$/);
  });

  // F35: Zod reports a failed `z.union` as one `Invalid input` at the element and hides the
  // branches' own issues inside it — `messages.3` said nothing about *what* failed.
  describe("a failed union", () => {
    const Part = z.union([
      z.strictObject({ type: z.literal("text"), text: z.string() }),
      z.strictObject({ type: z.literal("tool"), state: z.literal("done") }),
    ]);
    const Message = z.strictObject({ role: z.literal("user"), parts: z.array(Part) });
    const Body = z.strictObject({ messages: z.array(Message) });

    function caught(input: unknown): ProfileInvalidError {
      try {
        parseOrThrow(Body, input);
      } catch (error) {
        if (error instanceof ProfileInvalidError) return error;
      }
      throw new Error("expected ProfileInvalidError");
    }

    it("names the branches' own leaf paths, absolute, instead of the element alone", () => {
      const error = caught({
        messages: [{ role: "user", parts: [{ type: "tool", state: "no" }] }],
      });
      const paths = error.issues.map((issue) => issue.path);
      expect(paths).toContain("messages.0.parts.0.state");
      expect(paths).toContain("messages.0.parts.0.type");
      // Zod's own top-level report — the one line the old code kept — was just this:
      expect(paths).not.toEqual(["messages.0"]);
      expect(error.message).toContain("messages.0.parts.0.state");
    });

    // F35 review, finding 3: a key the client chose (under a free-form `*Metadata` record)
    // must not ride along into the log or the browser message; nor may any over-long key.
    it("masks record keys under a `*Metadata` field and cuts an over-long segment", () => {
      const Meta = z.record(z.string(), z.record(z.string(), z.string()));
      const Schema = z.strictObject({
        parts: z.array(z.strictObject({ providerMetadata: Meta.optional() })),
      });
      const result = Schema.safeParse({
        parts: [{ providerMetadata: { google: { "SECRET-KEY": 1 } } }],
      });
      if (result.success) throw new Error("expected the parse to fail");
      const error = ProfileInvalidError.fromZod(result.error);
      expect(error.paths).toBe("parts.0.providerMetadata.*.*");
      expect(error.message).not.toContain("SECRET");
      const long = z.record(z.string(), z.number()).safeParse({ [`k${"y".repeat(60)}`]: "no" });
      if (long.success) throw new Error("expected the parse to fail");
      expect(ProfileInvalidError.fromZod(long.error).paths).toBe(`k${"y".repeat(31)}`);
    });

    it("names each path once in the message and `paths`, and stops after twelve", () => {
      const parts = Array.from({ length: 30 }, () => ({ type: "tool", state: "no" }));
      const error = caught({ messages: [{ role: "user", parts }] });
      const named = error.message.replace("Invalid data at ", "").split(" (+")[0]?.split(", ");
      expect(named).toHaveLength(12);
      expect(new Set(named).size).toBe(12);
      expect(error.message).toMatch(/\(\+\d+ more\)$/);
      expect(error.paths.split(", ")).toEqual([...new Set(error.paths.split(", "))]);
    });
  });
});

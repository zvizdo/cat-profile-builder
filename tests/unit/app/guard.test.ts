import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { SIGN_IN_MESSAGE, withSession } from "@/app/actions/_lib/guard";
import { INTERNAL_MESSAGE } from "@/app/api/_lib/respond";
import type { CookieReader, Session } from "@/adapters/auth/session";
import { RefusedError } from "@/core/errors";
import { memoryLogger } from "../../fakes/logger";

const SESSION: Session = { sub: "shelter", iat: 1, exp: 2 };
const jar: CookieReader = { get: (name) => (name === "session" ? { value: "jwt" } : undefined) };
const getCookies = async () => jar;

function deps(session: Session | null) {
  const logger = memoryLogger();
  const readSession = vi.fn(async (cookies: CookieReader) =>
    cookies.get("session") === undefined ? null : session,
  );
  return { logger, readSession };
}

describe("withSession", () => {
  it("answers unauthorized without running the action when there is no session", async () => {
    const container = deps(null);
    const action = vi.fn(async () => ({ id: "abcdefgh" }));
    const result = await withSession(container, action, getCookies)();

    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: SIGN_IN_MESSAGE },
    });
    expect(action).not.toHaveBeenCalled();
    expect(container.readSession).toHaveBeenCalledWith(jar);
  });

  it("runs the action with its arguments and spreads its result under ok: true", async () => {
    const container = deps(SESSION);
    const action = async (id: string, n: number) => ({ id, n });
    const result = await withSession(container, action, getCookies)("abcdefgh", 2);
    expect(result).toEqual({ ok: true, id: "abcdefgh", n: 2 });
  });

  it("turns a thrown AppError into the shared error shape", async () => {
    const container = deps(SESSION);
    const action = async () => {
      throw new RefusedError("That photo is on the live page.");
    };
    expect(await withSession(container, action, getCookies)()).toEqual({
      ok: false,
      error: { code: "refused", message: "That photo is on the live page." },
    });
    expect(container.logger.entries).toEqual([]);
  });

  it("turns anything else into a generic internal error and logs the detail", async () => {
    const container = deps(SESSION);
    const action = async () => {
      throw new Error("provider said X");
    };
    const result = await withSession(container, action, getCookies)();
    expect(result).toEqual({ ok: false, error: { code: "internal", message: INTERNAL_MESSAGE } });
    expect(JSON.stringify(result)).not.toContain("X");
    expect(container.logger.entries[0]).toMatchObject({ level: "error", msg: "unhandled" });
  });

  it("answers the error shape when the session reader itself throws", async () => {
    const logger = memoryLogger();
    const readSession = vi.fn(async () => {
      throw new Error("jose: malformed token LEAK");
    });
    const action = vi.fn(async () => ({}));
    const result = await withSession({ logger, readSession }, action, getCookies)();
    expect(result).toEqual({ ok: false, error: { code: "internal", message: INTERNAL_MESSAGE } });
    expect(JSON.stringify(result)).not.toContain("LEAK");
    expect(action).not.toHaveBeenCalled();
    expect(logger.entries[0]?.msg).toBe("unhandled");
  });

  it("hands every signed-out caller the same frozen answer", async () => {
    const container = deps(null);
    const result = await withSession(container, async () => ({}), getCookies)();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.ok ? null : result.error)).toBe(true);
  });

  it("lets a redirect through untouched", async () => {
    const container = deps(SESSION);
    const action = async (): Promise<Record<never, never>> => redirect("/builder");
    await expect(withSession(container, action, getCookies)()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("reads the request cookies from next/headers by default", async () => {
    const container = deps(SESSION);
    const action = vi.fn(async () => ({}));
    // Outside a request there are no cookies to read, so Next refuses and the wrapper answers
    // the generic error; the point is that it asked Next, not a fake.
    const result = await withSession(container, action)();
    expect(result).toEqual({ ok: false, error: { code: "internal", message: INTERNAL_MESSAGE } });
    expect(action).not.toHaveBeenCalled();
    expect(container.logger.entries[0]?.fields.err).toBeInstanceOf(Error);
  });
});

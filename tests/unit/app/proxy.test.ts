import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "@/adapters/auth/session";
import { SIGN_IN_MESSAGE } from "@/app/actions/_lib/guard";
import { config, guard, proxy } from "@/proxy";

const SECRET = "sixteen-characters-long";
const NOW = new Date("2026-09-10T12:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const deps = { secret: SECRET, secure: true, now: () => NOW };

function request(path: string, token?: string): NextRequest {
  const headers: Record<string, string> =
    token === undefined ? {} : { cookie: `${SESSION_COOKIE}=${token}` };
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe("guard: no session", () => {
  it("sends a page request to /sign-in with the path (and query) to come back to", async () => {
    const response = await guard(request("/builder"), deps);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/sign-in?next=/builder");

    const deep = await guard(request("/builder/abcdefgh?tab=photos&x=1"), deps);
    expect(deep.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?next=/builder/abcdefgh%3Ftab%3Dphotos%26x%3D1",
    );
  });

  it.each(["/api/profiles/abcdefgh/draft", "/api/helper/chat"])(
    "answers %s with 401 and the one error shape",
    async (path) => {
      const response = await guard(request(path), deps);
      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({
        error: { code: "unauthorized", message: SIGN_IN_MESSAGE },
      });
    },
  );

  it("treats a token it cannot verify like no token", async () => {
    const foreign = await createSessionToken("some-other-secret-here", NOW);
    expect((await guard(request("/builder", foreign), deps)).status).toBe(307);
    expect((await guard(request("/builder", "garbage"), deps)).status).toBe(307);
    expect((await guard(request("/api/helper/chat", foreign), deps)).status).toBe(401);
  });

  it("treats an expired token like no token", async () => {
    const expired = await createSessionToken(SECRET, ago(31 * DAY));
    const response = await guard(request("/builder", expired), deps);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/sign-in?next=/builder");
  });
});

describe("guard: with a session", () => {
  it("lets a fresh session through without touching the cookie", async () => {
    const token = await createSessionToken(SECRET, ago(DAY - 1000));
    const response = await guard(request("/builder", token), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("re-issues the cookie once the session is more than a day old", async () => {
    const token = await createSessionToken(SECRET, ago(DAY + 1000));
    const response = await guard(request("/builder", token), deps);
    expect(response.status).toBe(200);
    const renewed = response.cookies.get(SESSION_COOKIE);
    expect(renewed).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(NOW.getTime() + 30 * DAY),
    });
    expect(renewed?.value).not.toBe(token);
    expect(await verifySessionToken(renewed?.value ?? "", SECRET, NOW)).toMatchObject({
      iat: NOW.getTime() / 1000,
    });
  });

  it("drops Secure from the renewed cookie only when told to", async () => {
    const token = await createSessionToken(SECRET, ago(2 * DAY));
    const response = await guard(request("/api/profiles/x", token), { ...deps, secure: false });
    expect(response.cookies.get(SESSION_COOKIE)?.secure).toBeFalsy();
  });
});

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The dev upload route is not here on purpose: the proxy buffers request bodies with a
  // 10 MB cut-off, which would truncate every phone video; the route guards itself.
  it("guards exactly the builder, helper and profiles routes", () => {
    expect(config.matcher).toEqual([
      "/builder/:path*",
      "/api/helper/:path*",
      "/api/profiles/:path*",
    ]);
  });

  it("reads the secret and the base URL from the environment", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
    const token = await createSessionToken(SECRET, ago(2 * DAY));
    const response = await proxy(request("/builder", token));
    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE)?.secure).toBeFalsy();
    expect((await proxy(request("/builder"))).status).toBe(307);
  });

  it("refuses to run without a secret rather than guard with an empty one", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
    await expect(proxy(request("/builder"))).rejects.toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("PUBLIC_BASE_URL", "");
    await expect(proxy(request("/builder"))).rejects.toThrow(/PUBLIC_BASE_URL/);
  });
});

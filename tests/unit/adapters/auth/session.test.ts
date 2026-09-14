import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  cookieSecure,
  createSessionToken,
  sessionCookieOptions,
  sessionReader,
  shouldRenew,
  verifySessionToken,
  type Session,
} from "@/adapters/auth/session";
import { fixedClock } from "../../../fakes/clock";

const SECRET = "sixteen-characters-long";
const ISSUED = new Date("2026-09-10T12:00:00.000Z");
const DAY = 86_400_000;
const later = (ms: number) => new Date(ISSUED.getTime() + ms);

describe("session token", () => {
  it("round-trips { sub: shelter, iat, exp } with a 30-day expiry", async () => {
    const token = await createSessionToken(SECRET, ISSUED);
    expect(await verifySessionToken(token, SECRET, later(DAY))).toEqual({
      sub: "shelter",
      iat: 1_789_041_600,
      exp: 1_789_041_600 + 30 * 86_400,
    });
  });

  it("is null once expired, and still valid a second before", async () => {
    const token = await createSessionToken(SECRET, ISSUED);
    expect(await verifySessionToken(token, SECRET, later(30 * DAY - 1000))).not.toBeNull();
    expect(await verifySessionToken(token, SECRET, later(30 * DAY + 1000))).toBeNull();
  });

  it("is null for a token signed with another secret", async () => {
    const token = await createSessionToken(`${SECRET}-other`, ISSUED);
    expect(await verifySessionToken(token, SECRET, later(1000))).toBeNull();
  });

  it("is null for a tampered payload, never throws", async () => {
    const token = await createSessionToken(SECRET, ISSUED);
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "shelter", iat: 1_789_041_600, exp: 4_000_000_000 }),
    ).toString("base64url");
    expect(await verifySessionToken(`${header}.${forged}.${signature}`, SECRET, ISSUED)).toBeNull();
    expect(await verifySessionToken(`${header}.${payload}.`, SECRET, ISSUED)).toBeNull();
    expect(await verifySessionToken("not.a.token", SECRET, ISSUED)).toBeNull();
    expect(await verifySessionToken("", SECRET, ISSUED)).toBeNull();
  });

  it("is null for a well-signed token whose claims are not the session's", async () => {
    const { SignJWT } = await import("jose");
    const sign = (jwt: InstanceType<typeof SignJWT>) =>
      jwt.setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(SECRET));
    const foreignSubject = await sign(
      new SignJWT({}).setSubject("someone").setIssuedAt(ISSUED).setExpirationTime(later(DAY)),
    );
    const noIssuedAt = await sign(
      new SignJWT({}).setSubject("shelter").setExpirationTime(later(DAY)),
    );
    expect(await verifySessionToken(foreignSubject, SECRET, later(1000))).toBeNull();
    expect(await verifySessionToken(noIssuedAt, SECRET, later(1000))).toBeNull();
  });
});

describe("shouldRenew", () => {
  const session: Session = { sub: "shelter", iat: ISSUED.getTime() / 1000, exp: 0 };

  it("is true once the session is more than a day old", () => {
    expect(shouldRenew(session, later(DAY + 1000))).toBe(true);
    expect(shouldRenew(session, later(29 * DAY))).toBe(true);
  });

  it("is false within the first day", () => {
    expect(shouldRenew(session, later(0))).toBe(false);
    expect(shouldRenew(session, later(DAY - 1000))).toBe(false);
  });
});

describe("session cookie", () => {
  it("is named cpb_session and is HttpOnly, Secure, SameSite=Lax on / for 30 days", () => {
    expect(SESSION_COOKIE).toBe("cpb_session");
    expect(sessionCookieOptions(ISSUED, true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: later(30 * DAY),
    });
  });

  it("can drop Secure only for a plain-http localhost base URL", () => {
    expect(sessionCookieOptions(ISSUED, false).secure).toBe(false);
    expect(cookieSecure("http://localhost:3000")).toBe(false);
    expect(cookieSecure("http://localhost")).toBe(false);
    expect(cookieSecure("https://cats.example")).toBe(true);
    expect(cookieSecure("http://localhost.example.com")).toBe(true);
    expect(cookieSecure("http://127.0.0.1:3000")).toBe(true);
  });
});

describe("sessionReader", () => {
  const read = sessionReader(SECRET, fixedClock("2026-09-11T12:00:00.000Z"));

  it("reads the session out of the cpb_session cookie", async () => {
    const token = await createSessionToken(SECRET, ISSUED);
    const jar = { get: (name: string) => (name === SESSION_COOKIE ? { value: token } : undefined) };
    expect(await read(jar)).toMatchObject({ sub: "shelter" });
  });

  it("is null without the cookie or with one that does not verify", async () => {
    expect(await read({ get: () => undefined })).toBeNull();
    expect(await read({ get: () => ({ value: "garbage" }) })).toBeNull();
    const expired = await createSessionToken(SECRET, new Date("2026-01-01T00:00:00.000Z"));
    expect(await read({ get: () => ({ value: expired }) })).toBeNull();
  });
});

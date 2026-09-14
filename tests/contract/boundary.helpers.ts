import { expect } from "vitest";
import { z } from "zod";
import { hmacPassword } from "@/core/auth/credentials";
import { ErrorCodeSchema } from "@/core/errors";

// What every server-boundary contract file shares: a stopped instant, a memory-store
// environment with the fixture credentials, and the one error body as a strict schema so
// a stray extra field fails the contract too (contracts/server-boundary.md).

export const NOW = new Date("2026-09-10T12:00:00.000Z");

export const ENV = {
  STORE: "memory",
  MODEL: "fake",
  PUBLIC_BASE_URL: "http://localhost:3000",
  SESSION_SECRET: "sixteen-characters-long",
  SHELTER_USERNAME: "volunteer",
  SHELTER_PASSWORD_HMAC: hmacPassword("catsarecool", "sixteen-characters-long"),
};

const ErrorBodySchema = z.strictObject({
  error: z.strictObject({ code: ErrorCodeSchema, message: z.string().min(1) }),
});

/** The error of a JSON response, checked against the one body shape. */
export async function errorOf(response: Response): Promise<{ code: string; message: string }> {
  expect(response.headers.get("content-type")).toContain("application/json");
  return ErrorBodySchema.parse(await response.json()).error;
}

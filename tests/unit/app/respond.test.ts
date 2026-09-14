import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorBody, INTERNAL_MESSAGE, respond } from "@/app/api/_lib/respond";
import {
  InternalError,
  NotFoundError,
  ProfileInvalidError,
  RefusedError,
  UnauthorizedError,
  UpstreamError,
} from "@/core/errors";
import { memoryLogger } from "../../fakes/logger";

async function bodyOf(response: Response): Promise<unknown> {
  return response.json();
}

describe("respond", () => {
  it("maps a RefusedError to 409 with the shared shape", async () => {
    const response = respond(new RefusedError("That photo is on the live page."), memoryLogger());
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await bodyOf(response)).toEqual({
      error: { code: "refused", message: "That photo is on the live page." },
    });
  });

  it("maps an UpstreamError to 502 and logs the cause without sending it", async () => {
    const logger = memoryLogger();
    const cause = new Error("vertex: quota exceeded for project 123");
    const response = respond(new UpstreamError("The model did not answer.", { cause }), logger);
    expect(response.status).toBe(502);
    expect(await bodyOf(response)).toEqual({
      error: { code: "upstream", message: "The model did not answer." },
    });
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ level: "warn", msg: "upstream" });
    expect(logger.entries[0]?.fields.err).toBeInstanceOf(UpstreamError);
  });

  it("maps a plain Error to 500 with a generic message, the detail logged and absent", async () => {
    const logger = memoryLogger();
    const response = respond(new Error("provider said X"), logger);
    expect(response.status).toBe(500);
    const body = await bodyOf(response);
    expect(body).toEqual({ error: { code: "internal", message: INTERNAL_MESSAGE } });
    expect(JSON.stringify(body)).not.toContain("X");
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({ level: "error", msg: "unhandled" });
    expect(logger.entries[0]?.fields.err).toBeInstanceOf(Error);
  });

  it("treats an InternalError like any other 500: generic message, detail logged", async () => {
    const logger = memoryLogger();
    const response = respond(new InternalError("Draft profiles/x has no name metadata."), logger);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await bodyOf(response))).not.toContain("metadata");
    expect(logger.entries[0]?.msg).toBe("unhandled");
  });

  it("handles a thrown non-Error value the same way", async () => {
    const logger = memoryLogger();
    const response = respond("a string was thrown", logger);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await bodyOf(response))).not.toContain("string was thrown");
    expect(logger.entries[0]?.fields.err).toBe("a string was thrown");
  });

  // F35: a 400 the app never logged was a 400 nobody could diagnose — the paths go to the
  // log at warn, and nothing else from the request does (Zod's own message quotes values).
  it("logs an invalid request's failing paths at warn — paths only, never a value", async () => {
    const logger = memoryLogger();
    const Schema = z.strictObject({
      messages: z.array(z.strictObject({ role: z.literal("user"), text: z.string() })),
    });
    const parsed = Schema.safeParse({ messages: [{ role: "system", text: "SECRET-VALUE" }] });
    if (parsed.success) throw new Error("expected the parse to fail");
    const response = respond(ProfileInvalidError.fromZod(parsed.error), logger);
    expect(response.status).toBe(400);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: "warn",
      msg: "invalid request",
      fields: { paths: ["messages.0.role"] },
    });
    expect(JSON.stringify(logger.entries)).not.toContain("SECRET-VALUE");
    expect(JSON.stringify(logger.entries)).not.toContain("system");
  });

  it("logs an invalid request raised without issues with an empty path list", () => {
    const logger = memoryLogger();
    respond(new ProfileInvalidError("The request body isn't JSON."), logger);
    expect(logger.entries[0]).toMatchObject({ level: "warn", fields: { paths: [] } });
  });

  it.each([
    [new ProfileInvalidError("Invalid data at name"), 400, "invalid"],
    [new UnauthorizedError("Sign in to continue."), 401, "unauthorized"],
    [new NotFoundError("No cat with that id."), 404, "not_found"],
  ])("maps %s to its status", async (error, status, code) => {
    const response = respond(error, memoryLogger());
    expect(response.status).toBe(status);
    expect(await bodyOf(response)).toEqual({ error: { code, message: error.message } });
  });
});

describe("errorBody", () => {
  it("gives the same shape without a Response, for Server Actions", () => {
    expect(errorBody(new RefusedError("No."), memoryLogger())).toEqual({
      error: { code: "refused", message: "No." },
    });
    const logger = memoryLogger();
    expect(errorBody(new Error("provider said X"), logger)).toEqual({
      error: { code: "internal", message: INTERNAL_MESSAGE },
    });
    expect(logger.entries).toHaveLength(1);
  });
});

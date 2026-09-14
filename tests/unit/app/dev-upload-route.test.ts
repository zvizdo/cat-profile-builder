import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, type CookieReader } from "@/adapters/auth/session";
import { createFsProfileStore } from "@/adapters/fs/profile-store";
import { acceptDevUpload } from "@/app/api/_lib/dev-upload";
import { PUT } from "@/app/api/dev-upload/[id]/[mid]/route";
import { memoryLogger } from "../../fakes/logger";

// `PUT /api/dev-upload/{pid}/{mid}` — where the filesystem MediaStore's "signed" upload URL
// points (T016). Exists only under `STORE=fs`; under any other store it is a plain 404, so
// a deployment never grows a write path into its bucket. Signed-in, ids validated, the
// body capped at the largest upload the app accepts.

const PID = "abcdefgh";
const MID = "mmmmmmm2";
const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };
const readSession = async (cookies: CookieReader) =>
  cookies.get(SESSION_COOKIE) === undefined ? null : SESSION;

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cpb-dev-upload-route-"));
  await createFsProfileStore({ root }).writeDraft(
    PID,
    { id: PID },
    { name: "Charlotte", line: "", thumbnail: null, updatedAt: "2026-01-01T00:00:00.000Z" },
  );
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function deps(store: "fs" | "memory" = "fs") {
  return {
    config: { STORE: store, DATA_DIR: root },
    logger: memoryLogger(),
    readSession,
    profileStore: createFsProfileStore({ root }),
  };
}

function put(body: string | null, options: { cookie?: boolean; mid?: string } = {}) {
  const headers = new Headers();
  if (options.cookie !== false) headers.set("cookie", `${SESSION_COOKIE}=t`);
  return new NextRequest(`http://localhost:3000/api/dev-upload/${PID}/${options.mid ?? MID}`, {
    method: "PUT",
    headers,
    ...(body === null ? {} : { body }),
  });
}

vi.mock("@/adapters/container", () => ({
  getContainer: () => deps(),
}));

describe("PUT /api/dev-upload/[id]/[mid]", () => {
  it("writes the body as the original and answers 200", async () => {
    const response = await acceptDevUpload(deps(), put("some bytes"), { id: PID, mid: MID });
    expect(response.status).toBe(200);
    const file = join(root, "private", "profiles", PID, "media", MID, "original");
    expect((await readFile(file)).toString()).toBe("some bytes");
  });

  it("is a 404 under any store but fs", async () => {
    const response = await acceptDevUpload(deps("memory"), put("x"), { id: PID, mid: MID });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "There is no file at this address." },
    });
  });

  it("answers 401 without a session and 400 for a malformed id, writing nothing", async () => {
    expect(
      (await acceptDevUpload(deps(), put("x", { cookie: false }), { id: PID, mid: MID })).status,
    ).toBe(401);
    const bad = await acceptDevUpload(deps(), put("x", { mid: "../x" }), { id: PID, mid: "../x" });
    expect(bad.status).toBe(400);
  });

  it("answers 400 for a request with no body", async () => {
    const response = await acceptDevUpload(deps(), put(null), { id: PID, mid: MID });
    expect(response.status).toBe(400);
  });

  it("is a 404 for a profile that does not exist (F13, T040 L3)", async () => {
    const noSuchCat = "zzzzzzzz";
    const response = await acceptDevUpload(deps(), put("x"), { id: noSuchCat, mid: MID });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "There's no cat with that id." },
    });
  });

  it("refuses a second PUT to an already-finalized original with 409, bytes unchanged (F13, T040 L3)", async () => {
    const mid = "oooooo22";
    const first = await acceptDevUpload(deps(), put("original bytes"), { id: PID, mid });
    expect(first.status).toBe(200);
    const file = join(root, "private", "profiles", PID, "media", mid, "original");
    expect((await readFile(file)).toString()).toBe("original bytes");

    const second = await acceptDevUpload(deps(), put("overwrite attempt"), { id: PID, mid });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      error: { code: "refused", message: expect.any(String) },
    });
    expect((await readFile(file)).toString()).toBe("original bytes");
  });

  it("the route file hands the container, the request and the ids to acceptDevUpload", async () => {
    const response = await PUT(put("routed"), {
      params: Promise.resolve({ id: PID, mid: "nnnnnnn3" }),
    });
    expect(response.status).toBe(200);
    const file = join(root, "private", "profiles", PID, "media", "nnnnnnn3", "original");
    expect((await readFile(file)).toString()).toBe("routed");
  });
});

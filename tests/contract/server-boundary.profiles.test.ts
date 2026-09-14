import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, type CookieReader } from "@/adapters/auth/session";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { SIGN_IN_MESSAGE } from "@/app/actions/_lib/guard";
import {
  createProfileWith,
  deleteProfileWith,
  listProfilesWith,
  loadDraftWith,
} from "@/app/actions/_lib/profiles";
import { createProfile, deleteProfile, listProfiles, loadDraft } from "@/app/actions/profiles";
import { saveDraft } from "@/app/api/_lib/draft";
import { INTERNAL_MESSAGE } from "@/app/api/_lib/respond";
import { UpstreamError } from "@/core/errors";
import type { IdSource } from "@/core/ports";
import { ProfileDocumentSchema, type ProfileDocument } from "@/core/profile/schema";
import { fixedClock } from "../fakes/clock";
import { sequentialIds } from "../fakes/id-source";
import { memoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { ENV, errorOf, NOW } from "./boundary.helpers";

// The profile actions and the draft save route (T018; contracts/server-boundary.md rows
// `listProfiles`, `createProfile`, `loadDraft`, `deleteProfile` and `PUT …/draft`), run
// against the memory stores with a stopped clock, sequential ids and a session reader
// that trusts the `cpb_session` cookie's presence.

const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };

/** Signed in when the session cookie is present at all; the token is not verified here. */
const readSession = async (cookies: CookieReader) =>
  cookies.get(SESSION_COOKIE) === undefined ? null : SESSION;

const signedIn = async () => ({ get: () => ({ value: "token" }) });
const signedOut = async () => ({ get: () => undefined });

/** Everything the profile actions and the draft route take from the container. */
function profileDeps(ids: IdSource = sequentialIds()) {
  const buckets = createMemoryBuckets();
  return {
    config: { PUBLIC_BASE_URL: "http://localhost:3000" },
    profileStore: createMemoryProfileStore({ buckets }),
    mediaStore: createMemoryMediaStore({ publicBase: "/media", buckets }),
    ids,
    clock: fixedClock(NOW.toISOString()),
    logger: memoryLogger(),
    readSession,
  };
}

/** An id source whose profile ids come from `list`, in order. */
function fixedIds(list: string[]): IdSource {
  const queue = [...list];
  return {
    ...sequentialIds(),
    profileId: () => {
      const id = queue.shift();
      if (id === undefined) throw new Error("fixedIds ran out");
      return id;
    },
  };
}

const PID = "abcdefgh";

/** The first id `sequentialIds().blockId()` ever hands out — what a fresh `createProfileWith` hero gets. */
const FIRST_BLOCK_ID = "baaaaaaaaaab";

function emptyDocument(id: string, updatedAt = NOW.toISOString()): ProfileDocument {
  return {
    schemaVersion: 1,
    id,
    name: "",
    blocks: [{ id: FIRST_BLOCK_ID, type: "hero", mediaId: null }],
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt,
  };
}

/** A draft with `name`, saved at `updatedAt`, as a save would write it. */
async function seedDraft(
  deps: ReturnType<typeof profileDeps>,
  id: string,
  name: string,
  updatedAt: string,
  thumbnail: { mid: string; rev: string } | null = null,
) {
  const doc = { ...emptyDocument(id, updatedAt), name };
  await deps.profileStore.writeDraft(id, doc, { name, line: "", thumbnail, updatedAt });
  return doc;
}

describe("listProfiles", () => {
  it("maps every row to a ProfileSummary, last edited first", async () => {
    const deps = profileDeps();
    await seedDraft(deps, "aaaaaaaa", "Older", "2026-09-01T00:00:00.000Z");
    await seedDraft(deps, "bbbbbbbb", "Newest", "2026-09-10T00:00:00.000Z", {
      mid: "media2aa",
      rev: "abc1234567",
    });
    await seedDraft(deps, "cccccccc", "Middle", "2026-09-05T00:00:00.000Z");
    await deps.profileStore.writePublished("cccccccc", emptyDocument("cccccccc"));
    await seedDraft(deps, "dddddddd", "Archived", "2026-09-03T00:00:00.000Z");
    await deps.profileStore.writePublished("dddddddd", emptyDocument("dddddddd"));
    await deps.profileStore.archive("dddddddd");

    expect(await listProfilesWith(deps, signedIn)).toEqual({
      ok: true,
      profiles: [
        {
          id: "bbbbbbbb",
          name: "Newest",
          line: "",
          thumbnailUrl: "/media/profiles/bbbbbbbb/media/media2aa/clean.abc1234567.jpg",
          state: "draft",
          updatedAt: "2026-09-10T00:00:00.000Z",
        },
        {
          id: "cccccccc",
          name: "Middle",
          line: "",
          thumbnailUrl: null,
          state: "live",
          updatedAt: "2026-09-05T00:00:00.000Z",
        },
        {
          id: "dddddddd",
          name: "Archived",
          line: "",
          thumbnailUrl: null,
          state: "archived",
          updatedAt: "2026-09-03T00:00:00.000Z",
        },
        {
          id: "aaaaaaaa",
          name: "Older",
          line: "",
          thumbnailUrl: null,
          state: "draft",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("answers unauthorized without a session", async () => {
    expect(await listProfilesWith(profileDeps(), signedOut)).toEqual({
      ok: false,
      error: { code: "unauthorized", message: SIGN_IN_MESSAGE },
    });
  });

  it("the exported actions read Next's cookies: outside a request they answer the generic error", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    vi.stubEnv("LOG_LEVEL", "silent");
    const internal = { error: { code: "internal" } };
    expect(await listProfiles()).toMatchObject(internal);
    expect(await createProfile()).toMatchObject(internal);
    expect(await loadDraft(PID)).toMatchObject(internal);
    expect(await deleteProfile(PID)).toMatchObject(internal);
    vi.unstubAllEnvs();
  });
});

describe("createProfile", () => {
  it("writes an empty draft with the default theme under the IdSource's id and answers { id }", async () => {
    const deps = profileDeps();
    expect(await createProfileWith(deps, signedIn)).toEqual({ ok: true, id: "paaaaaab" });

    const stored = await deps.profileStore.readDraft("paaaaaab");
    expect(ProfileDocumentSchema.parse(stored)).toEqual(emptyDocument("paaaaaab"));
    expect(await deps.profileStore.list()).toEqual([
      {
        pid: "paaaaaab",
        state: "draft",
        name: "",
        line: "",
        thumbnail: null,
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  it("retries once when the id is taken, leaving the existing cat untouched", async () => {
    const deps = profileDeps(fixedIds([PID, "abcdefgi"]));
    const existing = await seedDraft(deps, PID, "Charlotte", "2026-09-01T00:00:00.000Z");
    expect(await createProfileWith(deps, signedIn)).toEqual({ ok: true, id: "abcdefgi" });
    expect(await deps.profileStore.readDraft(PID)).toEqual(existing);
    expect(await deps.profileStore.exists("abcdefgi")).toBe(true);
  });

  it("gives up after one retry rather than overwriting a cat", async () => {
    const deps = profileDeps(fixedIds([PID, PID, PID]));
    await seedDraft(deps, PID, "Charlotte", "2026-09-01T00:00:00.000Z");
    expect(await createProfileWith(deps, signedIn)).toEqual({
      ok: false,
      error: { code: "internal", message: INTERNAL_MESSAGE },
    });
    expect((await deps.profileStore.list()).map((row) => row.name)).toEqual(["Charlotte"]);
  });

  it("answers unauthorized without a session and creates nothing", async () => {
    const deps = profileDeps();
    expect(await createProfileWith(deps, signedOut)).toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
    expect(await deps.profileStore.list()).toEqual([]);
  });
});

describe("loadDraft", () => {
  it("answers the migrated, validated document and its media records", async () => {
    const deps = profileDeps();
    const doc = await seedDraft(deps, PID, "Charlotte", NOW.toISOString());
    const asset = JSON.parse(
      readFileSync(new URL("../fixtures/maximal-asset-photo.json", import.meta.url), "utf8"),
    ) as { id: string; revisions: { clean: string } };
    await deps.mediaStore.writeAsset(PID, asset.id, asset);

    // Each record arrives as the builder's view: the record plus its derived files' URLs.
    expect(await loadDraftWith(deps, PID, signedIn)).toEqual({
      ok: true,
      document: doc,
      state: "draft",
      url: null,
      assets: [
        {
          ...asset,
          cleanUrl: deps.mediaStore.publicUrl(PID, asset.id, "clean", asset.revisions.clean),
        },
      ],
    });
  });

  it("rejects an id that is not [a-z2-7]{8} with invalid", async () => {
    expect(await loadDraftWith(profileDeps(), "../draft", signedIn)).toEqual({
      ok: false,
      error: { code: "invalid", message: "Invalid data" },
    });
  });

  it("answers not_found for an unknown id", async () => {
    expect(await loadDraftWith(profileDeps(), PID, signedIn)).toEqual({
      ok: false,
      error: { code: "not_found", message: "There's no cat with that id." },
    });
  });

  it("answers invalid with the one sentence for a corrupted draft, logging the path and repairing nothing", async () => {
    const deps = profileDeps();
    const broken = { ...emptyDocument(PID), blocks: "nope" };
    await deps.profileStore.writeDraft(PID, broken, {
      name: "",
      line: "",
      thumbnail: null,
      updatedAt: NOW.toISOString(),
    });

    expect(await loadDraftWith(deps, PID, signedIn)).toEqual({
      ok: false,
      error: { code: "invalid", message: "This profile couldn't be read." },
    });
    const warning = deps.logger.entries.find((entry) => entry.level === "warn");
    expect(warning?.fields).toMatchObject({ pid: PID, paths: "blocks" });
    expect(await deps.profileStore.readDraft(PID)).toEqual(broken);
  });

  it("leaves out a media record that fails its schema, logging it, rather than failing the page", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "Charlotte", NOW.toISOString());
    await deps.mediaStore.writeAsset(PID, "media2ax", { schemaVersion: 1, id: "media2ax" });

    expect(await loadDraftWith(deps, PID, signedIn)).toMatchObject({ ok: true, assets: [] });
    const entry = deps.logger.entries.find((e) => e.level === "error");
    expect(entry?.fields).toMatchObject({ pid: PID, mid: "media2ax" });
  });

  it("answers the store's failure rather than a cat with no media when a record cannot be read", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "Charlotte", NOW.toISOString());
    await deps.mediaStore.writeAsset(PID, "media2ax", { any: "thing" });
    deps.mediaStore.readAsset = async () => {
      throw new UpstreamError("The storage service didn't respond.");
    };

    expect(await loadDraftWith(deps, PID, signedIn)).toEqual({
      ok: false,
      error: { code: "upstream", message: "The storage service didn't respond." },
    });
  });

  it("answers unauthorized without a session", async () => {
    expect(await loadDraftWith(profileDeps(), PID, signedOut)).toMatchObject({
      error: { code: "unauthorized" },
    });
  });
});

describe("deleteProfile", () => {
  it("removes a draft, its media and its metadata row", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "Charlotte", NOW.toISOString());
    await deps.mediaStore.writeAsset(PID, "media2ax", { any: "thing" });

    expect(await deleteProfileWith(deps, PID, signedIn)).toEqual({ ok: true });
    expect(await deps.profileStore.exists(PID)).toBe(false);
    expect(await deps.profileStore.list()).toEqual([]);
    expect(await deps.mediaStore.listMedia(PID)).toEqual([]);
  });

  it("refuses a live cat with 409 refused, `Unpublish first.`, and deletes nothing", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "Charlotte", NOW.toISOString());
    await deps.profileStore.writePublished(PID, emptyDocument(PID));

    expect(await deleteProfileWith(deps, PID, signedIn)).toEqual({
      ok: false,
      error: { code: "refused", message: "Unpublish first." },
    });
    expect(await deps.profileStore.exists(PID)).toBe(true);
  });

  it("refuses an archived cat the same way", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "Charlotte", NOW.toISOString());
    await deps.profileStore.writePublished(PID, emptyDocument(PID));
    await deps.profileStore.archive(PID);

    expect(await deleteProfileWith(deps, PID, signedIn)).toEqual({
      ok: false,
      error: { code: "refused", message: "Unpublish first." },
    });
    expect(await deps.profileStore.readArchived(PID)).not.toBeNull();
  });

  it("answers not_found for an unknown id and invalid for a malformed one", async () => {
    expect(await deleteProfileWith(profileDeps(), PID, signedIn)).toMatchObject({
      error: { code: "not_found" },
    });
    expect(await deleteProfileWith(profileDeps(), "nope", signedIn)).toMatchObject({
      error: { code: "invalid" },
    });
  });

  it("answers unauthorized without a session", async () => {
    expect(await deleteProfileWith(profileDeps(), PID, signedOut)).toMatchObject({
      error: { code: "unauthorized" },
    });
  });
});

describe("PUT /api/profiles/{id}/draft", () => {
  function put(body: unknown, options: { id?: string; cookie?: string | null } = {}) {
    const headers = new Headers({ "content-type": "application/json" });
    if (options.cookie !== null)
      headers.set("cookie", `${SESSION_COOKIE}=${options.cookie ?? "t"}`);
    const request = new NextRequest(
      `http://localhost:3000/api/profiles/${options.id ?? PID}/draft`,
      {
        method: "PUT",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
    );
    return request;
  }

  it("validates the body, stamps updatedAt, writes the draft with its list metadata and answers { updatedAt }", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "", "2026-09-01T00:00:00.000Z");
    const body = { ...emptyDocument(PID, "2026-09-01T00:00:00.000Z"), name: "Charlotte" };

    const response = await saveDraft(deps, put(body), PID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedAt: NOW.toISOString() });
    expect(await deps.profileStore.readDraft(PID)).toEqual({
      ...body,
      updatedAt: NOW.toISOString(),
    });
    expect(await deps.profileStore.list()).toEqual([
      {
        pid: PID,
        state: "draft",
        name: "Charlotte",
        line: "",
        thumbnail: null,
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  it("rejects a body missing schemaVersion with 400 invalid, naming the field, and writes nothing", async () => {
    const deps = profileDeps();
    const before = await seedDraft(deps, PID, "Charlotte", "2026-09-01T00:00:00.000Z");
    const body: Record<string, unknown> = { ...emptyDocument(PID) };
    delete body.schemaVersion;

    const response = await saveDraft(deps, put(body), PID);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toEqual({
      code: "invalid",
      message: "Invalid data at schemaVersion",
    });
    expect(await deps.profileStore.readDraft(PID)).toEqual(before);
  });

  it("rejects a body whose id is not the path's id with 400 invalid", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "Charlotte", "2026-09-01T00:00:00.000Z");
    const response = await saveDraft(deps, put(emptyDocument("zzzzzzzz")), PID);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: "invalid" });
  });

  it("rejects a body that is not JSON with 400 invalid", async () => {
    const deps = profileDeps();
    await seedDraft(deps, PID, "Charlotte", "2026-09-01T00:00:00.000Z");
    const response = await saveDraft(deps, put("{not json"), PID);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: "invalid" });
  });

  it("answers 404 for a cat that does not exist rather than creating one", async () => {
    const deps = profileDeps();
    const response = await saveDraft(deps, put(emptyDocument(PID)), PID);
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toMatchObject({ code: "not_found" });
    expect(await deps.profileStore.exists(PID)).toBe(false);
  });

  it("answers 400 for a path id outside [a-z2-7]{8}", async () => {
    const response = await saveDraft(profileDeps(), put(emptyDocument(PID), { id: "x" }), "x");
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: "invalid" });
  });

  it("answers 401 with the one shape without a session, before reading the body", async () => {
    const deps = profileDeps();
    const response = await saveDraft(deps, put("{not json", { cookie: null }), PID);
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toEqual({ code: "unauthorized", message: SIGN_IN_MESSAGE });
  });
});

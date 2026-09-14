import { beforeEach, describe, expect, it } from "vitest";
import { ProfileInvalidError } from "@/core/errors";
import { lookupPublished } from "@/app/(public)/cats/[slugAndId]/_lib/lookup";
import type { ProfileStore } from "@/core/ports";
import { createMemoryProfileStore } from "../../fakes/profile-store";

// `/cats/{slug}-{id}` (contracts/server-boundary.md → Pages; FR-057, FR-083): the lookup
// is by trailing id alone; a stale slug is a 308 to the current one; no `published.json`
// — never written, unpublished, or archived — is a 404. The archived copy is never read.

const PID = "kx3f7q2m";
const META = {
  name: "Charlotte",
  line: "",
  thumbnail: null,
  updatedAt: "2026-09-10T12:00:00.000Z",
};
const PUBLISHED = {
  schemaVersion: 1,
  id: PID,
  name: "Charlotte",
  blocks: [{ id: "blockaaaaaaa", type: "hero", mediaId: null }],
  theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
  updatedAt: "2026-09-10T12:00:00.000Z",
  publishedAt: "2026-09-10T12:00:00.000Z",
  slug: "charlotte",
  media: {},
};

let store: ProfileStore;

beforeEach(async () => {
  store = createMemoryProfileStore();
  await store.writeDraft(PID, PUBLISHED, META);
});

describe("lookupPublished", () => {
  it("is not-found for a segment that is not slug-and-id", async () => {
    expect(await lookupPublished(store, "Charlotte")).toEqual({ kind: "not-found" });
    expect(await lookupPublished(store, "charlotte-")).toEqual({ kind: "not-found" });
  });

  it("is not-found when there is no published.json, draft or not", async () => {
    expect(await lookupPublished(store, `charlotte-${PID}`)).toEqual({ kind: "not-found" });
    expect(await lookupPublished(store, "nobody-zzzzzzzz")).toEqual({ kind: "not-found" });
  });

  it("finds the published document by its trailing id", async () => {
    await store.writePublished(PID, PUBLISHED);
    expect(await lookupPublished(store, `charlotte-${PID}`)).toEqual({
      kind: "found",
      document: PUBLISHED,
    });
  });

  it("redirects a stale or missing slug to the current address", async () => {
    await store.writePublished(PID, PUBLISHED);
    expect(await lookupPublished(store, `charlie-${PID}`)).toEqual({
      kind: "redirect",
      to: `/cats/charlotte-${PID}`,
    });
    expect(await lookupPublished(store, PID)).toEqual({
      kind: "redirect",
      to: `/cats/charlotte-${PID}`,
    });
  });

  it("is not-found once the cat is archived, without reading the archived copy", async () => {
    await store.writePublished(PID, PUBLISHED);
    await store.archive(PID);
    expect(await lookupPublished(store, `charlotte-${PID}`)).toEqual({ kind: "not-found" });
  });

  it("surfaces an unreadable published document as an error, never a partial page", async () => {
    await store.writePublished(PID, { ...PUBLISHED, media: undefined });
    await expect(lookupPublished(store, `charlotte-${PID}`)).rejects.toBeInstanceOf(
      ProfileInvalidError,
    );
  });
});

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/profiles/[id]/draft/route";
import { fixedClock } from "../../fakes/clock";
import { memoryLogger } from "../../fakes/logger";
import { createMemoryMediaStore } from "../../fakes/media-store";
import { createMemoryProfileStore } from "../../fakes/profile-store";

// The `PUT /api/profiles/{id}/draft` wiring (T018): the handler hands the container, the
// request and the resolved path id to `saveDraft`. The save itself is pinned in
// tests/contract/server-boundary.profiles.test.ts; this only proves the route reaches it.

const NOW = "2026-09-10T12:00:00.000Z";
const container = {
  profileStore: createMemoryProfileStore(),
  mediaStore: createMemoryMediaStore({ publicBase: "/media" }),
  clock: fixedClock(NOW),
  logger: memoryLogger(),
  readSession: async () => ({ sub: "shelter" as const, iat: 0, exp: 4_102_444_800 }),
};

vi.mock("@/adapters/container", () => ({
  getContainer: () => container,
}));

describe("PUT /api/profiles/[id]/draft", () => {
  it("saves the body for the cat the path names and answers the stamp", async () => {
    const id = "abcdefgh";
    const doc = {
      schemaVersion: 1,
      id,
      name: "Charlotte",
      blocks: [{ id: "blockaaaaaaa", type: "hero", mediaId: null }],
      theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    await container.profileStore.writeDraft(id, doc, {
      name: "",
      line: "",
      thumbnail: null,
      updatedAt: doc.updatedAt,
    });
    const request = new NextRequest(`http://localhost:3000/api/profiles/${id}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
    const response = await PUT(request, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedAt: NOW });
    expect(await container.profileStore.readDraft(id)).toEqual({ ...doc, updatedAt: NOW });
  });
});

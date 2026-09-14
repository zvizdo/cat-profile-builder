import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, type CookieReader } from "@/adapters/auth/session";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { saveDraft } from "@/app/api/_lib/draft";
import { fixedClock } from "../fakes/clock";
import { memoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { NOW } from "./boundary.helpers";

// The list metadata a draft save stamps (ADR-015 → Draft saves; contracts/server-boundary.md
// row `PUT …/draft`): the name, the display line and the hero's clean photo, so the list
// renders every card from metadata alone.

const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };
const readSession = async (cookies: CookieReader) =>
  cookies.get(SESSION_COOKIE) === undefined ? null : SESSION;

const PID = "abcdefgh";

function draftDeps() {
  const buckets = createMemoryBuckets();
  return {
    profileStore: createMemoryProfileStore({ buckets }),
    mediaStore: createMemoryMediaStore({ publicBase: "/media", buckets }),
    clock: fixedClock(NOW.toISOString()),
    logger: memoryLogger(),
    readSession,
  };
}

function put(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/profiles/${PID}/draft`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=t` },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/profiles/{id}/draft list metadata", () => {
  it("stamps the display line and the hero's clean photo (ADR-015)", async () => {
    const deps = draftDeps();
    const updatedAt = "2026-09-01T00:00:00.000Z";
    const empty = {
      schemaVersion: 1,
      id: PID,
      name: "",
      blocks: [],
      theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
      updatedAt,
    };
    await deps.profileStore.writeDraft(PID, empty, {
      name: "",
      line: "",
      thumbnail: null,
      updatedAt,
    });
    const asset = JSON.parse(
      readFileSync(new URL("../fixtures/maximal-asset-photo.json", import.meta.url), "utf8"),
    ) as { revisions: { clean: string } };
    await deps.mediaStore.writeAsset(PID, "media2aa", { ...asset, id: "media2aa" });
    const body = {
      ...empty,
      name: "Charlotte",
      tagline: "A negotiator, not a complainer.",
      blocks: [{ id: "blockaaaaaaa", type: "hero", mediaId: "media2aa" }],
    };

    expect((await saveDraft(deps, put(body), PID)).status).toBe(200);
    expect(await deps.profileStore.list()).toMatchObject([
      {
        pid: PID,
        name: "Charlotte",
        line: "A negotiator, not a complainer.",
        thumbnail: { mid: "media2aa", rev: asset.revisions.clean },
      },
    ]);
  });
});

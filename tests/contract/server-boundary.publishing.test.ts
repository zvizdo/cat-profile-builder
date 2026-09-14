import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, type CookieReader } from "@/adapters/auth/session";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { SIGN_IN_MESSAGE } from "@/app/actions/_lib/guard";
import { loadDraftWith } from "@/app/actions/_lib/profiles";
import {
  archiveWith,
  NOT_READY_CODE,
  publishWith,
  restoreWith,
  unpublishWith,
} from "@/app/actions/_lib/publishing";
import { archive, publish, restore, unpublish } from "@/app/actions/publishing";
import type { MediaAsset } from "@/core/media/schema";
import type { ProfileDocument } from "@/core/profile/schema";
import { photoAsset } from "../unit/core/media/builders";
import { bio, document, hero } from "../unit/core/profile/builders";
import { fixedClock } from "../fakes/clock";
import { sequentialIds } from "../fakes/id-source";
import { memoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { ENV, NOW } from "./boundary.helpers";

// The four publishing Server Actions (contracts/server-boundary.md rows `publish`,
// `unpublish`, `archive`, `restore`): every one validates `{ id }`, re-checks the session
// and answers the declared shape; `publish` with an empty name lists it; `archive` on a
// draft is `409`. The pipeline is pinned in tests/unit/adapters/pipeline/publish.test.ts.

const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };
const readSession = async (cookies: CookieReader) =>
  cookies.get(SESSION_COOKIE) === undefined ? null : SESSION;
const signedIn = async () => ({ get: () => ({ value: "token" }) });
const signedOut = async () => ({ get: () => undefined });

const PID = "kx3f7q2m";
const PHOTO = photoAsset({ id: "media2aa" });

function publishingDeps() {
  const buckets = createMemoryBuckets();
  return {
    config: { PUBLIC_BASE_URL: "http://localhost:3000" },
    profileStore: createMemoryProfileStore({ buckets }),
    mediaStore: createMemoryMediaStore({ publicBase: "https://cdn.test", buckets }),
    ids: sequentialIds(),
    clock: fixedClock(NOW.toISOString()),
    logger: memoryLogger(),
    readSession,
  };
}

type Deps = ReturnType<typeof publishingDeps>;

async function seed(deps: Deps, doc: ProfileDocument, assets: MediaAsset[] = [PHOTO]) {
  await deps.profileStore.writeDraft(doc.id, doc, {
    name: doc.name,
    line: "",
    thumbnail: null,
    updatedAt: doc.updatedAt,
  });
  for (const asset of assets) await deps.mediaStore.writeAsset(doc.id, asset.id, asset);
}

const READY = document({
  id: PID,
  age: "3 years",
  sex: "female",
  blocks: [hero(), bio("She purrs.")],
});

describe("publish", () => {
  it("answers { url, warnings } and makes the cat live", async () => {
    const deps = publishingDeps();
    await seed(deps, READY);
    expect(await publishWith(deps, { id: PID }, signedIn)).toEqual({
      ok: true,
      url: `http://localhost:3000/cats/charlotte-${PID}`,
      warnings: [],
    });
    expect(await deps.profileStore.readPublished(PID)).not.toBeNull();
  });

  it("with an empty name answers refused and lists it in problems, writing nothing", async () => {
    const deps = publishingDeps();
    await seed(deps, document({ ...READY, name: "" }));
    expect(await publishWith(deps, { id: PID }, signedIn)).toEqual({
      ok: false,
      error: { code: NOT_READY_CODE, message: "One thing missing: Give the cat a name." },
      problems: ["Give the cat a name."],
    });
    expect(await deps.profileStore.readPublished(PID)).toBeNull();
  });

  it("answers invalid for a malformed input, not_found for an unknown cat, unauthorized without a session", async () => {
    const deps = publishingDeps();
    expect(await publishWith(deps, { id: "nope" }, signedIn)).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
    expect(await publishWith(deps, { profileId: PID }, signedIn)).toMatchObject({
      ok: false,
      error: { code: "invalid" },
    });
    expect(await publishWith(deps, { id: PID }, signedIn)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await publishWith(deps, { id: PID }, signedOut)).toEqual({
      ok: false,
      error: { code: "unauthorized", message: SIGN_IN_MESSAGE },
    });
  });
});

describe("unpublish, archive, restore", () => {
  async function live(): Promise<Deps> {
    const deps = publishingDeps();
    await seed(deps, READY);
    await publishWith(deps, { id: PID }, signedIn);
    return deps;
  }

  it("unpublish answers { ok } and the page is gone at once", async () => {
    const deps = await live();
    expect(await unpublishWith(deps, { id: PID }, signedIn)).toEqual({ ok: true });
    expect(await deps.profileStore.readPublished(PID)).toBeNull();
  });

  it("archive answers { ok } from live and 409 refused from a draft", async () => {
    const deps = await live();
    expect(await archiveWith(deps, { id: PID }, signedIn)).toEqual({ ok: true });
    expect(await deps.profileStore.readArchived(PID)).not.toBeNull();
    await unpublishWith(deps, { id: PID }, signedIn);
    expect(await archiveWith(deps, { id: PID }, signedIn)).toEqual({
      ok: false,
      error: { code: "refused", message: "Only a live profile can be archived." },
    });
  });

  it("restore answers { ok, url } from archived and refused from live", async () => {
    const deps = await live();
    await archiveWith(deps, { id: PID }, signedIn);
    expect(await restoreWith(deps, { id: PID }, signedIn)).toEqual({
      ok: true,
      url: `http://localhost:3000/cats/charlotte-${PID}`,
    });
    expect(await restoreWith(deps, { id: PID }, signedIn)).toEqual({
      ok: false,
      error: { code: "refused", message: "Only an archived profile can be restored." },
    });
  });

  it("every action answers invalid for a malformed id and unauthorized without a session", async () => {
    const deps = await live();
    for (const action of [unpublishWith, archiveWith, restoreWith]) {
      expect(await action(deps, { id: "" }, signedIn)).toMatchObject({
        ok: false,
        error: { code: "invalid" },
      });
      expect(await action(deps, { id: PID }, signedOut)).toEqual({
        ok: false,
        error: { code: "unauthorized", message: SIGN_IN_MESSAGE },
      });
    }
    expect(await deps.profileStore.readPublished(PID)).not.toBeNull();
  });
});

describe("loadDraft carries the cat's state and public address", () => {
  it("draft, then live with its url, then archived with the same url", async () => {
    const deps = publishingDeps();
    await seed(deps, READY);
    expect(await loadDraftWith(deps, PID, signedIn)).toMatchObject({
      ok: true,
      state: "draft",
      url: null,
    });
    await publishWith(deps, { id: PID }, signedIn);
    expect(await loadDraftWith(deps, PID, signedIn)).toMatchObject({
      state: "live",
      url: `http://localhost:3000/cats/charlotte-${PID}`,
    });
    await archiveWith(deps, { id: PID }, signedIn);
    expect(await loadDraftWith(deps, PID, signedIn)).toMatchObject({
      state: "archived",
      url: `http://localhost:3000/cats/charlotte-${PID}`,
    });
  });
});

describe("the exported actions", () => {
  it("read Next's cookies: outside a request they answer the generic error", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    vi.stubEnv("LOG_LEVEL", "silent");
    const internal = { ok: false, error: { code: "internal" } };
    expect(await publish({ id: PID })).toMatchObject(internal);
    expect(await unpublish({ id: PID })).toMatchObject(internal);
    expect(await archive({ id: PID })).toMatchObject(internal);
    expect(await restore({ id: PID })).toMatchObject(internal);
    vi.unstubAllEnvs();
  });
});

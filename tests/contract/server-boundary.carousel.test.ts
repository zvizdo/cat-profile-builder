import { describe, expect, it } from "vitest";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { archive, publish } from "@/adapters/pipeline/publish";
import { listCarousel, type CarouselDeps } from "@/app/api/_lib/carousel";
import { UpstreamError } from "@/core/errors";
import type { MediaAsset } from "@/core/media/schema";
import type { ProfileDocument } from "@/core/profile/schema";
import { photoAsset } from "../unit/core/media/builders";
import { bio, document, hero } from "../unit/core/profile/builders";
import { fixedClock } from "../fakes/clock";
import { sequentialIds } from "../fakes/id-source";
import { memoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { errorOf, NOW } from "./boundary.helpers";

// `GET /api/carousel` (contracts/server-boundary.md): public, every live cat and nothing
// else — an archived cat never shows up, and a store failure is the shared `502 upstream`
// shape with no storage detail in the body (constitution → error handling).

const PID = "kx3f7q2m";
const PHOTO = photoAsset({ id: "media2aa" });
const PUBLIC_BASE_URL = "https://cats.example.org";

function deps(): CarouselDeps & ReturnType<typeof buildersDeps> {
  return { ...buildersDeps(), config: { PUBLIC_BASE_URL } };
}

function buildersDeps() {
  const buckets = createMemoryBuckets();
  return {
    profileStore: createMemoryProfileStore({ buckets }),
    mediaStore: createMemoryMediaStore({ publicBase: "https://cdn.test", buckets }),
    ids: sequentialIds(),
    clock: fixedClock(NOW.toISOString()),
    logger: memoryLogger(),
  };
}

async function seed(
  d: ReturnType<typeof deps>,
  doc: ProfileDocument,
  assets: MediaAsset[] = [PHOTO],
) {
  await d.profileStore.writeDraft(doc.id, doc, {
    name: doc.name,
    line: "",
    thumbnail: null,
    updatedAt: doc.updatedAt,
  });
  for (const asset of assets) await d.mediaStore.writeAsset(doc.id, asset.id, asset);
}

const READY = document({
  id: PID,
  age: "3 years",
  sex: "female",
  blocks: [hero(), bio("She purrs at the kettle.")],
});

describe("GET /api/carousel", () => {
  it("answers every live cat, newest first, with no id beyond the address", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    const response = await listCarousel(d);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { cats: unknown[] };
    expect(body.cats).toEqual([
      {
        url: `${PUBLIC_BASE_URL}/cats/charlotte-${PID}`,
        name: "Charlotte",
        line: "She purrs at the kettle.",
        age: "3 years",
        sex: "female",
        photos: [{ src: expect.any(String), alt: PHOTO.alt?.text, focal: PHOTO.focal }],
      },
    ]);
  });

  it("omits an archived cat", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    await archive(d, { profileId: PID });
    const response = await listCarousel(d);
    const body = (await response.json()) as { cats: unknown[] };
    expect(body.cats).toEqual([]);
  });

  it("fails the whole response rather than silently skipping a document that fails to parse", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });

    const OTHER_PID = "kx3f7q2n";
    const other = document({
      id: OTHER_PID,
      age: "1 year",
      sex: "male",
      blocks: [hero(), bio("Naps all day.")],
    });
    await seed(d, other);
    await publish(d, { profileId: OTHER_PID });
    // This app never writes an invalid published.json; corrupting it directly through the
    // store (bypassing publish()'s own validation) is the only way to reach this state, and
    // decision (1) says it is a real failure — the whole response must fail, not silently
    // drop the broken row and answer with just the valid one.
    await d.profileStore.writePublished(OTHER_PID, { not: "a valid published document" });

    const response = await listCarousel(d);
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("invalid");
  });

  it("answers 502 upstream with no store detail when listPublished fails", async () => {
    const d = deps();
    const failing: CarouselDeps = {
      ...d,
      profileStore: {
        ...d.profileStore,
        listPublished: () =>
          Promise.reject(new UpstreamError("The storage service didn't respond.")),
      },
    };
    const response = await listCarousel(failing);
    expect(response.status).toBe(502);
    expect(await errorOf(response)).toEqual({
      code: "upstream",
      message: "The storage service didn't respond.",
    });
  });
});

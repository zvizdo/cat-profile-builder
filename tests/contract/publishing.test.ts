import { describe, expect, it } from "vitest";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { archive, publish, restore, unpublish } from "@/adapters/pipeline/publish";
import { trimVideo } from "@/adapters/pipeline/trim-video";
import { lookupPublished } from "@/app/(public)/cats/[slugAndId]/_lib/lookup";
import type { MediaAsset } from "@/core/media/schema";
import { loadPublished } from "@/core/profile/migrations";
import type { ProfileDocument } from "@/core/profile/schema";
import { indexEntries } from "@/ui/profile/index-entries";
import { fixedClock } from "../fakes/clock";
import { sequentialIds } from "../fakes/id-source";
import { memoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { createScriptedDescriber } from "../fakes/describer";
import { createScriptedVideoProcessor } from "../fakes/video-processor";
import { TRANSCODED_TRIM } from "../unit/adapters/pipeline/video.helpers";
import { photoAsset, videoAsset } from "../unit/core/media/builders";
import { bio, document, hero, video } from "../unit/core/profile/builders";

// What publishing guarantees across the seams (contracts/server-boundary.md → Contract
// tests; ADR-015): the live page is frozen against later edits and re-trims (FR-055),
// restore reproduces the archived bytes (FR-087), the index and the page omit archived
// cats (FR-083, FR-086, FR-090), a renamed cat gets a new slug and its old address is a
// redirect (FR-083), and unpublish from archived leaves a plain draft (FR-092).

const PID = "kx3f7q2m";
const NOW = "2026-09-10T12:00:00.000Z";
const PHOTO = photoAsset({ id: "media2aa" });
const CLIP = videoAsset({ id: "video2aa" });

function deps() {
  const buckets = createMemoryBuckets();
  return {
    config: { PUBLIC_BASE_URL: "https://cats.example.org" },
    profileStore: createMemoryProfileStore({ buckets }),
    mediaStore: createMemoryMediaStore({ publicBase: "https://cdn.test", buckets }),
    videoProcessor: createScriptedVideoProcessor({ transcode: TRANSCODED_TRIM }),
    describer: createScriptedDescriber([{ text: "Rain on the porch." }]),
    ids: sequentialIds(),
    clock: fixedClock(NOW),
    logger: memoryLogger(),
  };
}

type Deps = ReturnType<typeof deps>;

async function seed(d: Deps, doc: ProfileDocument, assets: MediaAsset[] = [PHOTO, CLIP]) {
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
  blocks: [hero(), bio("She purrs."), video()],
});

describe("the live page is frozen (FR-055)", () => {
  it("after trimVideo on a live cat the live page's src is unchanged and the draft's differs", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    const before = loadPublished(await d.profileStore.readPublished(PID));
    const liveSrc = before.media.video2aa?.src;
    await d.mediaStore.putOriginal(PID, "video2aa", new TextEncoder().encode("original bytes"));

    const { asset } = await trimVideo(d, { profileId: PID, mediaId: "video2aa", start: 1, end: 6 });
    const draftSrc = d.mediaStore.publicUrl(PID, "video2aa", "web", asset.revisions.web ?? "");

    const after = loadPublished(await d.profileStore.readPublished(PID));
    expect(after.media.video2aa?.src).toBe(liveSrc);
    expect(draftSrc).not.toBe(liveSrc);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});

describe("archive and restore (FR-086, FR-087)", () => {
  it("restore reproduces the archived bytes; archived cats leave the index and the page", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    const bytes = JSON.stringify(await d.profileStore.readPublished(PID));

    await archive(d, { profileId: PID });
    expect(indexEntries(await d.profileStore.listPublished())).toEqual([]);
    expect(await lookupPublished(d.profileStore, `charlotte-${PID}`)).toEqual({
      kind: "not-found",
    });

    await restore(d, { profileId: PID });
    expect(JSON.stringify(await d.profileStore.readPublished(PID))).toBe(bytes);
    expect(indexEntries(await d.profileStore.listPublished())).toHaveLength(1);
    expect(await lookupPublished(d.profileStore, `charlotte-${PID}`)).toMatchObject({
      kind: "found",
    });
  });

  it("unpublish on an archived cat removes archived.json and the list shows draft (FR-092)", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    await archive(d, { profileId: PID });
    await unpublish(d, { profileId: PID });
    expect(await d.profileStore.readArchived(PID)).toBeNull();
    expect((await d.profileStore.list()).map((row) => row.state)).toEqual(["draft"]);
  });
});

describe("a renamed cat (FR-057, FR-083)", () => {
  it("publishes under a new slug and the old address is a redirect to the current one", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    await seed(d, { ...READY, name: "Charlie" });
    expect(await publish(d, { profileId: PID })).toMatchObject({
      url: `https://cats.example.org/cats/charlie-${PID}`,
    });
    expect(await lookupPublished(d.profileStore, `charlotte-${PID}`)).toEqual({
      kind: "redirect",
      to: `/cats/charlie-${PID}`,
    });
    expect(await lookupPublished(d.profileStore, `charlie-${PID}`)).toMatchObject({
      kind: "found",
    });
  });
});

describe("the public index (FR-090)", () => {
  it("lists live cats most recently published first, with the hero photo, name and line", async () => {
    const d = deps();
    await seed(d, { ...READY, tagline: "A negotiator." });
    await publish(d, { profileId: PID });
    const later = { ...d, clock: fixedClock("2026-09-11T12:00:00.000Z") };
    const other = document({
      id: "zzzzzzz2",
      name: "Milo",
      age: "5 years",
      sex: "male",
      blocks: [hero(), bio("He naps.")],
    });
    await seed(later, other, [PHOTO]);
    await publish(later, { profileId: "zzzzzzz2" });

    expect(indexEntries(await d.profileStore.listPublished())).toEqual([
      {
        href: `/cats/milo-zzzzzzz2`,
        name: "Milo",
        line: "He naps.",
        photo: expect.objectContaining({ kind: "photo", alt: "Charlotte on a windowsill." }),
      },
      {
        href: `/cats/charlotte-${PID}`,
        name: "Charlotte",
        line: "A negotiator.",
        photo: expect.objectContaining({ kind: "photo" }),
      },
    ]);
  });
});

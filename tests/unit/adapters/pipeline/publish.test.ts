import { describe, expect, it } from "vitest";
import { archive, publish, restore, unpublish } from "@/adapters/pipeline/publish";
import { NotFoundError, ProfileInvalidError, RefusedError } from "@/core/errors";
import type { MediaAsset } from "@/core/media/schema";
import { checkReadiness, readinessSummary } from "@/core/profile/readiness";
import { loadPublished } from "@/core/profile/migrations";
import { referencedMediaIds, type ProfileDocument } from "@/core/profile/schema";
import { photoAsset, videoAsset } from "../../core/media/builders";
import {
  bio,
  day,
  document,
  gallery,
  hero,
  needs,
  photo,
  quote,
  video,
} from "../../core/profile/builders";
import { NOW, pipelineDeps, type PipelineDeps } from "./helpers";

// The publish pipeline (ADR-015 → Publish freezes the page; FR-055–FR-060, FR-074,
// FR-086, FR-087): readiness first — every sentence `checkReadiness` can produce comes
// back as a refusal, the contrast warning never blocks — then the slug, the manifest and
// one validated `published.json`. Unpublish, archive and restore move that one object.

const PID = "kx3f7q2m";
const PUBLIC_BASE_URL = "https://cats.example.org";

const PHOTO = photoAsset({ id: "media2aa", fileName: "window.jpg" });
const PHOTO_B = photoAsset({ id: "media2ab", fileName: "nap.jpg" });
const PHOTO_C = photoAsset({ id: "media2ac", fileName: "sun.jpg" });
const CLIP = videoAsset({ id: "video2aa", fileName: "rain.mov" });
const LIBRARY = [PHOTO, PHOTO_B, PHOTO_C, CLIP];

const READY = document({
  id: PID,
  age: "3 years",
  sex: "female",
  blocks: [hero(), bio("She purrs at the kettle."), gallery(), video(), quote()],
});

function deps(): PipelineDeps & { config: { PUBLIC_BASE_URL: string } } {
  return { ...pipelineDeps(), config: { PUBLIC_BASE_URL } };
}

async function seed(
  d: PipelineDeps,
  doc: ProfileDocument,
  assets: readonly MediaAsset[] = LIBRARY,
) {
  await d.profileStore.writeDraft(doc.id, doc, {
    name: doc.name,
    line: "",
    thumbnail: null,
    updatedAt: doc.updatedAt,
  });
  for (const asset of assets) await d.mediaStore.writeAsset(doc.id, asset.id, asset);
}

describe("publish", () => {
  it("writes a validated published.json with publishedAt, the slug and the manifest, and answers the address", async () => {
    const d = deps();
    await seed(d, READY);
    const result = await publish(d, { profileId: PID });
    expect(result).toEqual({
      published: true,
      url: `${PUBLIC_BASE_URL}/cats/charlotte-${PID}`,
      warnings: [],
    });
    const stored = loadPublished(await d.profileStore.readPublished(PID));
    expect(stored.publishedAt).toBe(NOW);
    expect(stored.slug).toBe("charlotte");
    expect(Object.keys(stored.media).sort()).toEqual(referencedMediaIds(READY).sort());
    expect(stored.media.media2aa?.src).toBe(
      `https://cdn.test/profiles/${PID}/media/media2aa/clean.a1b2c3d4e5.jpg`,
    );
    expect(stored.media.video2aa?.kind).toBe("video");
    expect(await d.profileStore.readDraft(PID)).toEqual(READY);
  });

  it("covers exactly the referenced ids, not the whole library", async () => {
    const d = deps();
    await seed(
      d,
      document({ id: PID, age: "3 years", sex: "female", blocks: [hero(), bio("Hi.")] }),
    );
    await publish(d, { profileId: PID });
    const stored = loadPublished(await d.profileStore.readPublished(PID));
    expect(Object.keys(stored.media)).toEqual(["media2aa"]);
  });

  it("slugs the current name, so a renamed cat gets a new slug at the same id", async () => {
    const d = deps();
    await seed(d, document({ ...READY, name: "Zoë O'Neil" }));
    expect(await publish(d, { profileId: PID })).toMatchObject({
      url: `${PUBLIC_BASE_URL}/cats/zoe-oneil-${PID}`,
    });
  });

  it("strips a trailing slash from the public base", async () => {
    const d = { ...deps(), config: { PUBLIC_BASE_URL: `${PUBLIC_BASE_URL}/` } };
    await seed(d, READY);
    expect(await publish(d, { profileId: PID })).toMatchObject({
      url: `${PUBLIC_BASE_URL}/cats/charlotte-${PID}`,
    });
  });

  it("replaces an archive: publishing an archived cat leaves it live, never both", async () => {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    await archive(d, { profileId: PID });
    await publish(d, { profileId: PID });
    expect(await d.profileStore.readArchived(PID)).toBeNull();
    expect(await d.profileStore.readPublished(PID)).not.toBeNull();
  });

  it("answers the contrast warning without blocking (FR-031, Waiver 3)", async () => {
    const d = deps();
    await seed(d, document({ ...READY, theme: { preset: "sand", warmth: 0.5, contrast: 0 } }));
    expect(await publish(d, { profileId: PID })).toEqual({
      published: true,
      url: `${PUBLIC_BASE_URL}/cats/charlotte-${PID}`,
      warnings: ["The text may be hard to read on this background."],
    });
    expect(await d.profileStore.readPublished(PID)).not.toBeNull();
  });

  it("is not_found for an unknown cat and invalid for a draft that fails its schema", async () => {
    const d = deps();
    await expect(publish(d, { profileId: PID })).rejects.toBeInstanceOf(NotFoundError);
    await d.profileStore.writeDraft(
      PID,
      { schemaVersion: 1, id: PID, blocks: "nope" },
      { name: "", line: "", thumbnail: null, updatedAt: NOW },
    );
    await expect(publish(d, { profileId: PID })).rejects.toBeInstanceOf(ProfileInvalidError);
  });
});

describe("publish refuses with every readiness problem (FR-060, FR-074)", () => {
  const undescribed = { ...PHOTO, alt: null };
  const processing = { ...PHOTO, status: "processing" as const };
  const needsTrim: MediaAsset = {
    ...CLIP,
    status: "needs-trim",
    revisions: {},
    alt: null,
    descriptionStatus: "pending",
    trim: undefined,
    durationSeconds: undefined,
  };
  const cases: Array<[string, ProfileDocument, MediaAsset[]]> = [
    ["Give the cat a name.", document({ ...READY, name: " " }), LIBRARY],
    ["The hero has no photo.", document({ id: PID, blocks: [hero(null)] }), LIBRARY],
    [
      "The photo section has no photo.",
      document({ id: PID, blocks: [hero(), photo(null)] }),
      LIBRARY,
    ],
    [
      "The video section has no clip.",
      document({ id: PID, blocks: [hero(), video(null)] }),
      LIBRARY,
    ],
    ["The quote has no photo.", document({ id: PID, blocks: [hero(), quote(null)] }), LIBRARY],
    ["The bio is empty.", document({ id: PID, blocks: [hero(), bio()] }), LIBRARY],
    ["The gallery has no photos.", document({ id: PID, blocks: [hero(), gallery([])] }), LIBRARY],
    [
      "Scene 2 of 'A day in her life' needs a photo and a caption.",
      document({ id: PID, sex: "female", blocks: [hero(), day()] }),
      LIBRARY,
    ],
    [
      "Card 1 of 'What she needs' is empty.",
      document({
        id: PID,
        sex: "female",
        blocks: [hero(), needs([{ title: "Quiet", text: " " }])],
      }),
      LIBRARY,
    ],
    ["A photo or clip is missing from the library.", document({ id: PID, blocks: [hero()] }), []],
    ["Write a description for window.jpg.", document({ id: PID, blocks: [hero()] }), [undescribed]],
    ["window.jpg is still processing.", document({ id: PID, blocks: [hero()] }), [processing]],
    [
      "Trim rain.mov to 15 seconds or less.",
      document({ id: PID, blocks: [hero(), video()] }),
      [needsTrim],
    ],
    [
      "window.jpg is a photo, but the video section needs a clip.",
      document({ id: PID, blocks: [hero(), video("media2aa")] }),
      [PHOTO],
    ],
    [
      "rain.mov is a clip, but this section needs a photo.",
      document({ id: PID, blocks: [hero("video2aa")] }),
      [CLIP],
    ],
  ];

  it.each(cases)("%s", async (sentence, doc, assets) => {
    const d = deps();
    await seed(d, doc, assets);
    const expected = checkReadiness(doc, assets).problems;
    expect(expected).toContain(sentence);
    expect(await publish(d, { profileId: PID })).toEqual({
      published: false,
      problems: expected,
    });
    expect(await d.profileStore.readPublished(PID)).toBeNull();
  });

  it("lists every problem at once, in document order", async () => {
    const d = deps();
    const doc = document({ id: PID, name: "", blocks: [hero(null), bio()] });
    await seed(d, doc);
    expect(await publish(d, { profileId: PID })).toEqual({
      published: false,
      problems: [
        "Give the cat a name.",
        "Add their age.",
        "Say whether the cat is female or male.",
        "The hero has no photo.",
        "The bio is empty.",
      ],
    });
  });
});

describe("readinessSummary", () => {
  it("counts what is missing in words, then lists the sentences", () => {
    expect(readinessSummary(["Give the cat a name."])).toBe(
      "One thing missing: Give the cat a name.",
    );
    expect(readinessSummary(["Give the cat a name.", "The bio is empty."])).toBe(
      "Two things missing: Give the cat a name. The bio is empty.",
    );
    expect(readinessSummary(Array.from({ length: 13 }, (_, i) => `Problem ${i}.`))).toMatch(
      /^13 things missing: Problem 0\./,
    );
  });
});

describe("unpublish, archive, restore", () => {
  async function live(): Promise<ReturnType<typeof deps>> {
    const d = deps();
    await seed(d, READY);
    await publish(d, { profileId: PID });
    return d;
  }

  it("unpublish removes published.json at once and keeps the draft", async () => {
    const d = await live();
    expect(await unpublish(d, { profileId: PID })).toEqual({});
    expect(await d.profileStore.readPublished(PID)).toBeNull();
    expect(await d.profileStore.readDraft(PID)).toEqual(READY);
    expect((await d.profileStore.list())[0]?.state).toBe("draft");
  });

  it("unpublish on an archived cat removes archived.json, so the list shows draft", async () => {
    const d = await live();
    await archive(d, { profileId: PID });
    await unpublish(d, { profileId: PID });
    expect(await d.profileStore.readArchived(PID)).toBeNull();
    expect(await d.profileStore.readPublished(PID)).toBeNull();
    expect((await d.profileStore.list())[0]?.state).toBe("draft");
  });

  it("unpublish on a draft changes nothing; an unknown cat is not_found", async () => {
    const d = deps();
    await seed(d, READY);
    expect(await unpublish(d, { profileId: PID })).toEqual({});
    await expect(unpublish(d, { profileId: "zzzzzzzz" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("archive moves the page out of the public store; only a live cat can be archived", async () => {
    const d = await live();
    const page = await d.profileStore.readPublished(PID);
    expect(await archive(d, { profileId: PID })).toEqual({});
    expect(await d.profileStore.readPublished(PID)).toBeNull();
    expect(await d.profileStore.readArchived(PID)).toEqual(page);
    await expect(archive(d, { profileId: PID })).rejects.toThrow(
      new RefusedError("Only a live profile can be archived."),
    );
    await expect(archive(d, { profileId: "zzzzzzzz" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("restore brings the exact bytes back and answers the address; only an archived cat can be restored", async () => {
    const d = await live();
    const page = JSON.stringify(await d.profileStore.readPublished(PID));
    await archive(d, { profileId: PID });
    expect(await restore(d, { profileId: PID })).toEqual({
      url: `${PUBLIC_BASE_URL}/cats/charlotte-${PID}`,
    });
    expect(JSON.stringify(await d.profileStore.readPublished(PID))).toBe(page);
    expect(await d.profileStore.readArchived(PID)).toBeNull();
    await expect(restore(d, { profileId: PID })).rejects.toThrow(
      new RefusedError("Only an archived profile can be restored."),
    );
    await expect(restore(d, { profileId: "zzzzzzzz" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createFakeDescriber } from "@/adapters/fake/describer";
import { createFfmpegVideoProcessor } from "@/adapters/ffmpeg/video-processor";
import { createFsMediaStore, type FsMediaStore } from "@/adapters/fs/media-store";
import { createFsProfileStore } from "@/adapters/fs/profile-store";
import { randomIds } from "@/adapters/ids";
import { createLogger } from "@/adapters/logger";
import { finalizeUpload } from "@/adapters/pipeline/finalize-upload";
import { listMetadata } from "@/adapters/pipeline/list-metadata";
import { archive, publish } from "@/adapters/pipeline/publish";
import { readAssets } from "@/adapters/pipeline/read-assets";
import { trimVideo } from "@/adapters/pipeline/trim-video";
import type { Describer, IdSource, ProfileStore, VideoProcessor, Logger } from "@/core/ports";
import type { Block, ProfileDocument } from "@/core/profile/schema";

// `pnpm seed --published N --archived M` (T041): writes N live and M archived cats through
// the real upload and publish pipeline — the same code a volunteer's browser drives — so
// every document under DATA_DIR is a valid PublishedDocument with real derived files on
// disk, not hand-written JSON. Run with `tsx --conditions=react-server` (see the `seed`
// script in package.json): the adapters import the `server-only` marker package, which
// only resolves under the `react-server` export condition Next itself supplies at
// dev/build time — this flag gives tsx the same condition outside of Next.
//
// Every run adds fresh cats (fresh random ids) rather than wiping what is there, so running
// it against a `.data` a volunteer has been clicking around in is safe. The live set always
// includes one single-photo, no-video cat ("Solo") and one cat with a clip trimmed to 15s
// ("Clip") when at least two live cats are requested.

const FIXTURES_DIR = resolve("tests/fixtures");
const PHOTOS = ["cat-1.jpg", "cat-2.jpg", "cat-3.jpg", "small.jpg"] as const;
const CLIP_FILE = "clip-20s.mp4";
const CLIP_TRIM_SECONDS = 15;

const NAMES = [
  "Charlotte",
  "Milo",
  "Luna",
  "Oscar",
  "Bella",
  "Leo",
  "Nala",
  "Simba",
  "Willow",
  "Tigger",
  "Daisy",
  "Jasper",
  "Ivy",
  "Felix",
  "Coco",
  "Shadow",
  "Pepper",
  "Olive",
  "Biscuit",
  "Clementine",
] as const;

const AGES = [
  "4 months",
  "10 months",
  "1 year",
  "2 years",
  "3 years",
  "5 years",
  "7 years",
  "9 years",
];

const TAGLINES = [
  "Loves a sunny windowsill.",
  "Will trade purrs for treats.",
  "A professional box-sitter.",
  "Follows you room to room.",
  "Naps like it's an Olympic sport.",
  "Talks back, politely.",
  "Best friends with the mail slot.",
  "Curls up wherever you just sat down.",
];

/** What one seeded cat needs; `archive` moves it to the archived bucket after publishing. */
interface CatSpec {
  name: string;
  age: string;
  sex: "female" | "male";
  tagline: string;
  photos: readonly string[];
  clip?: { file: string; trimEnd: number };
  archive: boolean;
}

/** What seeding a cat takes: the real fs adapters and the real fake-model pipeline. */
interface SeedDeps {
  profileStore: ProfileStore;
  mediaStore: FsMediaStore;
  videoProcessor: VideoProcessor;
  describer: Describer;
  clock: { now: () => Date };
  logger: Logger;
  config: { PUBLIC_BASE_URL: string };
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** A name from the fixed list, cycling with a numeric suffix once the list is exhausted. */
function nameFor(i: number): string {
  const base = NAMES[i % NAMES.length]!;
  const cycle = Math.floor(i / NAMES.length);
  return cycle === 0 ? base : `${base} ${cycle + 1}`;
}

/** `count` fixture photos, starting at a different point in the cycle per cat for variety. */
function photosFor(i: number, count: number): string[] {
  return Array.from({ length: count }, (_, k) => PHOTOS[(i + k) % PHOTOS.length]!);
}

/** The plain "regular" cat at position `i`: a name, facts and one to three photos. */
function regularSpec(i: number, archiveIt: boolean): CatSpec {
  return {
    name: nameFor(i),
    age: AGES[i % AGES.length]!,
    sex: i % 2 === 0 ? "female" : "male",
    tagline: TAGLINES[i % TAGLINES.length]!,
    photos: photosFor(i, 1 + (i % 3)),
    archive: archiveIt,
  };
}

/** The live set (FR-061, FR-084's demo needs): "Solo" and "Clip" first, then regular cats. */
function liveSpecs(count: number): CatSpec[] {
  const specs: CatSpec[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) specs.push({ ...regularSpec(i, false), name: "Solo", photos: [PHOTOS[0]!] });
    else if (i === 1) {
      specs.push({
        ...regularSpec(i, false),
        name: "Clip",
        photos: [PHOTOS[1]!],
        clip: { file: CLIP_FILE, trimEnd: CLIP_TRIM_SECONDS },
      });
    } else specs.push(regularSpec(i, false));
  }
  return specs;
}

function archivedSpecs(count: number, offset: number): CatSpec[] {
  return Array.from({ length: count }, (_, k) => regularSpec(offset + k, true));
}

async function uploadPhoto(
  deps: SeedDeps,
  pid: string,
  mid: string,
  fixtureFile: string,
): Promise<void> {
  const bytes = await readFile(join(FIXTURES_DIR, fixtureFile));
  await deps.mediaStore.putOriginal(pid, mid, bytes);
  await finalizeUpload(deps, {
    profileId: pid,
    mediaId: mid,
    fileName: fixtureFile,
    declaredType: "image/jpeg",
  });
}

/** Uploads the clip and trims it to `trimEnd` seconds when the original is over 15s. */
async function uploadClip(
  deps: SeedDeps,
  pid: string,
  mid: string,
  clip: { file: string; trimEnd: number },
): Promise<void> {
  const bytes = await readFile(join(FIXTURES_DIR, clip.file));
  await deps.mediaStore.putOriginal(pid, mid, bytes);
  const result = await finalizeUpload(deps, {
    profileId: pid,
    mediaId: mid,
    fileName: clip.file,
    declaredType: "video/mp4",
  });
  if (result.asset.status === "needs-trim") {
    await trimVideo(deps, { profileId: pid, mediaId: mid, start: 0, end: clip.trimEnd });
  }
}

/** Every media block a spec's extra photos and clip need, after the hero. */
async function extraBlocks(
  deps: SeedDeps,
  ids: IdSource,
  pid: string,
  spec: CatSpec,
): Promise<Block[]> {
  const blocks: Block[] = [];
  const extraIds: string[] = [];
  for (const file of spec.photos.slice(1)) {
    const mid = ids.mediaId();
    await uploadPhoto(deps, pid, mid, file);
    extraIds.push(mid);
  }
  if (extraIds.length === 1)
    blocks.push({ id: ids.blockId(), type: "photo", mediaId: extraIds[0]! });
  else if (extraIds.length > 1)
    blocks.push({ id: ids.blockId(), type: "gallery", mediaIds: extraIds });
  if (spec.clip !== undefined) {
    const vid = ids.mediaId();
    await uploadClip(deps, pid, vid, spec.clip);
    blocks.push({ id: ids.blockId(), type: "video", mediaId: vid });
  }
  return blocks;
}

/** Uploads every photo and the clip, writes the draft and publishes (and archives) it. */
async function seedCat(deps: SeedDeps, ids: IdSource, spec: CatSpec): Promise<void> {
  const pid = ids.profileId();
  const heroMediaId = ids.mediaId();
  await uploadPhoto(deps, pid, heroMediaId, spec.photos[0]!);
  const blocks: Block[] = [
    { id: ids.blockId(), type: "hero", mediaId: heroMediaId },
    ...(await extraBlocks(deps, ids, pid, spec)),
  ];
  const updatedAt = deps.clock.now().toISOString();
  const doc: ProfileDocument = {
    schemaVersion: 1,
    id: pid,
    name: spec.name,
    age: spec.age,
    sex: spec.sex,
    tagline: spec.tagline,
    blocks,
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt,
  };
  const assets = await readAssets(deps, pid);
  await deps.profileStore.writeDraft(pid, doc, { ...listMetadata(doc, assets), updatedAt });
  const result = await publish(deps, { profileId: pid });
  if (!result.published) {
    throw new Error(
      `Seed cat "${spec.name}" (${pid}) failed readiness: ${result.problems.join(" ")}`,
    );
  }
  if (spec.archive) await archive(deps, { profileId: pid });
  print(
    `${spec.archive ? "archived" : "published"}  ${spec.name.padEnd(16)} ${pid}  ${result.url}`,
  );
}

/** `--published N --archived M`, defaulting either to 0. */
function parseArgs(argv: readonly string[]): { published: number; archived: number } {
  let published = 0;
  let archived = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--published") published = Number(argv[++i]);
    if (argv[i] === "--archived") archived = Number(argv[++i]);
  }
  return { published, archived };
}

function buildDeps(): SeedDeps {
  const root = resolve(process.env.DATA_DIR ?? ".data");
  const logger = createLogger({ level: "silent" });
  return {
    profileStore: createFsProfileStore({ root }),
    mediaStore: createFsMediaStore({ root }),
    videoProcessor: createFfmpegVideoProcessor({ logger }),
    describer: createFakeDescriber({}),
    clock: { now: () => new Date() },
    logger,
    config: { PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000" },
  };
}

async function main(): Promise<void> {
  const { published, archived } = parseArgs(process.argv.slice(2));
  const deps = buildDeps();
  const ids = randomIds();
  const specs = [...liveSpecs(published), ...archivedSpecs(archived, published)];
  for (const spec of specs) await seedCat(deps, ids, spec);
  print(`\nSeeded ${specs.length} cats (${published} published, ${archived} archived).`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

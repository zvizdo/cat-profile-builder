import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe } from "vitest";
import { metaPath, privatePath, writeJson } from "@/adapters/fs/layout";
import { createFsMediaStore } from "@/adapters/fs/media-store";
import { createFsProfileStore } from "@/adapters/fs/profile-store";
import type { GcsBuckets } from "@/adapters/gcs/client";
import { createGcsClient } from "@/adapters/gcs/client";
import { createGcsMediaStore } from "@/adapters/gcs/media-store";
import { createGcsProfileStore } from "@/adapters/gcs/profile-store";
import { documentName, PROFILES_PREFIX, objectName } from "@/core/media/paths";
import { createMemoryBuckets, encodeJson, type MemoryBuckets } from "../fakes/bucket";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createFakeBuckets } from "../fakes/gcs-bucket";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { runMediaStoreContract, runProfileStoreContract, type StoreFactory } from "./stores.suite";

/** Plants a draft's document and metadata directly in a memory bucket, bypassing `metadataOf`. */
function writeRawDraftToMemory(
  buckets: MemoryBuckets,
  pid: string,
  doc: unknown,
  metadata: Record<string, string>,
): Promise<void> {
  buckets.privateBucket.put(documentName(pid, "draft"), encodeJson(doc), metadata);
  return Promise.resolve();
}

/** Plants a draft's document and metadata sidecar directly on disk, bypassing `metadataOf`. */
async function writeRawDraftToFs(
  root: string,
  pid: string,
  doc: unknown,
  metadata: Record<string, string>,
): Promise<void> {
  const file = privatePath(root, documentName(pid, "draft"));
  await writeJson(file, doc);
  await writeJson(metaPath(file), metadata);
}

/** Plants a draft's document and metadata directly in a GCS(-shaped) bucket, bypassing `metadataOf`. */
async function writeRawDraftToGcs(
  buckets: Pick<GcsBuckets, "privateBucket">,
  pid: string,
  doc: unknown,
  metadata: Record<string, string>,
): Promise<void> {
  await buckets.privateBucket.file(documentName(pid, "draft")).save(encodeJson(doc), {
    contentType: "application/json",
    resumable: false,
    metadata: { metadata },
  });
}

// Registers every store implementation with the shared port suite. `memory` is the fake unit
// and contract tests use; `fs` runs over a fresh temporary DATA_DIR per test; `gcs (double)`
// runs the GCS adapter over the in-memory bucket double, so its code paths are covered
// without credentials; `gcs` proper runs only when the bucket names are in the environment
// (T046 turns it on once the buckets exist) and is tagged `@gcs` so it can be picked out.

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const factories: Array<[string, StoreFactory]> = [
  [
    "memory",
    () => {
      const buckets = createMemoryBuckets();
      const media = createMemoryMediaStore({ publicBase: "https://cdn.test", buckets });
      return {
        profiles: createMemoryProfileStore({ buckets }),
        media,
        putOriginal: (pid, mid, bytes) => media.putOriginal(pid, mid, bytes),
        writeRawDraft: (pid, doc, metadata) => writeRawDraftToMemory(buckets, pid, doc, metadata),
      };
    },
  ],
  [
    "fs",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "cpb-fs-"));
      roots.push(root);
      const media = createFsMediaStore({ root });
      return {
        profiles: createFsProfileStore({ root }),
        media,
        putOriginal: (pid, mid, bytes) => media.putOriginal(pid, mid, bytes),
        writeRawDraft: (pid, doc, metadata) => writeRawDraftToFs(root, pid, doc, metadata),
      };
    },
  ],
];

factories.push([
  "gcs (double)",
  () => {
    const buckets = createFakeBuckets();
    return {
      profiles: createGcsProfileStore(buckets),
      media: createGcsMediaStore(buckets),
      putOriginal: (pid, mid, bytes) =>
        buckets.privateBucket.file(objectName(pid, mid, "original")).save(bytes),
      writeRawDraft: (pid, doc, metadata) => writeRawDraftToGcs(buckets, pid, doc, metadata),
    };
  },
]);

describe.each(factories)("stores: %s", (name, factory) => {
  runProfileStoreContract(name, factory);
  runMediaStoreContract(name, factory);
});

const gcsEnv = {
  GCS_PRIVATE_BUCKET: process.env.GCS_PRIVATE_BUCKET,
  GCS_PUBLIC_BUCKET: process.env.GCS_PUBLIC_BUCKET,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
};
const gcsReady =
  process.env.GCS_CONTRACT_BUCKETS === "1" &&
  gcsEnv.GCS_PRIVATE_BUCKET !== undefined &&
  gcsEnv.GCS_PUBLIC_BUCKET !== undefined &&
  gcsEnv.GOOGLE_CLOUD_PROJECT !== undefined;

/** The suffix both bucket names must carry before this suite will empty them. */
const TEST_BUCKET_SUFFIX = "-test";

/**
 * The bucket names, or a refusal: this suite wipes `profiles/` in both buckets before every
 * test, so it only ever runs against buckets named for it (controller ruling, T016).
 */
function testBuckets(): { privateName: string; publicName: string } {
  const privateName = gcsEnv.GCS_PRIVATE_BUCKET ?? "";
  const publicName = gcsEnv.GCS_PUBLIC_BUCKET ?? "";
  if (!privateName.endsWith(TEST_BUCKET_SUFFIX) || !publicName.endsWith(TEST_BUCKET_SUFFIX)) {
    throw new Error(
      `The @gcs contract suite empties both buckets, so it only runs against buckets whose names end in "${TEST_BUCKET_SUFFIX}"; got "${privateName}" and "${publicName}".`,
    );
  }
  return { privateName, publicName };
}

// Runs against real buckets, and only with GCS_CONTRACT_BUCKETS=1 and both names ending in
// `-test`: every profile in them is wiped before each test so the suite starts from an empty
// backing, as the port contract assumes. T046 turns it on once the buckets exist.
(gcsReady ? describe : describe.skip)(
  "stores: gcs @gcs (real buckets; GCS_CONTRACT_BUCKETS=1 and names ending in -test only)",
  () => {
    const factory: StoreFactory = async () => {
      const { privateName, publicName } = testBuckets();
      const buckets = createGcsClient({
        GOOGLE_CLOUD_PROJECT: gcsEnv.GOOGLE_CLOUD_PROJECT,
        GCS_PRIVATE_BUCKET: privateName,
        GCS_PUBLIC_BUCKET: publicName,
      });
      await buckets.privateBucket.deleteFiles({ prefix: PROFILES_PREFIX });
      await buckets.publicBucket.deleteFiles({ prefix: PROFILES_PREFIX });
      return {
        profiles: createGcsProfileStore(buckets),
        media: createGcsMediaStore(buckets),
        putOriginal: (pid, mid, bytes) =>
          buckets.privateBucket.file(objectName(pid, mid, "original")).save(Buffer.from(bytes)),
        writeRawDraft: (pid, doc, metadata) => writeRawDraftToGcs(buckets, pid, doc, metadata),
      };
    };
    runProfileStoreContract("gcs", factory);
    runMediaStoreContract("gcs", factory);
  },
);

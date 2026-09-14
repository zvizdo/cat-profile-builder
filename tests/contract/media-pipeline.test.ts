import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, type CookieReader } from "@/adapters/auth/session";
import { createFfmpegVideoProcessor } from "@/adapters/ffmpeg/video-processor";
import { createFsMediaStore } from "@/adapters/fs/media-store";
import { createFsProfileStore } from "@/adapters/fs/profile-store";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { beginUpload } from "@/adapters/pipeline/begin-upload";
import { deleteMedia } from "@/adapters/pipeline/delete-media";
import { setAltText, setFocalPoint } from "@/adapters/pipeline/edit-asset";
import { finalizeUpload } from "@/adapters/pipeline/finalize-upload";
import { clearTrim, trimVideo } from "@/adapters/pipeline/trim-video";
import { acceptDevUpload } from "@/app/api/_lib/dev-upload";
import { loadAsset } from "@/core/media/migrations";
import { MediaAssetSchema } from "@/core/media/schema";
import type { MediaStore, ProfileStore } from "@/core/ports";
import { fixedClock } from "../fakes/clock";
import { createScriptedDescriber } from "../fakes/describer";
import { sequentialIds } from "../fakes/id-source";
import { memoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { createScriptedVideoProcessor } from "../fakes/video-processor";
import { NOW } from "./boundary.helpers";

// The upload pipeline end to end (ADR-005, ADR-006): begin → the bytes land the way a
// browser lands them → finalize → the record validates and reads back — over the memory
// store, and over a real temporary DATA_DIR where the bytes go through the dev upload route
// exactly as the filesystem store's signed URL sends a browser there. The video run uses
// the real ffmpeg (skipped, saying so, where it is absent): web and poster land on disk
// under DATA_DIR/public, the web clip has no audio stream and stands upright.

const PID = "abcdefgh";
const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };
const readSession = async (cookies: CookieReader) =>
  cookies.get(SESSION_COOKIE) === undefined ? null : SESSION;

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

function ffmpegAvailable(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** ffprobe's view of a file on disk: stream types and sizes, rotation side data, duration. */
function probeFile(path: string) {
  const stdout = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "stream=codec_type,width,height:stream_side_data=rotation:format=duration",
      path,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(stdout) as {
    streams: Array<{
      codec_type: string;
      width?: number;
      height?: number;
      side_data_list?: unknown[];
    }>;
    format: { duration: string };
  };
}

function depsOver(stores: { profileStore: ProfileStore; mediaStore: MediaStore }) {
  return {
    ...stores,
    describer: createScriptedDescriber([{ text: "A grey cat on a step." }]),
    videoProcessor: createScriptedVideoProcessor({}),
    clock: fixedClock(NOW.toISOString()),
    ids: sequentialIds(),
    logger: memoryLogger(),
    readSession,
  };
}

async function seed(deps: Pick<ReturnType<typeof depsOver>, "profileStore">) {
  const doc = {
    schemaVersion: 1,
    id: PID,
    name: "Charlotte",
    blocks: [],
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt: NOW.toISOString(),
  };
  await deps.profileStore.writeDraft(PID, doc, {
    name: "Charlotte",
    line: "",
    thumbnail: null,
    updatedAt: NOW.toISOString(),
  });
}

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("media pipeline over the memory store", () => {
  it("begin → upload → finalize yields a record that validates and reads back", async () => {
    const buckets = createMemoryBuckets();
    const mediaStore = createMemoryMediaStore({ publicBase: "https://cdn.test", buckets });
    const deps = depsOver({ profileStore: createMemoryProfileStore({ buckets }), mediaStore });
    await seed(deps);
    const bytes = fixture("cat-2.jpg");

    const begun = await beginUpload(deps, {
      profileId: PID,
      fileName: "cat-2.jpg",
      byteSize: bytes.byteLength,
      declaredType: "image/jpeg",
    });
    expect(begun).toMatchObject({ mediaId: "maaaaaab", method: "PUT", headers: {} });
    await mediaStore.putOriginal(PID, begun.mediaId, bytes);

    const { asset, warnings } = await finalizeUpload(deps, {
      profileId: PID,
      mediaId: begun.mediaId,
      fileName: "cat-2.jpg",
      declaredType: "image/jpeg",
    });
    expect(warnings).toEqual([]);
    expect(MediaAssetSchema.parse(asset)).toEqual(asset);
    expect(loadAsset(await mediaStore.readAsset(PID, begun.mediaId))).toEqual(asset);
    expect(await mediaStore.listMedia(PID)).toEqual([begun.mediaId]);
    expect(
      await mediaStore.readDerived(PID, begun.mediaId, "clean", asset.revisions.clean ?? ""),
    ).not.toBeNull();
    expect(mediaStore.publicUrl(PID, begun.mediaId, "clean", asset.revisions.clean ?? "")).toBe(
      `https://cdn.test/profiles/${PID}/media/${begun.mediaId}/clean.${asset.revisions.clean}.jpg`,
    );
  });
});

describe("media pipeline over a temporary DATA_DIR (STORE=fs)", () => {
  it("begin → PUT to the dev upload URL → finalize → focal → alt → delete", async () => {
    const root = await mkdtemp(join(tmpdir(), "cpb-pipeline-"));
    roots.push(root);
    const deps = {
      ...depsOver({
        profileStore: createFsProfileStore({ root }),
        mediaStore: createFsMediaStore({ root }),
      }),
      config: { STORE: "fs" as const, DATA_DIR: root },
    };
    await seed(deps);
    const bytes = fixture("cat-3.jpg");

    const begun = await beginUpload(deps, {
      profileId: PID,
      fileName: "cat-3.jpg",
      byteSize: bytes.byteLength,
      declaredType: "image/jpeg",
    });
    expect(begun.uploadUrl).toBe(`/api/dev-upload/${PID}/${begun.mediaId}`);
    expect(begun.method).toBe("PUT");

    // The browser's PUT, as the fs store's URL directs it.
    const [, , , id, mid] = begun.uploadUrl.split("/") as [string, string, string, string, string];
    const request = new NextRequest(`http://localhost:3000${begun.uploadUrl}`, {
      method: begun.method,
      headers: { ...begun.headers, cookie: `${SESSION_COOKIE}=t` },
      body: new Uint8Array(bytes),
    });
    expect((await acceptDevUpload(deps, request, { id, mid })).status).toBe(200);
    expect(await deps.mediaStore.originalSize(PID, mid)).toBe(bytes.byteLength);

    const { asset } = await finalizeUpload(deps, {
      profileId: PID,
      mediaId: mid,
      fileName: "cat-3.jpg",
      declaredType: "image/jpeg",
    });
    expect(asset).toMatchObject({ status: "ready", alt: { source: "model" } });
    expect(loadAsset(await deps.mediaStore.readAsset(PID, mid))).toEqual(asset);

    const focal = await setFocalPoint(deps, {
      profileId: PID,
      mediaId: mid,
      focal: { x: 30, y: 70 },
    });
    expect(focal.asset.focal).toEqual({ x: 30, y: 70 });
    const alt = await setAltText(deps, {
      profileId: PID,
      mediaId: mid,
      text: "Charlotte on the step.",
    });
    expect(alt.asset).toMatchObject({
      focal: { x: 30, y: 70 },
      alt: { text: "Charlotte on the step.", source: "volunteer" },
    });
    expect(loadAsset(await deps.mediaStore.readAsset(PID, mid))).toEqual(alt.asset);

    await deleteMedia(deps, { profileId: PID, mediaId: mid });
    expect(await deps.mediaStore.readAsset(PID, mid)).toBeNull();
    expect(await deps.mediaStore.originalSize(PID, mid)).toBeNull();
    expect(await deps.mediaStore.listMedia(PID)).toEqual([]);
  });
});

describe.skipIf(!ffmpegAvailable())(
  "video pipeline over a temporary DATA_DIR with the real ffmpeg (@ffmpeg — skipped: not on PATH)",
  () => {
    it("begin → PUT → finalize → ready clip on disk, silent and upright; trim → new revs; clearTrim", async () => {
      const root = await mkdtemp(join(tmpdir(), "cpb-video-"));
      roots.push(root);
      const deps = {
        ...depsOver({
          profileStore: createFsProfileStore({ root }),
          mediaStore: createFsMediaStore({ root }),
        }),
        videoProcessor: createFfmpegVideoProcessor({ logger: memoryLogger() }),
        config: { STORE: "fs" as const, DATA_DIR: root },
      };
      await seed(deps);
      const bytes = fixture("clip-2s.mp4");

      const begun = await beginUpload(deps, {
        profileId: PID,
        fileName: "clip-2s.mp4",
        byteSize: bytes.byteLength,
        declaredType: "video/mp4",
      });
      const [, , , id, mid] = begun.uploadUrl.split("/") as [
        string,
        string,
        string,
        string,
        string,
      ];
      const request = new NextRequest(`http://localhost:3000${begun.uploadUrl}`, {
        method: begun.method,
        headers: { ...begun.headers, cookie: `${SESSION_COOKIE}=t` },
        body: new Uint8Array(bytes),
      });
      expect((await acceptDevUpload(deps, request, { id, mid })).status).toBe(200);

      const { asset } = await finalizeUpload(deps, {
        profileId: PID,
        mediaId: mid,
        fileName: "clip-2s.mp4",
        declaredType: "video/mp4",
      });
      expect(asset).toMatchObject({
        kind: "video",
        status: "ready",
        width: 1080,
        height: 1920,
        originalDurationSeconds: 2,
        alt: { text: "A grey cat on a step.", source: "model" },
      });
      expect(asset.durationSeconds).toBeCloseTo(2, 1);
      expect(loadAsset(await deps.mediaStore.readAsset(PID, mid))).toEqual(asset);

      const folder = join(root, "public", "profiles", PID, "media", mid);
      const files = await readdir(folder);
      expect(files).toEqual(
        expect.arrayContaining([
          `web.${asset.revisions.web}.mp4`,
          `poster.${asset.revisions.poster}.jpg`,
        ]),
      );
      const web = probeFile(join(folder, `web.${asset.revisions.web}.mp4`));
      expect(web.streams.map((stream) => stream.codec_type)).toEqual(["video"]);
      expect(web.streams[0]).toMatchObject({ width: 1080, height: 1920 });
      expect(web.streams[0]?.side_data_list).toBeUndefined();
      const poster = probeFile(join(folder, `poster.${asset.revisions.poster}.jpg`));
      expect(poster.streams[0]).toMatchObject({ width: 1080, height: 1920 });
      // The describer saw the web clip by the fs store's URI for it — never the original.
      expect(deps.describer.videoCalls).toEqual([
        `file://${join(folder, `web.${asset.revisions.web}.mp4`)}`,
      ]);

      const trimmed = await trimVideo(deps, { profileId: PID, mediaId: mid, start: 0.5, end: 1.5 });
      expect(trimmed.asset).toMatchObject({ status: "ready", trim: { start: 0.5, end: 1.5 } });
      expect(trimmed.asset.durationSeconds).toBeCloseTo(1, 1);
      expect(trimmed.asset.revisions.web).not.toBe(asset.revisions.web);
      expect(await readdir(folder)).toHaveLength(4);

      const cleared = await clearTrim(deps, { profileId: PID, mediaId: mid });
      expect(cleared.asset).toMatchObject({ status: "ready", width: 1080, height: 1920 });
      expect(cleared.asset.trim).toBeUndefined();
      expect(cleared.asset.durationSeconds).toBeCloseTo(2, 1);
      // Three real transcodes plus two posters; 5 s is not enough on a loaded machine
      // (seen twice under parallel review runs). The budget is generous on purpose.
    }, 60_000);
  },
);

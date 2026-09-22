import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, type CookieReader } from "@/adapters/auth/session";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { SIGN_IN_MESSAGE } from "@/app/actions/_lib/guard";
import {
  beginUploadWith,
  clearTrimWith,
  deleteMediaWith,
  enhancePhotoWith,
  finalizeUploadWith,
  reportUploadEventWith,
  setAltTextWith,
  setFocalPointWith,
  trimVideoWith,
} from "@/app/actions/_lib/media";
import {
  beginUpload,
  clearTrim,
  deleteMedia,
  enhancePhoto,
  finalizeUpload,
  reportUploadEvent,
  setAltText,
  setFocalPoint,
  trimVideo,
} from "@/app/actions/media";
import type { ProfileDocument, PublishedDocument } from "@/core/profile/schema";
import { fixedClock } from "../fakes/clock";
import { createScriptedDescriber } from "../fakes/describer";
import { sequentialIds } from "../fakes/id-source";
import { memoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { createMemoryProfileStore } from "../fakes/profile-store";
import { createScriptedVideoProcessor } from "../fakes/video-processor";
import { ENV, NOW } from "./boundary.helpers";

// The media Server Actions (T019, T020; contracts/server-boundary.md rows `beginUpload`,
// `finalizeUpload`, `setFocalPoint`, `setAltText`, `trimVideo`, `clearTrim`,
// `deleteMedia`): every action validates
// its input, re-checks the session, and answers the one result shape. The pipeline itself
// is pinned in tests/unit/adapters/pipeline; here is the boundary and the named denials.

const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };
const readSession = async (cookies: CookieReader) =>
  cookies.get(SESSION_COOKIE) === undefined ? null : SESSION;
const signedIn = async () => ({ get: () => ({ value: "token" }) });
const signedOut = async () => ({ get: () => undefined });

const PID = "abcdefgh";
const MID = "mmmmmmm2";

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

function mediaDeps() {
  const buckets = createMemoryBuckets();
  return {
    profileStore: createMemoryProfileStore({ buckets }),
    mediaStore: createMemoryMediaStore({ publicBase: "https://cdn.test", buckets }),
    describer: createScriptedDescriber([{ text: "A cat." }]),
    videoProcessor: createScriptedVideoProcessor({}),
    ids: sequentialIds(),
    clock: fixedClock(NOW.toISOString()),
    logger: memoryLogger(),
    readSession,
  };
}

async function seed(deps: ReturnType<typeof mediaDeps>) {
  const doc: ProfileDocument = {
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
  return doc;
}

const BEGIN = { profileId: PID, fileName: "cat.jpg", byteSize: 1000, declaredType: "image/jpeg" };
const FINALIZE = { profileId: PID, mediaId: MID, fileName: "cat.jpg", declaredType: "image/jpeg" };

const INVALID = {
  ok: false,
  error: { code: "invalid", message: expect.stringMatching(/^Invalid data/) },
};
const UNAUTHORIZED = { ok: false, error: { code: "unauthorized", message: SIGN_IN_MESSAGE } };
const TRIM = { profileId: PID, mediaId: MID, start: 0, end: 5 };
const EVENT = {
  profileId: PID,
  mediaId: MID,
  stage: "send" as const,
  outcome: "failed" as const,
  status: 0,
  byteSize: 61_346_637,
  declaredType: "video/quicktime",
  confirmedBytes: 20_000_000,
  attempts: 4,
};
const IPHONE = async () => "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)";

/** A 20 s video record, stored as finalize leaves it: `needs-trim`, nothing produced. */
async function seedLongVideo(deps: ReturnType<typeof mediaDeps>) {
  await deps.mediaStore.putOriginal(PID, MID, fixture("clip-20s.mp4"));
  await deps.mediaStore.writeAsset(PID, MID, {
    schemaVersion: 1,
    id: MID,
    kind: "video",
    fileName: "long.mp4",
    mimeType: "video/mp4",
    bytes: fixture("clip-20s.mp4").byteLength,
    width: 406,
    height: 720,
    originalDurationSeconds: 20,
    focal: { x: 50, y: 50 },
    status: "needs-trim",
    alt: null,
    descriptionStatus: "pending",
    revisions: {},
    createdAt: NOW.toISOString(),
  });
}

describe("media actions — the boundary", () => {
  it("each refuses a malformed input as invalid, naming the field", async () => {
    const deps = mediaDeps();
    expect(await beginUploadWith(deps, { ...BEGIN, byteSize: -1 }, signedIn)).toEqual(INVALID);
    expect(await beginUploadWith(deps, { ...BEGIN, profileId: "../x" }, signedIn)).toMatchObject({
      error: { message: "Invalid data at profileId" },
    });
    expect(await finalizeUploadWith(deps, { ...FINALIZE, mediaId: 7 }, signedIn)).toEqual(INVALID);
    expect(
      await setFocalPointWith(
        deps,
        { profileId: PID, mediaId: MID, focal: { x: 101, y: 0 } },
        signedIn,
      ),
    ).toMatchObject({ error: { message: "Invalid data at focal.x" } });
    expect(
      await setAltTextWith(deps, { profileId: PID, mediaId: MID, text: "" }, signedIn),
    ).toEqual(INVALID);
    expect(
      await setAltTextWith(deps, { profileId: PID, mediaId: MID, text: "x".repeat(301) }, signedIn),
    ).toEqual(INVALID);
    expect(await trimVideoWith(deps, { ...TRIM, start: -1 }, signedIn)).toMatchObject({
      error: { message: "Invalid data at start" },
    });
    expect(await trimVideoWith(deps, { ...TRIM, end: "5" }, signedIn)).toMatchObject({
      error: { message: "Invalid data at end" },
    });
    expect(await trimVideoWith(deps, { ...TRIM, end: Infinity }, signedIn)).toEqual(INVALID);
    expect(await clearTrimWith(deps, { profileId: PID }, signedIn)).toEqual(INVALID);
    expect(await deleteMediaWith(deps, { profileId: PID }, signedIn)).toEqual(INVALID);
    expect(await deleteMediaWith(deps, "not an object", signedIn)).toEqual(INVALID);
    expect(await enhancePhotoWith(deps, { profileId: PID }, signedIn)).toEqual(INVALID);
    expect(await enhancePhotoWith(deps, { profileId: "../x", mediaId: MID }, signedIn)).toEqual(
      INVALID,
    );
  });

  it("each answers unauthorized without a session and touches nothing", async () => {
    const deps = mediaDeps();
    await seed(deps);
    expect(await beginUploadWith(deps, BEGIN, signedOut)).toEqual(UNAUTHORIZED);
    expect(await finalizeUploadWith(deps, FINALIZE, signedOut)).toEqual(UNAUTHORIZED);
    expect(
      await setFocalPointWith(
        deps,
        { profileId: PID, mediaId: MID, focal: { x: 1, y: 1 } },
        signedOut,
      ),
    ).toEqual(UNAUTHORIZED);
    expect(
      await setAltTextWith(deps, { profileId: PID, mediaId: MID, text: "x" }, signedOut),
    ).toEqual(UNAUTHORIZED);
    expect(await trimVideoWith(deps, TRIM, signedOut)).toEqual(UNAUTHORIZED);
    expect(await clearTrimWith(deps, { profileId: PID, mediaId: MID }, signedOut)).toEqual(
      UNAUTHORIZED,
    );
    expect(await deleteMediaWith(deps, { profileId: PID, mediaId: MID }, signedOut)).toEqual(
      UNAUTHORIZED,
    );
    expect(await enhancePhotoWith(deps, { profileId: PID, mediaId: MID }, signedOut)).toEqual(
      UNAUTHORIZED,
    );
    expect(deps.mediaStore.signedUploads).toEqual([]);
    expect(deps.videoProcessor.transcodeCalls).toEqual([]);
  });

  it("the exported actions read Next's cookies: outside a request they answer the generic error", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    vi.stubEnv("LOG_LEVEL", "silent");
    const internal = { error: { code: "internal" } };
    expect(await beginUpload(BEGIN)).toMatchObject(internal);
    expect(await finalizeUpload(FINALIZE)).toMatchObject(internal);
    expect(
      await setFocalPoint({ profileId: PID, mediaId: MID, focal: { x: 1, y: 1 } }),
    ).toMatchObject(internal);
    expect(await setAltText({ profileId: PID, mediaId: MID, text: "x" })).toMatchObject(internal);
    expect(await trimVideo(TRIM)).toMatchObject(internal);
    expect(await clearTrim({ profileId: PID, mediaId: MID })).toMatchObject(internal);
    expect(await deleteMedia({ profileId: PID, mediaId: MID })).toMatchObject(internal);
    expect(await enhancePhoto({ profileId: PID, mediaId: MID })).toMatchObject(internal);
    expect(await reportUploadEvent(EVENT)).toMatchObject(internal);
    vi.unstubAllEnvs();
  });
});

describe("media actions — the happy path and the named denials", () => {
  it("beginUpload answers the id and the signed upload; finalizeUpload the asset and warnings", async () => {
    const deps = mediaDeps();
    await seed(deps);
    const begun = await beginUploadWith(deps, { ...BEGIN, fileName: "small.jpg" }, signedIn);
    expect(begun).toEqual({
      ok: true,
      mediaId: "maaaaaab",
      uploadUrl: `memory://upload/profiles/${PID}/media/maaaaaab/original`,
      method: "PUT",
      headers: {},
    });
    await deps.mediaStore.putOriginal(PID, "maaaaaab", fixture("small.jpg"));
    const done = await finalizeUploadWith(
      deps,
      { ...FINALIZE, mediaId: "maaaaaab", fileName: "small.jpg" },
      signedIn,
    );
    expect(done).toMatchObject({
      ok: true,
      asset: { id: "maaaaaab", status: "ready", alt: { text: "A cat.", source: "model" } },
      warnings: ["That photo is 850px wide — too small for the hero."],
    });
    // The builder is handed the clean photo's URL, never a rev to join itself.
    if (!done.ok) throw new Error(done.error.message);
    expect(done.asset.cleanUrl).toBe(
      deps.mediaStore.publicUrl(PID, "maaaaaab", "clean", done.asset.revisions.clean ?? ""),
    );
    expect(done.asset.posterUrl).toBeUndefined();
    expect(done.asset.webUrl).toBeUndefined();
  });

  it("beginUpload refuses 25 MB + 1 as too_large (413's code) before any store call", async () => {
    const deps = mediaDeps();
    expect(
      await beginUploadWith(deps, { ...BEGIN, byteSize: 25 * 1024 * 1024 + 1 }, signedIn),
    ).toEqual({ ok: false, error: { code: "too_large", message: "That photo is over 25MB." } });
    expect(deps.mediaStore.signedUploads).toEqual([]);
  });

  it("finalizeUpload on a PNG renamed .mp4 is unsupported (422's code) and the object is gone", async () => {
    const deps = mediaDeps();
    await seed(deps);
    await deps.mediaStore.putOriginal(PID, MID, fixture("not-a-video.mp4"));
    expect(
      await finalizeUploadWith(
        deps,
        { ...FINALIZE, fileName: "not-a-video.mp4", declaredType: "video/mp4" },
        signedIn,
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "unsupported",
        message:
          "We can't read that file. Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.",
      },
    });
    expect(await deps.mediaStore.originalSize(PID, MID)).toBeNull();
  });

  it('trimVideo refuses a 0.5 s range with "1 second" and a 16 s range with "15 seconds" (refused, 409\'s code)', async () => {
    const deps = mediaDeps();
    await seed(deps);
    await seedLongVideo(deps);
    expect(await trimVideoWith(deps, { ...TRIM, start: 2, end: 2.5 }, signedIn)).toEqual({
      ok: false,
      error: { code: "refused", message: "A clip must be at least 1 second." },
    });
    expect(await trimVideoWith(deps, { ...TRIM, start: 1, end: 17 }, signedIn)).toEqual({
      ok: false,
      error: { code: "refused", message: "A clip can be at most 15 seconds." },
    });
    expect(deps.videoProcessor.transcodeCalls).toEqual([]);
    expect(deps.describer.videoCalls).toEqual([]);
  });

  it("trimVideo answers the ready asset with the trim; clearTrim answers it back at needs-trim", async () => {
    const deps = {
      ...mediaDeps(),
      videoProcessor: createScriptedVideoProcessor({
        transcode: {
          web: new TextEncoder().encode("web"),
          poster: new TextEncoder().encode("poster"),
          durationSeconds: 5,
          width: 406,
          height: 720,
        },
      }),
    };
    await seed(deps);
    await seedLongVideo(deps);
    const trimmed = await trimVideoWith(deps, TRIM, signedIn);
    expect(trimmed).toMatchObject({
      ok: true,
      asset: {
        status: "ready",
        trim: { start: 0, end: 5 },
        durationSeconds: 5,
        alt: { text: "A cat.", source: "model" },
      },
    });
    expect(deps.describer.videoCalls).toEqual([
      expect.stringMatching(
        /^gs:\/\/memory-public\/profiles\/abcdefgh\/media\/mmmmmmm2\/web\.[0-9a-f]{10}\.mp4$/,
      ),
    ]);
    if (!trimmed.ok) throw new Error(trimmed.error.message);
    const { web, poster } = trimmed.asset.revisions;
    expect(trimmed.asset.webUrl).toBe(deps.mediaStore.publicUrl(PID, MID, "web", web ?? ""));
    expect(trimmed.asset.posterUrl).toBe(
      deps.mediaStore.publicUrl(PID, MID, "poster", poster ?? ""),
    );
    const cleared = await clearTrimWith(deps, { profileId: PID, mediaId: MID }, signedIn);
    expect(cleared).toMatchObject({ ok: true, asset: { status: "needs-trim", revisions: {} } });
    if (!cleared.ok) throw new Error(cleared.error.message);
    expect(cleared.asset.webUrl).toBeUndefined();
    expect(cleared.asset.posterUrl).toBeUndefined();
  });

  it("setFocalPoint and setAltText answer the updated asset; setAltText marks it the volunteer's", async () => {
    const deps = mediaDeps();
    await seed(deps);
    await deps.mediaStore.putOriginal(PID, MID, fixture("cat-1.jpg"));
    await finalizeUploadWith(deps, FINALIZE, signedIn);

    expect(
      await setFocalPointWith(
        deps,
        { profileId: PID, mediaId: MID, focal: { x: 10, y: 90 } },
        signedIn,
      ),
    ).toMatchObject({ ok: true, asset: { focal: { x: 10, y: 90 }, cleanUrl: expect.any(String) } });
    expect(
      await setAltTextWith(
        deps,
        { profileId: PID, mediaId: MID, text: "  Charlotte.  " },
        signedIn,
      ),
    ).toMatchObject({
      ok: true,
      asset: {
        alt: { text: "Charlotte.", source: "volunteer" },
        descriptionStatus: "ready",
        cleanUrl: expect.any(String),
      },
    });
  });

  it("deleteMedia on used media names the cat (refused, 409's code) — live and archived", async () => {
    const deps = mediaDeps();
    const doc = await seed(deps);
    await deps.mediaStore.putOriginal(PID, MID, fixture("cat-1.jpg"));
    const done = await finalizeUploadWith(deps, FINALIZE, signedIn);
    if (!done.ok) throw new Error(done.error.message);
    const published: PublishedDocument = {
      ...doc,
      blocks: [
        { id: "blockaaaaaaa", type: "hero", mediaId: null },
        { id: "blockaaaaaab", type: "photo", mediaId: MID },
      ],
      publishedAt: NOW.toISOString(),
      slug: "charlotte",
      media: {
        [MID]: {
          kind: "photo",
          src: deps.mediaStore.publicUrl(PID, MID, "clean", done.asset.revisions.clean ?? ""),
          alt: "A cat.",
          focal: { x: 50, y: 50 },
          width: done.asset.width,
          height: done.asset.height,
        },
      },
    };

    await deps.profileStore.writePublished(PID, published);
    expect(await deleteMediaWith(deps, { profileId: PID, mediaId: MID }, signedIn)).toEqual({
      ok: false,
      error: {
        code: "refused",
        message: "Charlotte's live page uses this photo. Unpublish first.",
      },
    });
    await deps.profileStore.archive(PID);
    expect(await deleteMediaWith(deps, { profileId: PID, mediaId: MID }, signedIn)).toEqual({
      ok: false,
      error: {
        code: "refused",
        message: "Charlotte's archived page uses this photo. Restore and unpublish first.",
      },
    });
    await deps.profileStore.restore(PID);
    await deps.profileStore.deletePublished(PID);
    expect(await deleteMediaWith(deps, { profileId: PID, mediaId: MID }, signedIn)).toEqual({
      ok: true,
    });
    expect(await deps.mediaStore.listMedia(PID)).toEqual([]);
  });

  it("enhancePhoto on a video is refused (409's code); on an unknown id it's not_found (404's code)", async () => {
    const deps = mediaDeps();
    await seed(deps);
    await seedLongVideo(deps);
    expect(await enhancePhotoWith(deps, { profileId: PID, mediaId: MID }, signedIn)).toEqual({
      ok: false,
      error: { code: "refused", message: "Only a photo can be enhanced." },
    });
    expect(await enhancePhotoWith(deps, { profileId: PID, mediaId: "nnnnnnn2" }, signedIn)).toEqual(
      {
        ok: false,
        error: { code: "not_found", message: "There's no photo or clip with that id." },
      },
    );
  });

  it("enhancePhoto answers a new asset naming the source and auto-v1, with alt and focal copied", async () => {
    const deps = mediaDeps();
    await seed(deps);
    await deps.mediaStore.putOriginal(PID, MID, fixture("dim.jpg"));
    const done = await finalizeUploadWith(deps, FINALIZE, signedIn);
    if (!done.ok) throw new Error(done.error.message);
    await setFocalPointWith(
      deps,
      { profileId: PID, mediaId: MID, focal: { x: 20, y: 80 } },
      signedIn,
    );

    const enhanced = await enhancePhotoWith(deps, { profileId: PID, mediaId: MID }, signedIn);

    expect(enhanced).toMatchObject({
      ok: true,
      asset: {
        kind: "photo",
        status: "ready",
        alt: done.asset.alt,
        focal: { x: 20, y: 80 },
        enhancement: { sourceMediaId: MID, recipe: "auto-v1" },
        cleanUrl: expect.any(String),
      },
    });
    if (!enhanced.ok) throw new Error(enhanced.error.message);
    expect(enhanced.asset.id).not.toBe(MID);
    // The source is untouched — still there, unchanged, to enhance again.
    expect(await deps.mediaStore.readAsset(PID, MID)).toMatchObject({ status: "ready" });
  });
});

describe("reportUploadEvent — the upload's own diagnostics (spec 2026-09-22, §3)", () => {
  it("logs a failure at warn with every field and the phone's user agent, and answers ok", async () => {
    const deps = mediaDeps();
    expect(await reportUploadEventWith(deps, EVENT, signedIn, IPHONE)).toEqual({ ok: true });
    expect(deps.logger.entries).toEqual([
      {
        level: "warn",
        msg: "upload event",
        fields: { ...EVENT, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" },
      },
    ]);
  });

  it("logs a rescue at info", async () => {
    const deps = mediaDeps();
    const rescued = {
      profileId: PID,
      mediaId: MID,
      stage: "start" as const,
      outcome: "resumed" as const,
      status: 201,
      byteSize: 8_905_917,
      declaredType: "video/mp4",
      confirmedBytes: 8_905_917,
      attempts: 2,
    };
    expect(await reportUploadEventWith(deps, rescued, signedIn, IPHONE)).toEqual({ ok: true });
    expect(deps.logger.entries[0]).toMatchObject({ level: "info", fields: rescued });
  });

  it("refuses any field it does not name — a file name or URL can never reach the log", async () => {
    const deps = mediaDeps();
    for (const extra of [
      { fileName: "rain-day.mov" },
      { url: "https://storage.googleapis.com/upload?upload_id=secret" },
    ]) {
      expect(await reportUploadEventWith(deps, { ...EVENT, ...extra }, signedIn, IPHONE)).toEqual(
        INVALID,
      );
    }
    expect(
      await reportUploadEventWith(deps, { ...EVENT, stage: "other" }, signedIn, IPHONE),
    ).toEqual(INVALID);
    expect(await reportUploadEventWith(deps, { ...EVENT, attempts: 0 }, signedIn, IPHONE)).toEqual(
      INVALID,
    );
    expect(
      await reportUploadEventWith(deps, { ...EVENT, mediaId: undefined }, signedIn, IPHONE),
    ).toEqual(INVALID);
    expect(deps.logger.entries.filter((entry) => entry.msg === "upload event")).toEqual([]);
  });

  it("answers unauthorized without a session and logs nothing", async () => {
    const deps = mediaDeps();
    expect(await reportUploadEventWith(deps, EVENT, signedOut, IPHONE)).toEqual(UNAUTHORIZED);
    expect(deps.logger.entries).toEqual([]);
  });

  it("keeps an absurdly long user agent to 300 characters", async () => {
    const deps = mediaDeps();
    await reportUploadEventWith(deps, EVENT, signedIn, async () => "x".repeat(5000));
    expect(deps.logger.entries[0]?.fields.userAgent).toBe("x".repeat(300));
  });
});

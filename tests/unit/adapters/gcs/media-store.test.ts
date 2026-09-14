import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_CACHE_CONTROL,
  SIGNED_UPLOAD_MINUTES,
  createGcsMediaStore,
} from "@/adapters/gcs/media-store";
import { UpstreamError } from "@/core/errors";
import { revOf } from "@/core/media/rev";
import { apiError, createFakeBuckets, gaxiosError } from "../../../fakes/gcs-bucket";

// The GCS MediaStore against the bucket double (T016): the signed-URL shape the reviewer
// checks (V4, 15 minutes, one object, a content-length range), `immutable` on every public
// write with no ACL ever, and the client's failures mapped to the app's errors.

const PID = "abcdefgh";
const MID = "mmmmmmm2";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function setup() {
  const buckets = createFakeBuckets();
  return { buckets, store: createGcsMediaStore(buckets) };
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: number[] = [];
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    chunks.push(...next.value);
  }
  return new TextDecoder().decode(new Uint8Array(chunks));
}

describe("gcs MediaStore signed uploads", () => {
  it("signs a V4 resumable upload for one object, 15 minutes, with a length range", async () => {
    const { store, buckets } = setup();
    const before = Date.now();
    const upload = await store.createSignedUpload(PID, MID, 12345);
    const after = Date.now();

    expect(upload).toEqual({
      url: `https://signed.test/test-private/profiles/${PID}/media/${MID}/original?sig=1`,
      method: "POST",
      // Exactly the headers the signature covers: the client adds `x-goog-resumable: start`
      // for a resumable action, the length range is ours, and the generation-match header
      // (T040 L3) refuses a second upload to the same object. The browser sends all three
      // verbatim.
      headers: {
        "x-goog-resumable": "start",
        "x-goog-content-length-range": "0,12345",
        "x-goog-if-generation-match": "0",
      },
    });
    const [call] = buckets.privateBucket.calls;
    expect(call?.method).toBe("getSignedUrl");
    expect(call?.name).toBe(`profiles/${PID}/media/${MID}/original`);
    const config = call?.args[0] as Record<string, unknown>;
    expect(config).toMatchObject({
      version: "v4",
      action: "resumable",
      extensionHeaders: {
        "x-goog-content-length-range": "0,12345",
        "x-goog-if-generation-match": "0",
      },
    });
    expect(config.contentType).toBeUndefined();
    const lifetime = SIGNED_UPLOAD_MINUTES * 60 * 1000;
    expect(config.expires).toBeGreaterThanOrEqual(before + lifetime);
    expect(config.expires).toBeLessThanOrEqual(after + lifetime);
  });
});

describe("gcs MediaStore public writes", () => {
  it("writes a derived file with immutable cache-control, its content type and no overwrite", async () => {
    const { store, buckets } = setup();
    const rev = await store.writeDerived(PID, MID, "web", bytes("mp4"));
    expect(rev).toBe(revOf(bytes("mp4")));
    expect(buckets.publicBucket.calls).toEqual([
      {
        method: "save",
        name: `profiles/${PID}/media/${MID}/web.${rev}.mp4`,
        args: [
          bytes("mp4"),
          {
            contentType: "video/mp4",
            metadata: { cacheControl: PUBLIC_CACHE_CONTROL },
            preconditionOpts: { ifGenerationMatch: 0 },
            resumable: false,
          },
        ],
      },
    ]);
    expect(PUBLIC_CACHE_CONTROL).toBe("public, max-age=31536000, immutable");
    expect(buckets.privateBucket.calls).toEqual([]);
  });

  it.each([
    ["ApiError with code", apiError],
    ["gaxios error with status", gaxiosError],
  ])(
    "treats a 412 on an existing rev as success (%s) and keeps the first bytes",
    async (_, shape) => {
      const { store, buckets } = setup();
      buckets.publicBucket.preconditionError = shape;
      const rev = await store.writeDerived(PID, MID, "clean", bytes("a"));
      expect(await store.writeDerived(PID, MID, "clean", bytes("a"))).toBe(rev);
      expect(buckets.publicBucket.calls.filter((call) => call.method === "save")).toHaveLength(2);
      expect(await store.readDerived(PID, MID, "clean", rev)).toEqual(bytes("a"));
      expect(await store.readDerived(PID, MID, "poster", rev)).toBeNull();
    },
  );

  it("uses image/jpeg for clean and poster files", async () => {
    const { store, buckets } = setup();
    await store.writeDerived(PID, MID, "clean", bytes("c"));
    await store.writeDerived(PID, MID, "poster", bytes("p"));
    const types = buckets.publicBucket.calls.map(
      (call) => (call.args[1] as { contentType: string }).contentType,
    );
    expect(types).toEqual(["image/jpeg", "image/jpeg"]);
  });

  it("never makes an ACL, makePublic or metadata call", async () => {
    const { store, buckets } = setup();
    await store.writeAsset(PID, MID, { id: MID });
    await store.writeDerived(PID, MID, "poster", bytes("p"));
    await store.listMedia(PID);
    await store.deleteMedia(PID, MID);
    await store.deleteProfileMedia(PID);
    const methods = [...buckets.privateBucket.calls, ...buckets.publicBucket.calls].map(
      (call) => call.method,
    );
    expect(new Set(methods)).toEqual(
      new Set(["createWriteStream", "save", "getFiles", "deleteFiles"]),
    );
  });
});

describe("gcs MediaStore reads", () => {
  it("streams the original after an existence check and reads inclusive ranges", async () => {
    const { store, buckets } = setup();
    await buckets.privateBucket
      .file(`profiles/${PID}/media/${MID}/original`)
      .save(bytes("0123456789"));
    const stream = await store.readOriginal(PID, MID);
    expect(stream).not.toBeNull();
    expect(await drain(stream as ReadableStream<Uint8Array>)).toBe("0123456789");
    expect(await store.readRange(PID, MID, { start: 2, end: 4 })).toEqual(bytes("234"));
    const rangeCall = buckets.privateBucket.calls.find(
      (call) => call.method === "createReadStream" && call.args[0] !== undefined,
    );
    expect(rangeCall?.args).toEqual([{ start: 2, end: 4 }]);
  });

  it("reports a record that is not JSON as an upstream failure", async () => {
    const { store, buckets } = setup();
    await buckets.privateBucket.file(`profiles/${PID}/media/${MID}/asset.json`).save(bytes("{"));
    await expect(store.readAsset(PID, MID)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("answers null for a missing original, record or range", async () => {
    const { store } = setup();
    expect(await store.readOriginal(PID, MID)).toBeNull();
    expect(await store.readRange(PID, MID, { start: 0, end: 1 })).toBeNull();
    expect(await store.readAsset(PID, MID)).toBeNull();
  });

  it("streams a derived range with one getMetadata for the size and one ranged read (F23)", async () => {
    const { store, buckets } = setup();
    const rev = await store.writeDerived(PID, MID, "web", bytes("0123456789"));
    buckets.publicBucket.calls.length = 0;
    const result = await store.readDerivedRange(PID, MID, "web", rev, { start: 2, end: 100 });
    if (result === null || result.stream === null) throw new Error("expected a stream");
    expect(await drain(result.stream)).toBe("23456789");
    expect({ size: result.size, start: result.start, end: result.end }).toEqual({
      size: 10,
      start: 2,
      end: 9,
    });
    expect(buckets.publicBucket.calls.map((call) => [call.method, call.args[0]])).toEqual([
      ["getMetadata", undefined],
      ["createReadStream", { start: 2, end: 9 }],
    ]);
    // A start past the last byte opens no stream at all.
    buckets.publicBucket.calls.length = 0;
    expect(await store.readDerivedRange(PID, MID, "web", rev, { start: 10, end: 11 })).toEqual({
      stream: null,
      size: 10,
    });
    expect(buckets.publicBucket.calls.map((call) => call.method)).toEqual(["getMetadata"]);
  });

  it("opens the object read lazily: a read cancelled before any pull costs one getMetadata (F23 review, 2)", async () => {
    const { store, buckets } = setup();
    const rev = await store.writeDerived(PID, MID, "web", bytes("0123456789"));
    buckets.publicBucket.calls.length = 0;
    // What a `HEAD`, a `304` or a size-only lookup does: take the size, let the stream go.
    const result = await store.readDerivedRange(PID, MID, "web", rev);
    if (result === null || result.stream === null) throw new Error("expected a stream");
    expect(result.size).toBe(10);
    await result.stream.cancel();
    expect(buckets.publicBucket.calls.map((call) => call.method)).toEqual(["getMetadata"]);
    // And the same stream, once read, opens exactly one ranged request.
    buckets.publicBucket.calls.length = 0;
    const read = await store.readDerivedRange(PID, MID, "web", rev, { start: 3, end: 5 });
    if (read === null || read.stream === null) throw new Error("expected a stream");
    expect(buckets.publicBucket.calls.map((call) => call.method)).toEqual(["getMetadata"]);
    expect(await drain(read.stream)).toBe("345");
    expect(buckets.publicBucket.calls.map((call) => [call.method, call.args[0]])).toEqual([
      ["getMetadata", undefined],
      ["createReadStream", { start: 3, end: 5 }],
    ]);
  });

  it("names public URLs by this app's /media route (F23) and gs URIs by the public bucket", () => {
    const { store } = setup();
    // No bucket carries a public grant (domain-restricted-sharing org policies), so the URL
    // a page carries is the same root-relative path the filesystem store answers.
    expect(store.publicUrl(PID, MID, "clean", "0123456789")).toBe(
      `/media/profiles/${PID}/media/${MID}/clean.0123456789.jpg`,
    );
    expect(store.gsUri(PID, MID, "web", "0123456789")).toBe(
      `gs://test-public/profiles/${PID}/media/${MID}/web.0123456789.mp4`,
    );
  });

  it("deletes are prefix deletes on both buckets", async () => {
    const { store, buckets } = setup();
    await store.deleteMedia(PID, MID);
    await store.deleteProfileMedia(PID);
    const prefixes = buckets.publicBucket.calls.map((call) => call.args[0]);
    expect(prefixes).toEqual([
      { prefix: `profiles/${PID}/media/${MID}/` },
      { prefix: `profiles/${PID}/media/` },
    ]);
    expect(buckets.privateBucket.calls.map((call) => call.args[0])).toEqual(prefixes);
  });
});

describe("gcs MediaStore streaming listeners (F36)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function drainWeb(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    for (let next = await reader.read(); !next.done; next = await reader.read());
  }

  it("gives every object read enough headroom for the vendored client's own listeners", async () => {
    const setMaxListeners = vi.spyOn(PassThrough.prototype, "setMaxListeners");
    const { store } = setup();
    const rev = await store.writeDerived(PID, MID, "clean", bytes("0123456789"));
    const result = await store.readDerivedRange(PID, MID, "clean", rev);
    if (result === null || result.stream === null) throw new Error("expected a stream");
    await drainWeb(result.stream);
    expect(setMaxListeners).toHaveBeenCalled();
    const [limit] = setMaxListeners.mock.calls[0] ?? [];
    expect(limit as number).toBeGreaterThan(10);
  });

  it("also raises the ceiling on the raw response stream it re-emits, not just its own (F40 review round 1)", async () => {
    // F36 reached the one `PassThrough` this store gets back from `createReadStream()`
    // ("PT#1"); the warning persisted in production because an upstream one F36's own
    // report already measured ("PT#5", node-fetch's response body) was never reached. The
    // fake's `createReadStream` re-emits `'response'` with a stand-in for that stream, the
    // same way the real client does — this asserts `withHeadroom` raises its ceiling too.
    const setMaxListeners = vi.spyOn(PassThrough.prototype, "setMaxListeners");
    const { store } = setup();
    const rev = await store.writeDerived(PID, MID, "clean", bytes("0123456789"));
    const result = await store.readDerivedRange(PID, MID, "clean", rev);
    if (result === null || result.stream === null) throw new Error("expected a stream");
    await drainWeb(result.stream);
    const raised = setMaxListeners.mock.calls.filter(([limit]) => (limit as number) > 10);
    expect(raised).toHaveLength(2);
  });

  it("opens 15 concurrent derived reads, drains 8 and cancels 7, without a MaxListeners warning", async () => {
    const { store } = setup();
    const rev = await store.writeDerived(PID, MID, "clean", bytes("x".repeat(5000)));
    const warnings: unknown[] = [];
    const onWarning = (warning: unknown): number => warnings.push(warning);
    process.on("warning", onWarning);
    try {
      const results = await Promise.all(
        Array.from({ length: 15 }, () => store.readDerivedRange(PID, MID, "clean", rev)),
      );
      const streams = results.map((result) => result?.stream ?? null);
      const drains = streams.slice(0, 8).map((stream) => stream && drainWeb(stream));
      const cancels = streams.slice(8).map((stream) => stream?.cancel("test"));
      await Promise.all([...drains, ...cancels]);
      // Give any deferred `process.emitWarning` a turn before asserting there was none.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(warnings).toEqual([]);
    } finally {
      process.off("warning", onWarning);
    }
  });

  it("cancelling a derived stream destroys the Node stream it opened", async () => {
    const destroy = vi.spyOn(PassThrough.prototype, "destroy");
    const { store } = setup();
    const rev = await store.writeDerived(PID, MID, "clean", bytes("0123456789"));
    const result = await store.readDerivedRange(PID, MID, "clean", rev);
    if (result === null || result.stream === null) throw new Error("expected a stream");
    const reader = result.stream.getReader();
    await reader.read(); // opens the Node stream (lazyWeb opens on the first pull)
    await reader.cancel("done with it");
    expect(destroy).toHaveBeenCalled();
  });
});

describe("gcs MediaStore document/asset listeners (F53)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Before the fix, `readAsset`/`writeAsset`/`readDerived` went through `.download()`/
  // `.save()`, which never hand the underlying stream back to this store — so `withHeadroom`
  // never reached them, unlike the three streaming-read paths F36 already covers. These are
  // the exact calls `readAssets` makes once per media item on every builder page load,
  // draft save and helper turn (the routes the warning burst on Cloud Run correlated with).
  //
  // On the read side this genuinely raises the ceiling the vendored chain runs into (the
  // returned stream *is* one of the links in it, F36/F40). The write test below only proves
  // `withHeadroom` reaches the `Writable` this store is handed — it is not evidence that
  // writes are protected: the listeners that actually stack on a write live on internal
  // emitters this store has no handle on (`ClientRequest`, the response-body `PassThrough`,
  // `duplexify`'s `Duplexify`; see the comment on `VENDORED_STREAM_MAX_LISTENERS` in
  // `./client` for the measured counts and why `writeAsset` moved off `.save()` anyway —
  // F53 review round 1).

  it("gives a read asset record enough headroom for the vendored client's own listeners", async () => {
    const setMaxListeners = vi.spyOn(PassThrough.prototype, "setMaxListeners");
    const { store } = setup();
    await store.writeAsset(PID, MID, { id: MID });
    setMaxListeners.mockClear();
    await store.readAsset(PID, MID);
    expect(setMaxListeners).toHaveBeenCalled();
    expect(setMaxListeners.mock.calls.every(([limit]) => (limit as number) > 10)).toBe(true);
  });

  it("raises the ceiling on the writable a written asset record is handed (precautionary — see comment above)", async () => {
    const setMaxListeners = vi.spyOn(Writable.prototype, "setMaxListeners");
    const { store } = setup();
    await store.writeAsset(PID, MID, { id: MID });
    expect(setMaxListeners).toHaveBeenCalled();
    expect(setMaxListeners.mock.calls.every(([limit]) => (limit as number) > 10)).toBe(true);
  });

  it("gives a whole-object derived read (view_photos) enough headroom too", async () => {
    const setMaxListeners = vi.spyOn(PassThrough.prototype, "setMaxListeners");
    const { store } = setup();
    const rev = await store.writeDerived(PID, MID, "clean", bytes("0123456789"));
    setMaxListeners.mockClear();
    await store.readDerived(PID, MID, "clean", rev);
    expect(setMaxListeners).toHaveBeenCalled();
    expect(setMaxListeners.mock.calls.every(([limit]) => (limit as number) > 10)).toBe(true);
  });
});

describe("gcs MediaStore failures", () => {
  it("rethrows any other client failure as UpstreamError with the cause attached", async () => {
    const { store, buckets } = setup();
    const boom = apiError(500);
    for (const operation of [
      () => store.createSignedUpload(PID, MID, 1),
      () => store.readOriginal(PID, MID),
      () => store.readRange(PID, MID, { start: 0, end: 1 }),
      () => store.originalSize(PID, MID),
      () => store.readAsset(PID, MID),
      () => store.writeAsset(PID, MID, {}),
      () => store.deleteMedia(PID, MID),
      () => store.listMedia(PID),
    ]) {
      buckets.privateBucket.nextError = boom;
      const failure = operation();
      await expect(failure).rejects.toBeInstanceOf(UpstreamError);
      await expect(failure).rejects.toMatchObject({ cause: boom });
    }
    for (const operation of [
      () => store.writeDerived(PID, MID, "clean", bytes("x")),
      () => store.readDerived(PID, MID, "clean", "0123456789"),
      () => store.readDerivedRange(PID, MID, "clean", "0123456789"),
    ]) {
      buckets.publicBucket.nextError = boom;
      await expect(operation()).rejects.toBeInstanceOf(UpstreamError);
    }
  });
});

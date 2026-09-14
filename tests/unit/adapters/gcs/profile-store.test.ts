import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGcsProfileStore } from "@/adapters/gcs/profile-store";
import { RefusedError, UpstreamError } from "@/core/errors";
import { apiError, createFakeBuckets } from "../../../fakes/gcs-bucket";

// The GCS ProfileStore against the bucket double (T016): what exactly goes to Google —
// the ADR-015 metadata keys, copy-then-delete for archive and restore, one listing and no
// download for `list()` — and how the client's failures come back to the app.

const PID = "abcdefgh";
const META = {
  name: "Charlotte",
  line: "",
  thumbnail: null,
  updatedAt: "2026-09-10T10:00:00.000Z",
};

function setup() {
  const buckets = createFakeBuckets();
  return { buckets, store: createGcsProfileStore(buckets), calls: buckets.privateBucket.calls };
}

describe("gcs ProfileStore writes", () => {
  it("saves the draft as JSON with the three custom metadata keys", async () => {
    // F53: `write` calls `createWriteStream` (headroom, see `client.ts`) rather than
    // `.save()`, so the call the fake records carries only the options — never the bytes,
    // which the real client's caller writes to the stream separately, same as this fake's
    // `createWriteStream` does. What actually landed is asserted off the stored object.
    const { store, calls, buckets } = setup();
    await store.writeDraft(
      PID,
      { v: 1 },
      {
        ...META,
        thumbnail: { mid: "media2aa", rev: "abc1234567" },
      },
    );
    expect(calls).toEqual([
      {
        method: "createWriteStream",
        name: `profiles/${PID}/draft.json`,
        args: [
          {
            contentType: "application/json",
            resumable: false,
            metadata: {
              metadata: {
                name: "Charlotte",
                line: "",
                "thumbnail-media": "media2aa/abc1234567",
                "updated-at": META.updatedAt,
              },
            },
          },
        ],
      },
    ]);
    const stored = buckets.privateBucket.objects.get(`profiles/${PID}/draft.json`);
    expect(stored?.bytes).toEqual(new TextEncoder().encode('{"v":1}'));
  });

  it("leaves thumbnail-media out when the draft has no photo yet", async () => {
    const { store, calls } = setup();
    await store.writeDraft(PID, { v: 1 }, META);
    expect(calls[0]?.args[0]).toMatchObject({
      metadata: { metadata: { name: "Charlotte", "updated-at": META.updatedAt } },
    });
    expect(calls[0]?.args[0]).not.toMatchObject({
      metadata: { metadata: { "thumbnail-media": expect.anything() } },
    });
  });

  it("publishing deletes any archive first, ignoring a missing one", async () => {
    const { store, calls } = setup();
    await store.writePublished(PID, { v: 1 });
    expect(calls.map((call) => [call.method, call.name])).toEqual([
      ["delete", `profiles/${PID}/archived.json`],
      ["createWriteStream", `profiles/${PID}/published.json`],
    ]);
    expect(calls[0]?.args).toEqual([{ ignoreNotFound: true }]);
  });

  it("archive and restore copy server-side, then delete the source", async () => {
    const { store, calls } = setup();
    await store.writePublished(PID, { v: 1 });
    calls.length = 0;

    await store.archive(PID);
    expect(calls.map((call) => [call.method, call.name, call.args])).toEqual([
      ["copy", `profiles/${PID}/published.json`, [`profiles/${PID}/archived.json`]],
      ["delete", `profiles/${PID}/published.json`, [undefined]],
    ]);
    calls.length = 0;

    await store.restore(PID);
    expect(calls.map((call) => [call.method, call.name])).toEqual([
      ["copy", `profiles/${PID}/archived.json`],
      ["delete", `profiles/${PID}/archived.json`],
    ]);
  });

  it("refuses archive and restore when there is nothing to move", async () => {
    const { store } = setup();
    await expect(store.archive(PID)).rejects.toBeInstanceOf(RefusedError);
    await expect(store.restore(PID)).rejects.toBeInstanceOf(RefusedError);
  });

  it("delete is a prefix delete on both buckets", async () => {
    const { store, buckets } = setup();
    await store.delete(PID);
    expect(buckets.privateBucket.calls).toEqual([
      { method: "deleteFiles", args: [{ prefix: `profiles/${PID}/` }] },
    ]);
    expect(buckets.publicBucket.calls).toEqual([
      { method: "deleteFiles", args: [{ prefix: `profiles/${PID}/` }] },
    ]);
  });
});

describe("gcs ProfileStore reads", () => {
  it("list is one listing over profiles/ and downloads nothing", async () => {
    const { store, calls } = setup();
    await store.writeDraft(PID, { v: 1 }, META);
    await store.writePublished(PID, { v: 1 });
    calls.length = 0;

    expect(await store.list()).toEqual([
      {
        pid: PID,
        state: "live",
        name: "Charlotte",
        line: "",
        thumbnail: null,
        updatedAt: META.updatedAt,
      },
    ]);
    expect(calls).toEqual([
      { method: "getFiles", args: [{ prefix: "profiles/", autoPaginate: true }] },
    ]);
  });

  it("ignores metadata values that are not strings", async () => {
    const { store, buckets } = setup();
    await store.writeDraft(PID, { v: 1 }, META);
    const stored = buckets.privateBucket.objects.get(`profiles/${PID}/draft.json`);
    (stored?.options.metadata as { metadata: Record<string, unknown> }).metadata.flag = true;
    expect((await store.list())[0]).toMatchObject({ name: "Charlotte" });
  });

  it("reports a document that is not JSON as an upstream failure", async () => {
    const { store, buckets } = setup();
    await buckets.privateBucket
      .file(`profiles/${PID}/draft.json`)
      .save(new TextEncoder().encode("not json"));
    await expect(store.readDraft(PID)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("a missing document is null; a 404 never becomes an error", async () => {
    const { store } = setup();
    expect(await store.readDraft(PID)).toBeNull();
    expect(await store.readPublished(PID)).toBeNull();
    expect(await store.readArchived(PID)).toBeNull();
    expect(await store.exists(PID)).toBe(false);
  });

  it("listPublished skips a document that vanished between the listing and the read", async () => {
    const { store, buckets } = setup();
    await store.writeDraft(PID, { v: 1 }, META);
    await store.writePublished(PID, { v: 1 });
    buckets.privateBucket.nextError = null;
    const original = buckets.privateBucket.file.bind(buckets.privateBucket);
    buckets.privateBucket.file = (name) => {
      const file = original(name);
      if (name.endsWith("published.json")) {
        // F53: `read` now opens the object through `createReadStream` (headroom, see
        // `client.ts`), not `.download()` — so the race this test simulates (the object is
        // still listed, but gone by the time it's read) is reproduced the same way the
        // fake's own `createReadStream` reports a missing object.
        file.createReadStream = () => {
          const stream = new PassThrough();
          stream._read = () => stream.destroy(apiError(404));
          return stream;
        };
      }
      return file;
    };
    expect(await store.listPublished()).toEqual([]);
  });
});

describe("gcs ProfileStore failures", () => {
  it("rethrows any other client failure as UpstreamError with the cause attached", async () => {
    const { store, buckets } = setup();
    const boom = apiError(503);
    for (const operation of [
      () => store.readDraft(PID),
      () => store.writeDraft(PID, {}, META),
      () => store.writePublished(PID, {}),
      () => store.deletePublished(PID),
      () => store.archive(PID),
      () => store.delete(PID),
      () => store.list(),
      () => store.exists(PID),
    ]) {
      buckets.privateBucket.nextError = boom;
      const failure = operation();
      await expect(failure).rejects.toBeInstanceOf(UpstreamError);
      await expect(failure).rejects.toMatchObject({
        message: "The storage service didn't respond.",
        cause: boom,
      });
    }
  });

  it("archive fails as upstream when the delete after the copy fails", async () => {
    const { store, buckets } = setup();
    await store.writePublished(PID, { v: 1 });
    const original = buckets.privateBucket.file.bind(buckets.privateBucket);
    buckets.privateBucket.file = (name) => {
      const file = original(name);
      file.delete = async () => {
        throw apiError(500);
      };
      return file;
    };
    await expect(store.archive(PID)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("gcs ProfileStore never grants access itself", () => {
  it("makes no ACL, makePublic or metadata call on any object", async () => {
    const { store, buckets } = setup();
    await store.writeDraft(PID, { v: 1 }, META);
    await store.writePublished(PID, { v: 1 });
    await store.archive(PID);
    await store.restore(PID);
    await store.list();
    await store.delete(PID);
    const methods = new Set(buckets.privateBucket.calls.map((call) => call.method));
    expect([...methods].sort()).toEqual([
      "copy",
      "createWriteStream",
      "delete",
      "deleteFiles",
      "getFiles",
    ]);
    expect(buckets.publicBucket.calls.map((call) => call.method)).toEqual(["deleteFiles"]);
  });
});

describe("gcs ProfileStore document listeners (F53)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Before the fix, `read`/`write` went through `.download()`/`.save()`, which never hand
  // the underlying stream back to this store — so it never got the headroom `client.ts`'s
  // `withHeadroom` gives the vendored client's own listeners (F36's finding, extended here
  // to the document, not just the media-stream, paths). This is the document every builder
  // page load, draft save and helper turn reads or writes (`loadDraft`/`saveDraft`), which
  // is what correlated the warning burst with those routes on Cloud Run rather than the
  // media-stream path F36/F40 already fixed.
  //
  // On the read side this genuinely raises the ceiling the vendored chain runs into (the
  // returned stream *is* one of the links in it, F36/F40). The write test below only proves
  // `withHeadroom` reaches the `Writable` this store is handed — it is not evidence that
  // writes are protected: the listeners that actually stack on a write live on internal
  // emitters this store has no handle on (`ClientRequest`, the response-body `PassThrough`,
  // `duplexify`'s `Duplexify`; see the comment on `VENDORED_STREAM_MAX_LISTENERS` in
  // `./client` for the measured counts and why `write` moved off `.save()` anyway — F53
  // review round 1).

  it("gives a document read enough headroom for the vendored client's own listeners", async () => {
    const setMaxListeners = vi.spyOn(PassThrough.prototype, "setMaxListeners");
    const { store } = setup();
    await store.writeDraft(PID, { v: 1 }, META);
    setMaxListeners.mockClear();
    await store.readDraft(PID);
    expect(setMaxListeners).toHaveBeenCalled();
    expect(setMaxListeners.mock.calls.every(([limit]) => (limit as number) > 10)).toBe(true);
  });

  it("raises the ceiling on the writable a document write is handed (precautionary — see comment above)", async () => {
    const setMaxListeners = vi.spyOn(Writable.prototype, "setMaxListeners");
    const { store } = setup();
    await store.writeDraft(PID, { v: 1 }, META);
    expect(setMaxListeners).toHaveBeenCalled();
    expect(setMaxListeners.mock.calls.every(([limit]) => (limit as number) > 10)).toBe(true);
  });
});

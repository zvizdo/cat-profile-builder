import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFsProfileStore } from "@/adapters/fs/profile-store";
import { UpstreamError } from "@/core/errors";

// The filesystem ProfileStore beyond the shared contract (T016): where the bytes land,
// that writes are atomic, that metadata is a sidecar, and that an I/O failure surfaces as
// an UpstreamError rather than a Node error.

const PID = "abcdefgh";
const META = {
  name: "Charlotte",
  line: "",
  thumbnail: null,
  updatedAt: "2026-09-10T10:00:00.000Z",
};

const roots: string[] = [];

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cpb-fs-unit-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("fs ProfileStore layout", () => {
  it("writes the document and its metadata sidecar under private/, nothing else", async () => {
    const root = await freshRoot();
    const store = createFsProfileStore({ root });
    await store.writeDraft(
      PID,
      { v: 1 },
      {
        ...META,
        thumbnail: { mid: "media2aa", rev: "abc1234567" },
      },
    );

    const folder = join(root, "private", "profiles", PID);
    expect((await readdir(folder)).sort()).toEqual(["draft.json", "draft.json.meta.json"]);
    expect(await readFile(join(folder, "draft.json"), "utf8")).toBe('{"v":1}');
    expect(JSON.parse(await readFile(join(folder, "draft.json.meta.json"), "utf8"))).toEqual({
      name: "Charlotte",
      line: "",
      "thumbnail-media": "media2aa/abc1234567",
      "updated-at": META.updatedAt,
    });
  });

  it("leaves no temporary file behind after a write or an overwrite", async () => {
    const root = await freshRoot();
    const store = createFsProfileStore({ root });
    await store.writeDraft(PID, { v: 1 }, META);
    await store.writeDraft(PID, { v: 2 }, META);
    await store.writePublished(PID, { v: 2 });
    const files = await readdir(join(root, "private", "profiles", PID));
    expect(files.filter((file) => file.includes(".tmp-"))).toEqual([]);
    expect(await store.readDraft(PID)).toEqual({ v: 2 });
  });

  it("archive renames the document and its sidecar together", async () => {
    const root = await freshRoot();
    const store = createFsProfileStore({ root });
    await store.writeDraft(PID, { v: 1 }, META);
    await store.writePublished(PID, { v: 1 });
    await store.archive(PID);
    const files = (await readdir(join(root, "private", "profiles", PID))).sort();
    expect(files).toEqual([
      "archived.json",
      "archived.json.meta.json",
      "draft.json",
      "draft.json.meta.json",
    ]);
  });

  it("list skips stray entries under profiles/ that are not profile folders", async () => {
    const root = await freshRoot();
    const store = createFsProfileStore({ root });
    await store.writeDraft(PID, { v: 1 }, META);
    const profiles = join(root, "private", "profiles");
    await writeFile(join(profiles, ".DS_Store"), "noise");
    await mkdir(join(profiles, "not-a-pid"));
    expect((await store.list()).map((row) => row.pid)).toEqual([PID]);
  });

  it("list reads sidecars only: a corrupt document beside a valid sidecar still lists", async () => {
    const root = await freshRoot();
    const store = createFsProfileStore({ root });
    await store.writeDraft(PID, { v: 1 }, META);
    await writeFile(join(root, "private", "profiles", PID, "draft.json"), "{ not json");
    expect(await store.list()).toEqual([
      {
        pid: PID,
        state: "draft",
        name: "Charlotte",
        line: "",
        thumbnail: null,
        updatedAt: META.updatedAt,
      },
    ]);
    await expect(store.readDraft(PID)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("lists nothing before the first write", async () => {
    const store = createFsProfileStore({ root: await freshRoot() });
    expect(await store.list()).toEqual([]);
    expect(await store.listPublished()).toEqual([]);
  });
});

describe("fs ProfileStore failures", () => {
  it("rethrows an I/O failure as UpstreamError with the cause attached", async () => {
    const root = await freshRoot();
    // A regular file where the store expects a folder: every mkdir under it fails.
    await writeFile(join(root, "private"), "not a folder");
    const store = createFsProfileStore({ root });
    const failure = store.writeDraft(PID, { v: 1 }, META);
    await expect(failure).rejects.toBeInstanceOf(UpstreamError);
    await expect(failure).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "ENOTDIR" }),
    });
    await expect(store.readDraft(PID)).rejects.toBeInstanceOf(UpstreamError);
    await expect(store.list()).rejects.toBeInstanceOf(UpstreamError);
  });

  it("reports a folder it cannot read as UpstreamError, not as an empty list", async () => {
    const root = await freshRoot();
    const store = createFsProfileStore({ root });
    await store.writeDraft(PID, { v: 1 }, META);
    const folder = join(root, "private", "profiles", PID);
    await chmod(folder, 0o000);
    try {
      await expect(store.list()).rejects.toBeInstanceOf(UpstreamError);
      await expect(store.exists(PID)).rejects.toBeInstanceOf(UpstreamError);
    } finally {
      await chmod(folder, 0o700);
    }
  });
});

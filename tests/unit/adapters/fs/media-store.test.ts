import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFsMediaStore } from "@/adapters/fs/media-store";
import { UpstreamError } from "@/core/errors";
import { revOf } from "@/core/media/rev";

// The filesystem MediaStore beyond the shared contract (T016): where derived files land,
// that a rev is never rewritten, the dev upload shape, `file://` gs URIs, and I/O failures.

const PID = "abcdefgh";
const MID = "mmmmmmm2";
const roots: string[] = [];

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cpb-fs-media-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("fs MediaStore layout", () => {
  it("writes derived files under public/ and records under private/", async () => {
    const root = await freshRoot();
    const store = createFsMediaStore({ root });
    const rev = await store.writeDerived(PID, MID, "clean", bytes("jpeg"));
    await store.writeAsset(PID, MID, { id: MID });
    await store.putOriginal(PID, MID, bytes("orig"));

    const publicFolder = join(root, "public", "profiles", PID, "media", MID);
    const privateFolder = join(root, "private", "profiles", PID, "media", MID);
    expect(await readdir(publicFolder)).toEqual([`clean.${rev}.jpg`]);
    expect((await readdir(privateFolder)).sort()).toEqual(["asset.json", "original"]);
    expect(await readFile(join(privateFolder, "original"), "utf8")).toBe("orig");
  });

  it("never rewrites a rev that already exists", async () => {
    const root = await freshRoot();
    const store = createFsMediaStore({ root });
    const content = bytes("first");
    const rev = revOf(content);
    const target = join(root, "public", "profiles", PID, "media", MID, `poster.${rev}.jpg`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "planted");

    expect(await store.writeDerived(PID, MID, "poster", content)).toBe(rev);
    expect(await readFile(target, "utf8")).toBe("planted");
  });

  it("points the browser at the dev upload route and the app's /media route", async () => {
    const root = await freshRoot();
    const store = createFsMediaStore({ root });
    expect(await store.createSignedUpload(PID, MID, 10)).toEqual({
      url: `/api/dev-upload/${PID}/${MID}`,
      method: "PUT",
      headers: {},
    });
    // Root-relative: the page that carries it is served by the same app (ADR-015 → Local
    // development), and a published manifest never holds a plain `http:` URL.
    expect(store.publicUrl(PID, MID, "web", "0123456789")).toBe(
      `/media/profiles/${PID}/media/${MID}/web.0123456789.mp4`,
    );
    expect(store.gsUri(PID, MID, "clean", "0123456789")).toBe(
      `file://${join(root, "public", "profiles", PID, "media", MID, "clean.0123456789.jpg")}`,
    );
  });

  it("clamps a range past the end and answers an empty slice past the file", async () => {
    const root = await freshRoot();
    const store = createFsMediaStore({ root });
    await store.putOriginal(PID, MID, bytes("0123456789"));
    expect(await store.readRange(PID, MID, { start: 9, end: 9 })).toEqual(bytes("9"));
    expect(await store.readRange(PID, MID, { start: 20, end: 30 })).toEqual(new Uint8Array());
  });
});

describe("fs MediaStore failures", () => {
  it("rethrows an I/O failure as UpstreamError", async () => {
    const root = await freshRoot();
    await writeFile(join(root, "private"), "not a folder");
    await writeFile(join(root, "public"), "not a folder");
    const store = createFsMediaStore({ root });
    await expect(store.writeAsset(PID, MID, {})).rejects.toBeInstanceOf(UpstreamError);
    await expect(store.readAsset(PID, MID)).rejects.toBeInstanceOf(UpstreamError);
    await expect(store.writeDerived(PID, MID, "clean", bytes("x"))).rejects.toBeInstanceOf(
      UpstreamError,
    );
    await expect(store.readOriginal(PID, MID)).rejects.toBeInstanceOf(UpstreamError);
    await expect(store.listMedia(PID)).rejects.toBeInstanceOf(UpstreamError);
  });
});

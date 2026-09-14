import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeOriginal } from "@/adapters/fs/dev-upload";
import { createFsMediaStore } from "@/adapters/fs/media-store";
import { ProfileInvalidError, RefusedError, TooLargeError } from "@/core/errors";

// The dev-only stand-in for a bucket's signed upload (ADR-015 → Local development): the
// request body streams to `private/<original>` under a byte cap, atomically, so a refused
// or interrupted upload leaves no file behind and a finished one is exactly the bytes sent.

const PID = "abcdefgh";
const MID = "mmmmmmm2";
const roots: string[] = [];

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cpb-dev-upload-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("writeOriginal", () => {
  it("streams the body to the original's path and answers the byte count", async () => {
    const root = await freshRoot();
    expect(await writeOriginal(root, PID, MID, streamOf(["0123", "456", "789"]), 100)).toBe(10);
    const file = join(root, "private", "profiles", PID, "media", MID, "original");
    expect((await readFile(file)).toString()).toBe("0123456789");
    // What the store reads back is what was sent.
    const store = createFsMediaStore({ root });
    expect(await store.originalSize(PID, MID)).toBe(10);
    expect(await readdir(join(root, "private", "profiles", PID, "media", MID))).toEqual([
      "original",
    ]);
  });

  it("accepts exactly the cap and refuses one byte more, leaving nothing behind", async () => {
    const root = await freshRoot();
    expect(await writeOriginal(root, PID, MID, streamOf(["0123456789"]), 10)).toBe(10);
    await rm(join(root, "private"), { recursive: true });

    const failure = writeOriginal(root, PID, MID, streamOf(["0123456789", "x"]), 10);
    await expect(failure).rejects.toBeInstanceOf(TooLargeError);
    await expect(failure).rejects.toMatchObject({ message: "That video is over 200MB." });
    expect(await readdir(join(root, "private", "profiles", PID, "media", MID))).toEqual([]);
  });

  it("cancels the request body when it refuses, so the sender stops streaming", async () => {
    const root = await freshRoot();
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(writeOriginal(root, PID, MID, endless, 2048)).rejects.toBeInstanceOf(
      TooLargeError,
    );
    expect(cancelled).toBe(true);
  });

  it("refuses a request with no body as invalid", async () => {
    const root = await freshRoot();
    await expect(writeOriginal(root, PID, MID, null, 10)).rejects.toBeInstanceOf(
      ProfileInvalidError,
    );
  });

  it("validates the ids before they become a path", async () => {
    const root = await freshRoot();
    await expect(writeOriginal(root, "../x", MID, streamOf(["a"]), 10)).rejects.toBeInstanceOf(
      ProfileInvalidError,
    );
  });

  it("refuses a second write to an already-finalized original with 409, bytes unchanged (F13, T040 L3)", async () => {
    const root = await freshRoot();
    expect(await writeOriginal(root, PID, MID, streamOf(["original"]), 100)).toBe(8);
    const file = join(root, "private", "profiles", PID, "media", MID, "original");
    expect((await readFile(file)).toString()).toBe("original");

    const overwrite = writeOriginal(root, PID, MID, streamOf(["overwrite attempt"]), 100);
    await expect(overwrite).rejects.toBeInstanceOf(RefusedError);
    await expect(overwrite).rejects.toMatchObject({
      message: "That file has already been uploaded.",
    });
    expect((await readFile(file)).toString()).toBe("original");
    // No stray temporary sibling left behind by the refused commit.
    expect(await readdir(join(root, "private", "profiles", PID, "media", MID))).toEqual([
      "original",
    ]);
  });
});

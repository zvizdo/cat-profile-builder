import "server-only";
import { randomBytes } from "node:crypto";
import { link, mkdir, open, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { ProfileInvalidError, RefusedError, TooLargeError } from "@/core/errors";
import { objectName } from "@/core/media/paths";
import { io, isExists, privatePath } from "./layout";

// The one write of an original the app itself ever makes, and only under `STORE=fs`
// (ADR-015 → Local development): the dev upload route lands a browser's PUT here, where a
// bucket would have taken the signed upload. Deliberately not on the `MediaStore` port —
// in production the browser writes to the bucket and the app never touches the bytes.

/** The refusal for a body over `maxBytes`; the largest upload the app accepts is a video's. */
const OVER_CAP = "That video is over 200MB.";

/** The refusal for a second upload once an original has already landed (T040 security review, L3). */
const ALREADY_UPLOADED = "That file has already been uploaded.";

/**
 * Streams `body` to `private/profiles/{pid}/media/{mid}/original` under `root`, refusing
 * once more than `maxBytes` have arrived, and answers the byte count. The bytes go to a
 * temporary sibling, opened exclusively, and are linked into place — not renamed — only
 * when the whole body has landed: `link` fails with `EEXIST` rather than silently replacing
 * an original that is already there, so a second upload to a finalized original is refused
 * (`409 refused`) and its bytes never change (T040 security review, L3). A refused or
 * interrupted upload leaves no file behind. Ids are validated before they become a path; a
 * request with no body is `invalid`.
 */
export async function writeOriginal(
  root: string,
  pid: string,
  mid: string,
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<number> {
  if (body === null) throw new ProfileInvalidError("The request has no body.");
  const file = privatePath(root, objectName(pid, mid, "original"));
  const temporary = `${file}.tmp-${randomBytes(6).toString("hex")}`;
  return io(async () => {
    await mkdir(dirname(file), { recursive: true });
    const handle = await open(temporary, "wx");
    const reader = body.getReader();
    let written = 0;
    let closed = false;
    try {
      for (let next = await reader.read(); !next.done; next = await reader.read()) {
        written += next.value.byteLength;
        if (written > maxBytes) throw new TooLargeError(OVER_CAP);
        await handle.write(next.value);
      }
      await handle.close();
      closed = true;
      await commitOriginal(temporary, file);
    } catch (error) {
      // Tell the sender to stop: a refused body should not keep streaming into nothing.
      await reader.cancel();
      if (!closed) await handle.close();
      await rm(temporary, { force: true });
      throw error;
    }
    return written;
  });
}

/**
 * Moves `temporary` into `file` only if `file` does not exist yet. `link` (unlike `rename`)
 * fails with `EEXIST` when the target is already there, so this either creates the original
 * or refuses without ever touching its existing bytes.
 */
async function commitOriginal(temporary: string, file: string): Promise<void> {
  try {
    await link(temporary, file);
  } catch (error) {
    if (isExists(error)) throw new RefusedError(ALREADY_UPLOADED);
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

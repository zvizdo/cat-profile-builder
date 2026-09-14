import { beginUpload, finalizeUpload } from "@/app/actions/media";
import type { FinalizedUpload } from "@/app/actions/_lib/media";
import type { BeginUploadResult } from "@/adapters/pipeline/begin-upload";
import type { ErrorCode } from "@/core/errors";
import {
  ALLOWED_PHOTO_TYPES,
  ALLOWED_VIDEO_TYPES,
  checkDeclaredSize,
  UNSUPPORTED_MESSAGE,
} from "@/core/media/validation";

// The browser's half of an upload (ADR-005): `beginUpload` judges the size and signs the
// upload, the bytes go straight to that URL with progress, then `finalizeUpload` checks
// them and answers the record. `XMLHttpRequest` moves the bytes because `fetch` reports no
// upload progress. Every rule applied here — accepted types, the two caps, the sentences —
// comes from `core/media/validation`; nothing is judged twice in different words.

/** What the file picker accepts: core's photo and video lists, joined for `accept`. */
export const ACCEPTED_TYPES = [...ALLOWED_PHOTO_TYPES, ...ALLOWED_VIDEO_TYPES].join(",");

/** The toast for bytes that did not arrive (CONTENT.md → Toasts, Error). */
export const UPLOAD_FAILED = "Upload failed. Nothing was added.";

/** Why an upload failed: a server code, or `network` when the bytes never landed. */
export type UploadFailureCode = ErrorCode | "network";

/** An upload that did not finish, with the sentence to show and the code to switch on. */
export class UploadFailure extends Error {
  readonly code: UploadFailureCode;

  constructor(code: UploadFailureCode, message: string) {
    super(message);
    this.name = "UploadFailure";
    this.code = code;
  }
}

/** The outcome of {@link screenFile}: send it, or refuse with core's code and sentence. */
export type FileScreen =
  { ok: true } | { ok: false; code: "unsupported" | "too_large"; message: string };

/**
 * The client-side refusal before `beginUpload` is called (FR-007, FR-008): a declared type
 * outside the accepted lists is `unsupported` with the formats named; a size over the cap
 * of its declared kind is `too_large` naming the cap. A file the browser could not type at
 * all goes through — the server's sniff decides what it is.
 */
export function screenFile(file: Pick<File, "type" | "size">): FileScreen {
  if (file.type !== "" && !ACCEPTED_TYPES.split(",").includes(file.type)) {
    return { ok: false, code: "unsupported", message: UNSUPPORTED_MESSAGE };
  }
  const size = checkDeclaredSize({ declaredType: file.type, byteSize: file.size });
  return size.ok ? size : { ok: false, code: "too_large", message: size.message };
}

interface Request {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: File | null;
  onProgress?: (percent: number) => void;
}

/** One request over XHR; resolves on a 2xx answer, rejects as `network` on anything else. */
function send(request: Request): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(request.method, request.url);
    for (const [name, value] of Object.entries(request.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        request.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new UploadFailure("network", UPLOAD_FAILED));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
      else reject(new UploadFailure("network", UPLOAD_FAILED));
    };
    xhr.send(request.body);
  });
}

/**
 * The bytes to where `beginUpload` said (ADR-005 step 2). A `PUT` goes straight to the
 * URL with the signed headers. A `POST` is a GCS resumable start: sent with the signed
 * headers and no body, it answers a session URL in `Location`, and the bytes are `PUT`
 * there with no extra headers.
 */
async function sendBytes(
  upload: BeginUploadResult,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  if (upload.method === "PUT") {
    await send({
      method: "PUT",
      url: upload.uploadUrl,
      headers: upload.headers,
      body: file,
      onProgress,
    });
    return;
  }
  const started = await send({
    method: "POST",
    url: upload.uploadUrl,
    headers: upload.headers,
    body: null,
  });
  const session = started.getResponseHeader("Location");
  if (session === null) throw new UploadFailure("network", UPLOAD_FAILED);
  await send({ method: "PUT", url: session, headers: {}, body: file, onProgress });
}

/** What one upload needs: the cat, the file, and where to report progress. */
export interface UploadFileInput {
  profileId: string;
  file: File;
  onProgress: (percent: number) => void;
}

/**
 * Begin → bytes → finalize, for one file. Answers the finished record's view and any
 * warnings; throws {@link UploadFailure} with the action's own code and sentence when the
 * server refuses at either end, or `network` with {@link UPLOAD_FAILED} when the bytes did
 * not land. Nothing is retried here — the library offers `Try again`.
 */
export async function uploadFile(input: UploadFileInput): Promise<FinalizedUpload & { ok: true }> {
  const { profileId, file } = input;
  const fileName = file.name;
  const declaredType = file.type;
  const begun = await beginUpload({ profileId, fileName, byteSize: file.size, declaredType });
  if (!begun.ok) throw new UploadFailure(begun.error.code, begun.error.message);
  await sendBytes(begun, file, input.onProgress);
  const done = await finalizeUpload({ profileId, mediaId: begun.mediaId, fileName, declaredType });
  if (!done.ok) throw new UploadFailure(done.error.code, done.error.message);
  return done;
}
